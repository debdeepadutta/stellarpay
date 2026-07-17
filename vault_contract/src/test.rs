#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, Symbol, token};

// Mock Donation Contract
#[contract]
pub struct MockDonationContract;

#[contractimpl]
impl MockDonationContract {
    pub fn initialize(env: Env, admin: Address) {
        env.storage().instance().set(&Symbol::new(&env, "admin"), &admin);
    }
    
    pub fn get_campaign_admin(env: Env, _campaign_id: Symbol) -> Address {
        env.storage().instance().get(&Symbol::new(&env, "admin")).unwrap()
    }
}

#[test]
fn test_vault_full_flow() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    
    // Register Mock Donation Contract
    let donation_contract = env.register_contract(None, MockDonationContract);
    let donation_client = MockDonationContractClient::new(&env, &donation_contract);
    donation_client.initialize(&admin);
    
    // Register Token
    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin).address();
    let token_admin_client = token::StellarAssetClient::new(&env, &token_id);
    let token_client = token::Client::new(&env, &token_id);

    // Register Vault
    let contract_id = env.register_contract(None, VaultContract);
    let client = VaultContractClient::new(&env, &contract_id);

    client.initialize(&admin, &donation_contract, &token_id);

    let campaign_id = Symbol::new(&env, "camp_1");

    // 1. Deposit
    // Mint tokens to donation contract, then transfer to vault (simulating real flow)
    token_admin_client.mint(&donation_contract, &1000);
    token_client.transfer(&donation_contract, &contract_id, &600);
    client.deposit(&campaign_id, &donation_contract, &600);

    assert_eq!(client.get_campaign_balance(&campaign_id), 600);
    let stats = client.get_campaign_stats(&campaign_id);
    assert_eq!(stats.total_deposited, 600);
    assert_eq!(stats.deposit_count, 1);
    assert_eq!(token_client.balance(&donation_contract), 400);

    // 2. Withdrawal
    let receiver = Address::generate(&env);
    client.withdraw(&campaign_id, &admin, &200, &receiver);

    assert_eq!(client.get_campaign_balance(&campaign_id), 400);
    assert_eq!(token_client.balance(&receiver), 200);
    
    let stats_after = client.get_campaign_stats(&campaign_id);
    assert_eq!(stats_after.total_withdrawn, 200);
    assert_eq!(stats_after.current_balance, 400);

    // 3. Withdrawal History
    let history = client.get_campaign_withdrawal_history(&campaign_id);
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
    let donation_contract = env.register_contract(None, MockDonationContract);
    let donation_client = MockDonationContractClient::new(&env, &donation_contract);
    donation_client.initialize(&admin);

    let token_id = env.register_stellar_asset_contract_v2(Address::generate(&env)).address();
    
    let contract_id = env.register_contract(None, VaultContract);
    let client = VaultContractClient::new(&env, &contract_id);
    client.initialize(&admin, &donation_contract, &token_id);

    let campaign_id = Symbol::new(&env, "camp_1");
    client.withdraw(&campaign_id, &admin, &100, &Address::generate(&env));
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

    let campaign_id = Symbol::new(&env, "camp_1");
    let attacker = Address::generate(&env);
    client.deposit(&campaign_id, &attacker, &100);
}

#[test]
fn test_milestone_fund_release_success() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let donation_contract = env.register_contract(None, MockDonationContract);
    let donation_client = MockDonationContractClient::new(&env, &donation_contract);
    donation_client.initialize(&admin);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin).address();
    let token_admin_client = token::StellarAssetClient::new(&env, &token_id);
    let token_client = token::Client::new(&env, &token_id);

    let contract_id = env.register_contract(None, VaultContract);
    let client = VaultContractClient::new(&env, &contract_id);
    client.initialize(&admin, &donation_contract, &token_id);

    let campaign_id = Symbol::new(&env, "camp_1");

    // Set configuration
    let verifier = Address::generate(&env);
    let mut milestones = soroban_sdk::Vec::new(&env);
    milestones.push_back(25);
    milestones.push_back(50);
    milestones.push_back(75);
    milestones.push_back(100);

    // Goal: 1000 XLM
    client.set_campaign_vault_config(&campaign_id, &1000, &milestones, &verifier);

    // Mint/deposit 1000 XLM
    token_admin_client.mint(&donation_contract, &1000);
    token_client.transfer(&donation_contract, &contract_id, &1000);
    client.deposit(&campaign_id, &donation_contract, &1000);

    let receiver = Address::generate(&env);

    // Approve first milestone (25% -> 250 cap)
    client.approve_milestone(&campaign_id, &verifier, &25);

    // Withdrawal within 250 should succeed
    client.withdraw(&campaign_id, &admin, &200, &receiver);
    assert_eq!(token_client.balance(&receiver), 200);
}

#[test]
#[should_panic(expected = "Amount exceeds approved milestone cap")]
fn test_milestone_fund_release_no_approval_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let donation_contract = env.register_contract(None, MockDonationContract);
    let donation_client = MockDonationContractClient::new(&env, &donation_contract);
    donation_client.initialize(&admin);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin).address();
    let token_admin_client = token::StellarAssetClient::new(&env, &token_id);
    let token_client = token::Client::new(&env, &token_id);

    let contract_id = env.register_contract(None, VaultContract);
    let client = VaultContractClient::new(&env, &contract_id);
    client.initialize(&admin, &donation_contract, &token_id);

    let campaign_id = Symbol::new(&env, "camp_1");

    // Set configuration
    let verifier = Address::generate(&env);
    let mut milestones = soroban_sdk::Vec::new(&env);
    milestones.push_back(25);

    client.set_campaign_vault_config(&campaign_id, &1000, &milestones, &verifier);

    token_admin_client.mint(&donation_contract, &1000);
    token_client.transfer(&donation_contract, &contract_id, &1000);
    client.deposit(&campaign_id, &donation_contract, &1000);

    let receiver = Address::generate(&env);
    // Should panic because milestone is not approved yet
    client.withdraw(&campaign_id, &admin, &100, &receiver);
}

#[test]
#[should_panic(expected = "Amount exceeds approved milestone cap")]
fn test_milestone_fund_release_exceed_cap_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let donation_contract = env.register_contract(None, MockDonationContract);
    let donation_client = MockDonationContractClient::new(&env, &donation_contract);
    donation_client.initialize(&admin);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin).address();
    let token_admin_client = token::StellarAssetClient::new(&env, &token_id);
    let token_client = token::Client::new(&env, &token_id);

    let contract_id = env.register_contract(None, VaultContract);
    let client = VaultContractClient::new(&env, &contract_id);
    client.initialize(&admin, &donation_contract, &token_id);

    let campaign_id = Symbol::new(&env, "camp_1");

    // Set configuration
    let verifier = Address::generate(&env);
    let mut milestones = soroban_sdk::Vec::new(&env);
    milestones.push_back(25);

    client.set_campaign_vault_config(&campaign_id, &1000, &milestones, &verifier);

    token_admin_client.mint(&donation_contract, &1000);
    token_client.transfer(&donation_contract, &contract_id, &1000);
    client.deposit(&campaign_id, &donation_contract, &1000);

    let receiver = Address::generate(&env);
    client.approve_milestone(&campaign_id, &verifier, &25);
    // Should panic because 300 exceeds 25% (250)
    client.withdraw(&campaign_id, &admin, &300, &receiver);
}
