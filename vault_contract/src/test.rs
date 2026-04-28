#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, token};

#[test]
fn test_vault_full_flow() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let donation_contract = Address::generate(&env);
    
    // Register Token
    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin).address();
    let token_admin_client = token::StellarAssetClient::new(&env, &token_id);
    let token_client = token::Client::new(&env, &token_id);

    // Register Vault
    let contract_id = env.register_contract(None, VaultContract);
    let client = VaultContractClient::new(&env, &contract_id);

    client.initialize(&admin, &donation_contract, &token_id);

    // 1. Deposit
    // Mint tokens to donation contract, then transfer to vault (simulating real flow)
    token_admin_client.mint(&donation_contract, &1000);
    token_client.transfer(&donation_contract, &contract_id, &600);
    client.deposit(&donation_contract, &600);

    assert_eq!(client.get_balance(), 600);
    let stats = client.get_vault_stats();
    assert_eq!(stats.total_deposited, 600);
    assert_eq!(stats.deposit_count, 1);
    assert_eq!(token_client.balance(&contract_id), 600);

    // 2. Withdrawal
    let receiver = Address::generate(&env);
    client.withdraw(&admin, &200, &receiver);

    assert_eq!(client.get_balance(), 400);
    assert_eq!(token_client.balance(&receiver), 200);
    
    let stats_after = client.get_vault_stats();
    assert_eq!(stats_after.total_withdrawn, 200);
    assert_eq!(stats_after.current_balance, 400);

    // 3. Withdrawal History
    let history = client.get_withdrawal_history();
    assert_eq!(history.len(), 1);
    assert_eq!(history.get(0).unwrap().amount, 200);
    assert_eq!(history.get(0).unwrap().to, receiver);
}

#[test]
#[should_panic(expected = "Insufficient balance")]
fn test_withdraw_insufficient_funds() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let donation_contract = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(Address::generate(&env)).address();
    
    let contract_id = env.register_contract(None, VaultContract);
    let client = VaultContractClient::new(&env, &contract_id);
    client.initialize(&admin, &donation_contract, &token_id);

    client.withdraw(&admin, &100, &Address::generate(&env));
}

#[test]
#[should_panic]
fn test_unauthorized_deposit() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let donation_contract = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(Address::generate(&env)).address();
    
    let contract_id = env.register_contract(None, VaultContract);
    let client = VaultContractClient::new(&env, &contract_id);
    client.initialize(&admin, &donation_contract, &token_id);

    let attacker = Address::generate(&env);
    client.deposit(&attacker, &100);
}
