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
    pub fn deposit(env: Env, _from: Address, _amount: i128) {
        // Mock deposit logic
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
fn test_top_donors() {
    let env = Env::default();
    env.mock_all_auths();

    let (admin, token_id, logger, vault, _, token_admin_client, client) = setup_test(&env);
    client.initialize(&admin, &token_id, &logger, &vault);

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

