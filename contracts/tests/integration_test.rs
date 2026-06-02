#![cfg(test)]
use soroban_sdk::{testutils::{Address as _, Ledger}, Address, Env, Symbol, token};
use donation_contract::{DonationContract, DonationContractClient};
use logger_contract::{LoggerContract, LoggerContractClient};
use vault_contract::{VaultContract, VaultContractClient};

/// Helper to setup all 3 contracts and a test token
fn setup_test(env: &Env) -> (Address, Address, Address, Address, token::Client, token::StellarAssetClient, DonationContractClient, LoggerContractClient, VaultContractClient) {
    let admin = Address::generate(env);
    
    // 1. Deploy Logger
    let logger_id = env.register_contract(None, LoggerContract);
    let logger_client = LoggerContractClient::new(env, &logger_id);
    
    // 2. Deploy Vault
    let vault_id = env.register_contract(None, VaultContract);
    let vault_client = VaultContractClient::new(env, &vault_id);
    
    // 3. Deploy Donation Contract
    let donation_id = env.register_contract(None, DonationContract);
    let donation_client = DonationContractClient::new(env, &donation_id);
    
    // 4. Setup Token
    let token_admin = Address::generate(env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin).address();
    let token_client = token::Client::new(env, &token_id);
    let token_admin_client = token::StellarAssetClient::new(env, &token_id);
    
    // 5. Initialize All
    donation_client.initialize(&admin, &token_id, &logger_id, &vault_id);
    logger_client.initialize(&donation_id);
    vault_client.initialize(&admin, &donation_id, &token_id);
    
    (admin, token_id, logger_id, vault_id, token_client, token_admin_client, donation_client, logger_client, vault_client)
}

#[test]
fn test_full_donation_flow_end_to_end() {
    let env = Env::default();
    env.mock_all_auths();
    
    let (admin, _token_id, _logger_id, vault_id, token_client, token_admin_client, donation_client, logger_client, vault_client) = setup_test(&env);
    
    let campaign_id = Symbol::new(&env, "camp_1");
    donation_client.create_campaign(&campaign_id, &admin, &1000);

    let d1 = Address::generate(&env);
    let d2 = Address::generate(&env);
    let d3 = Address::generate(&env);
    
    token_admin_client.mint(&d1, &1000);
    token_admin_client.mint(&d2, &1000);
    token_admin_client.mint(&d3, &1000);
    
    // Prove: Multiple donors can contribute and funds are moved to Vault
    donation_client.donate(&campaign_id, &d1, &100);
    donation_client.donate(&campaign_id, &d2, &500);
    donation_client.donate(&campaign_id, &d3, &300);
    
    // Verify Vault Balance
    let vault_stats = vault_client.get_campaign_stats(&campaign_id);
    assert_eq!(vault_stats.current_balance, 900);
    assert_eq!(token_client.balance(&vault_id), 900);
    
    // Verify Logger Records
    let history = logger_client.get_all_donations();
    assert_eq!(history.len(), 3);
    assert_eq!(history.get(0).unwrap().amount, 100);
    assert_eq!(history.get(1).unwrap().amount, 500);
    assert_eq!(history.get(2).unwrap().amount, 300);
    
    // Verify Leaderboard (d2, d3, d1)
    let top = donation_client.get_campaign_top_donors(&campaign_id);
    assert_eq!(top.get(0).unwrap().0, d2);
    assert_eq!(top.get(1).unwrap().0, d3);
    assert_eq!(top.get(2).unwrap().0, d1);
}

#[test]
#[should_panic]
fn test_edge_case_unauthorized_logger_call() {
    let env = Env::default();
    let (_admin, _token_id, _, _, _, _, _, logger_client, _) = setup_test(&env);
    
    let attacker = Address::generate(&env);
    // Prove: Random address cannot log directly
    logger_client.log_donation(&attacker, &100, &0);
}

#[test]
#[should_panic(expected = "Only campaign admin can withdraw")]
fn test_edge_case_unauthorized_vault_withdrawal() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _token_id, _, _, _, _, donation_client, _, vault_client) = setup_test(&env);
    
    let campaign_id = Symbol::new(&env, "camp_1");
    donation_client.create_campaign(&campaign_id, &admin, &1000);

    let attacker = Address::generate(&env);
    // Prove: Non-admin cannot withdraw
    vault_client.withdraw(&campaign_id, &attacker, &100, &attacker);
}

#[test]
#[should_panic(expected = "Amount must be positive")]
fn test_edge_case_zero_donation() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _token_id, _, _, _, _, donation_client, _, _) = setup_test(&env);
    
    let campaign_id = Symbol::new(&env, "camp_1");
    donation_client.create_campaign(&campaign_id, &admin, &1000);

    let donor = Address::generate(&env);
    // Prove: Zero amount is rejected
    donation_client.donate(&campaign_id, &donor, &0);
}

#[test]
fn test_admin_functions() {
    let env = Env::default();
    env.mock_all_auths();
    let (admin, _token_id, _, _, token_client, token_admin_client, donation_client, _, vault_client) = setup_test(&env);
    
    let campaign_id = Symbol::new(&env, "camp_1");
    donation_client.create_campaign(&campaign_id, &admin, &3000);

    let donor = Address::generate(&env);
    token_admin_client.mint(&donor, &2000);
    donation_client.donate(&campaign_id, &donor, &2000); // Should succeed
    assert_eq!(donation_client.get_campaign_donor_total(&campaign_id, &donor), 2000);
    
    // 2. Vault Withdrawal
    let receiver = Address::generate(&env);
    vault_client.withdraw(&campaign_id, &admin, &500, &receiver);
    
    let vault_stats = vault_client.get_campaign_stats(&campaign_id);
    assert_eq!(vault_stats.current_balance, 1500);
    assert_eq!(token_client.balance(&receiver), 500);
    
    assert_eq!(vault_stats.total_withdrawn, 500);
}
