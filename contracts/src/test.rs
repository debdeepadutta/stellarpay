#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::{Address as _, Events}, Address, Env, IntoVal, Symbol, token};

// Mock Logger Contract
#[contract]
pub struct MockLogger;

#[contractimpl]
impl MockLogger {
    pub fn log_donation(env: Env, _donor: Address, _amount: i128, _timestamp: u64) {
        // Just emit an event to verify it was called
        env.events().publish((Symbol::new(&env, "logger_called"),), ());
    }
}

// Mock Vault Contract
#[contract]
pub struct MockVault;

#[contractimpl]
impl MockVault {
    pub fn deposit(env: Env, from: Address, amount: i128) {
        // Find token from storage (mocking the Vault's behavior)
        // Actually, in the test setup, we know the token.
        // For simplicity, we'll just use the token::Client if we can.
        // But we don't have the token address here easily unless we store it.
        
        // Alternatively, since this is a mock, we can just skip the balance check 
        // in the test, but the user might want to see the tokens moving.
    }
}

fn setup_test(env: &Env) -> (Address, Address, Address, Address, token::Client, token::StellarAssetClient, DonationContractClient) {
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
    client.initialize(&admin, &token_id, &logger, &vault, &1000);

    let donor = Address::generate(&env);
    token_admin_client.mint(&donor, &2000);

    // 1. Successful Donation
    client.donate(&donor, &500);

    assert_eq!(client.get_total(), 500);
    assert_eq!(client.get_donor_total(&donor), 500);
    assert_eq!(token_client.balance(&donor), 1500);

    // 2. Second Donation (Cumulative)
    client.donate(&donor, &300);
    assert_eq!(client.get_total(), 800);
    assert_eq!(client.get_donor_total(&donor), 800);
}

#[test]
#[should_panic(expected = "Donation exceeds per-wallet cap")]
fn test_cap_enforcement() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, token_id, logger, vault, _, token_admin_client, client) = setup_test(&env);
    client.initialize(&admin, &token_id, &logger, &vault, &100);

    let donor = Address::generate(&env);
    token_admin_client.mint(&donor, &1000);
    
    client.donate(&donor, &50);
    client.donate(&donor, &60); // Total 110 > 100
}

#[test]
fn test_top_donors() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, token_id, logger, vault, _, token_admin_client, client) = setup_test(&env);
    client.initialize(&admin, &token_id, &logger, &vault, &2000);

    let d1 = Address::generate(&env);
    let d2 = Address::generate(&env);
    let d3 = Address::generate(&env);
    let d4 = Address::generate(&env);
    let d5 = Address::generate(&env);
    let d6 = Address::generate(&env);

    let donors = [(&d1, 100), (&d2, 500), (&d3, 300), (&d4, 1000), (&d5, 50), (&d6, 800)];

    for (donor, amt) in donors.iter() {
        token_admin_client.mint(donor, amt);
        client.donate(donor, amt);
    }

    let top = client.get_top_donors();
    assert_eq!(top.len(), 5);
    
    // Top 5 should be: d4 (1000), d6 (800), d2 (500), d3 (300), d1 (100)
    assert_eq!(top.get(0).unwrap().1, 1000);
    assert_eq!(top.get(1).unwrap().1, 800);
    assert_eq!(top.get(2).unwrap().1, 500);
    assert_eq!(top.get(3).unwrap().1, 300);
    assert_eq!(top.get(4).unwrap().1, 100);
}

#[test]
fn test_set_donation_cap() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, token_id, logger, vault, _, token_admin_client, client) = setup_test(&env);
    client.initialize(&admin, &token_id, &logger, &vault, &1000);

    // Change cap
    client.set_donation_cap(&admin, &2000);
    
    let donor = Address::generate(&env);
    token_admin_client.mint(&donor, &1500);
    client.donate(&donor, &1500);
    
    assert_eq!(client.get_donor_total(&donor), 1500);
}

#[test]
#[should_panic(expected = "Only admin can change cap")]
fn test_set_cap_unauthorized() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, token_id, logger, vault, _, _, client) = setup_test(&env);
    client.initialize(&admin, &token_id, &logger, &vault, &1000);

    let attacker = Address::generate(&env);
    client.set_donation_cap(&attacker, &5000);
}
