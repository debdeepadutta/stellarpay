#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::{Address as _, Events, Ledger}, Address, Env, IntoVal, Symbol, token};

// Mock Logger Contract
#[contract]
pub struct MockLogger;

#[contractimpl]
impl MockLogger {
    pub fn log_donation(env: Env, _donor: Address, _amount: i128, _admin: Address, _timestamp: u64) {
        // Just emit an event to verify it was called
        env.events().publish((Symbol::new(&env, "logger_called"),), ());
    }

    pub fn log_campaign_creation(env: Env, _admin: Address) {
        env.events().publish((Symbol::new(&env, "logger_called_creation"),), ());
    }
}

// Mock Vault Contract
#[contract]
pub struct MockVault;

#[contractimpl]
impl MockVault {
    pub fn deposit(env: Env, _campaign_id: Symbol, _from: Address, _amount: i128) {
        // Mock deposit logic
    }

    pub fn set_campaign_vault_config(
        env: Env,
        _campaign_id: Symbol,
        _goal: i128,
        _milestones: Vec<u32>,
        _verifier: Address,
    ) {
        // Mock setup logic
    }
}

fn setup_test(env: &Env) -> (Address, Address, Address, Address, token::Client<'_>, token::StellarAssetClient<'_>, DonationContractClient<'_>) {
    let admin = Address::generate(env);
    let vault = env.register_contract(None, MockVault);
    let logger = env.register_contract(None, MockLogger);

    // Register Token
    let token_admin = Address::generate(env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin).address();
    let token_client = token::Client::new(env, &token_id);
    let token_admin_client = token::StellarAssetClient::new(env, &token_id);

    // Register Donation Contract
    let contract_id = env.register_contract(None, DonationContract);
    let client = DonationContractClient::new(env, &contract_id);

    (admin, token_id, logger, vault, token_client, token_admin_client, client)
}

#[test]
fn test_donation_flow() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, token_id, logger, vault, token_client, token_admin_client, client) = setup_test(&env);

    // Initialize
    client.initialize(&admin, &token_id, &logger, &vault);

    let campaign_id = Symbol::new(&env, "campaign_1");
    let verifier = Address::generate(&env);
    let mut milestones = Vec::new(&env);
    milestones.push_back(25);
    milestones.push_back(50);
    milestones.push_back(75);
    milestones.push_back(100);
    let category = Symbol::new(&env, "education");
    client.create_campaign(&campaign_id, &admin, &1000, &milestones, &verifier, &category);

    let donor = Address::generate(&env);
    token_admin_client.mint(&donor, &2000);

    // 1. Successful Donation
    client.donate(&campaign_id, &donor, &500);

    assert_eq!(client.get_campaign_total(&campaign_id), 500);
    assert_eq!(client.get_campaign_donor_total(&campaign_id, &donor), 500);
    assert_eq!(token_client.balance(&donor), 1500);

    // 2. Second Donation (Cumulative)
    client.donate(&campaign_id, &donor, &300);
    assert_eq!(client.get_campaign_total(&campaign_id), 800);
    assert_eq!(client.get_campaign_donor_total(&campaign_id, &donor), 800);
}


#[test]
fn test_top_donors() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, token_id, logger, vault, _, token_admin_client, client) = setup_test(&env);
    client.initialize(&admin, &token_id, &logger, &vault);

    let campaign_id = Symbol::new(&env, "campaign_1");
    let verifier = Address::generate(&env);
    let mut milestones = Vec::new(&env);
    milestones.push_back(25);
    let category = Symbol::new(&env, "education");
    client.create_campaign(&campaign_id, &admin, &2000, &milestones, &verifier, &category);

    let d1 = Address::generate(&env);
    let d2 = Address::generate(&env);
    let d3 = Address::generate(&env);
    let d4 = Address::generate(&env);
    let d5 = Address::generate(&env);
    let d6 = Address::generate(&env);

    let donors = [(&d1, 100), (&d2, 500), (&d3, 300), (&d4, 1000), (&d5, 50), (&d6, 800)];

    for (donor, amt) in donors.iter() {
        token_admin_client.mint(donor, amt);
        client.donate(&campaign_id, donor, amt);
    }

    let top = client.get_campaign_top_donors(&campaign_id);
    assert_eq!(top.len(), 5);
    
    // Top 5 should be: d4 (1000), d6 (800), d2 (500), d3 (300), d1 (100)
    assert_eq!(top.get(0).unwrap().1, 1000);
    assert_eq!(top.get(1).unwrap().1, 800);
    assert_eq!(top.get(2).unwrap().1, 500);
    assert_eq!(top.get(3).unwrap().1, 300);
    assert_eq!(top.get(4).unwrap().1, 100);
}

#[test]
fn test_sbt_integration_flow() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, token_id, logger, vault, token_client, token_admin_client, client) = setup_test(&env);
    client.initialize(&admin, &token_id, &logger, &vault);

    // Deploy and initialize SBT contract
    let sbt_id = env.register_contract(None, sbt_contract::SbtContract);
    let sbt_client = sbt_contract::SbtContractClient::new(&env, &sbt_id);
    // SBT contract minter is the donation contract
    sbt_client.initialize(&client.address);

    // Register SBT contract in Donation contract
    client.set_sbt_contract(&sbt_id);

    let campaign_id = Symbol::new(&env, "camp_sbt");
    let verifier = Address::generate(&env);
    let mut milestones = Vec::new(&env);
    milestones.push_back(50);
    let category = Symbol::new(&env, "environment");
    client.create_campaign(&campaign_id, &admin, &1000, &milestones, &verifier, &category);

    // Make a donation
    let donor = Address::generate(&env);
    token_admin_client.mint(&donor, &500);
    client.donate(&campaign_id, &donor, &500);

    // Verify SBT receipt was minted!
    let receipts = sbt_client.get_donor_receipts(&donor);
    assert_eq!(receipts.len(), 1);
    let receipt_id = receipts.get(0).unwrap();
    let receipt = sbt_client.get_receipt(&receipt_id).unwrap();
    assert_eq!(receipt.donor, donor);
    assert_eq!(receipt.campaign_id, campaign_id);
    assert_eq!(receipt.amount, 500);
    assert_eq!(receipt.category, category);
}

#[test]
fn test_subscription_flow() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, _token_id, _logger, vault, token_client, token_admin_client, client) = setup_test(&env);
    client.initialize(&admin, &_token_id, &_logger, &vault);

    let campaign_id = Symbol::new(&env, "camp_sub");
    let verifier = Address::generate(&env);
    let mut milestones = Vec::new(&env);
    milestones.push_back(100);
    client.create_campaign(&campaign_id, &admin, &1000, &milestones, &verifier, &Symbol::new(&env, "tech"));

    let donor = Address::generate(&env);
    let relayer = Address::generate(&env);
    token_admin_client.mint(&donor, &1000);

    // Setup subscription: 100 XLM, every 3600 seconds (1 hour)
    client.subscribe(&campaign_id, &donor, &100, &3600, &relayer);

    // Approve the contract to spend the donor's tokens
    token_client.approve(&donor, &client.address, &1000, &200000);

    // Advance time by 3601 seconds
    env.ledger().set_timestamp(3601);

    // Trigger subscription (simulating the relayer calling it)
    client.trigger_subscription_donation(&campaign_id, &donor);

    assert_eq!(client.get_campaign_total(&campaign_id), 100);
    assert_eq!(token_client.balance(&donor), 900);
}

#[test]
#[should_panic(expected = "Too early")]
fn test_subscription_too_early() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _token_id, _logger, vault, _token_client, token_admin_client, client) = setup_test(&env);
    client.initialize(&admin, &_token_id, &_logger, &vault);

    let campaign_id = Symbol::new(&env, "camp_sub2");
    let verifier = Address::generate(&env);
    let mut milestones = Vec::new(&env);
    milestones.push_back(100);
    client.create_campaign(&campaign_id, &admin, &1000, &milestones, &verifier, &Symbol::new(&env, "tech"));

    let donor = Address::generate(&env);
    let relayer = Address::generate(&env);
    token_admin_client.mint(&donor, &1000);

    // Subscribe
    env.ledger().set_timestamp(1000);
    client.subscribe(&campaign_id, &donor, &100, &3600, &relayer);

    // Trigger immediately (should panic because 1000 < 4600)
    client.trigger_subscription_donation(&campaign_id, &donor);
}

#[test]
fn test_deactivate_campaign() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, _token_id, _logger, vault, _token_client, _token_admin_client, client) = setup_test(&env);
    client.initialize(&admin, &_token_id, &_logger, &vault);

    let campaign_id = Symbol::new(&env, "camp_deact");
    let verifier = Address::generate(&env);
    let mut milestones = Vec::new(&env);
    milestones.push_back(100);
    client.create_campaign(&campaign_id, &admin, &1000, &milestones, &verifier, &Symbol::new(&env, "tech"));

    // Deactivate it
    client.deactivate_campaign(&campaign_id, &admin);

    // Verify it is inactive
    let info = client.get_campaign_info(&campaign_id).unwrap();
    assert_eq!(info.status, Symbol::new(&env, "inactive"));
}

#[test]
#[should_panic(expected = "Campaign is inactive")]
fn test_donate_to_inactive_campaign_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, _token_id, _logger, vault, _token_client, token_admin_client, client) = setup_test(&env);
    client.initialize(&admin, &_token_id, &_logger, &vault);

    let campaign_id = Symbol::new(&env, "camp_deact2");
    let verifier = Address::generate(&env);
    let mut milestones = Vec::new(&env);
    milestones.push_back(100);
    client.create_campaign(&campaign_id, &admin, &1000, &milestones, &verifier, &Symbol::new(&env, "tech"));

    // Deactivate it
    client.deactivate_campaign(&campaign_id, &admin);

    // Try to donate (should panic)
    let donor = Address::generate(&env);
    token_admin_client.mint(&donor, &500);
    client.donate(&campaign_id, &donor, &500);
}



// fmt