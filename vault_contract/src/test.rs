#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, Symbol, token};

// Mock Logger Contract (receives calls from vault)
#[contract]
pub struct MockLogger;

#[contractimpl]
impl MockLogger {
    pub fn log_campaign_withdrawal(_env: Env, _admin: Address, _amount: i128) {
        // No-op in tests
    }
}

// Mock Donation Contract
#[contract]
pub struct MockDonationContract;

#[contractimpl]
impl MockDonationContract {
    pub fn initialize(env: Env, admin: Address, logger: Address) {
        env.storage().instance().set(&Symbol::new(&env, "admin"), &admin);
        env.storage().instance().set(&Symbol::new(&env, "logger"), &logger);
    }
    
    pub fn get_campaign_admin(env: Env, _campaign_id: Symbol) -> Address {
        env.storage().instance().get(&Symbol::new(&env, "admin")).unwrap()
    }

    pub fn get_logger(env: Env) -> Address {
        env.storage().instance().get(&Symbol::new(&env, "logger")).unwrap()
    }
}

#[test]
fn test_vault_full_flow() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    
    // Register Mock Donation Contract
    let logger_mock = env.register_contract(None, MockLogger);
    let donation_contract = env.register_contract(None, MockDonationContract);
    let donation_client = MockDonationContractClient::new(&env, &donation_contract);
    donation_client.initialize(&admin, &logger_mock);
    
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
    let logger_mock = env.register_contract(None, MockLogger);
    let donation_contract = env.register_contract(None, MockDonationContract);
    let donation_client = MockDonationContractClient::new(&env, &donation_contract);
    donation_client.initialize(&admin, &logger_mock);

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
    let logger_mock = env.register_contract(None, MockLogger);
    let donation_contract = env.register_contract(None, MockDonationContract);
    let donation_client = MockDonationContractClient::new(&env, &donation_contract);
    donation_client.initialize(&admin, &logger_mock);

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
    let logger_mock = env.register_contract(None, MockLogger);
    let donation_contract = env.register_contract(None, MockDonationContract);
    let donation_client = MockDonationContractClient::new(&env, &donation_contract);
    donation_client.initialize(&admin, &logger_mock);

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
    let logger_mock = env.register_contract(None, MockLogger);
    let donation_contract = env.register_contract(None, MockDonationContract);
    let donation_client = MockDonationContractClient::new(&env, &donation_contract);
    donation_client.initialize(&admin, &logger_mock);

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

// â”€â”€ P2: Multi-Sig Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[test]
fn test_multisig_full_flow() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let logger_mock = env.register_contract(None, MockLogger);
    let donation_contract = env.register_contract(None, MockDonationContract);
    let donation_client = MockDonationContractClient::new(&env, &donation_contract);
    donation_client.initialize(&admin, &logger_mock);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin).address();
    let token_admin_client = token::StellarAssetClient::new(&env, &token_id);
    let token_client = token::Client::new(&env, &token_id);

    let contract_id = env.register_contract(None, VaultContract);
    let client = VaultContractClient::new(&env, &contract_id);
    client.initialize(&admin, &donation_contract, &token_id);

    let campaign_id = Symbol::new(&env, "camp_ms");

    // Set up multi-sig: 3 signers, threshold=2
    let signer1 = Address::generate(&env);
    let signer2 = Address::generate(&env);
    let signer3 = Address::generate(&env);
    let mut signers = soroban_sdk::Vec::new(&env);
    signers.push_back(signer1.clone());
    signers.push_back(signer2.clone());
    signers.push_back(signer3.clone());

    client.set_multisig_config(&campaign_id, &signers, &2);

    // Deposit tokens
    token_admin_client.mint(&donation_contract, &1000);
    token_client.transfer(&donation_contract, &contract_id, &1000);
    client.deposit(&campaign_id, &donation_contract, &1000);

    // Set milestone config so withdrawal is not gated (no milestone config â†’ bypass gating)
    // (campaign has no CampaignVaultConfig, so milestone check is skipped in execute_withdrawal)

    let receiver = Address::generate(&env);

    // Signer1 proposes withdrawal of 500
    let proposal_idx = client.propose_withdrawal(&campaign_id, &signer1, &500, &receiver);
    assert_eq!(proposal_idx, 0);

    // Signer2 co-signs
    client.sign_withdrawal(&campaign_id, &signer2, &proposal_idx);

    // Threshold reached (2 of 2 needed) â€” execute
    client.execute_withdrawal(&campaign_id, &signer1, &proposal_idx);

    // Verify funds moved
    assert_eq!(token_client.balance(&receiver), 500);

    // Verify proposal is marked executed
    let proposal = client.get_proposal(&campaign_id, &proposal_idx).unwrap();
    assert!(proposal.executed);

    // Verify stats updated
    let stats = client.get_campaign_stats(&campaign_id);
    assert_eq!(stats.current_balance, 500);
    assert_eq!(stats.total_withdrawn, 500);
}

#[test]
#[should_panic(expected = "Insufficient approvals to execute")]
fn test_multisig_insufficient_approvals_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let logger_mock = env.register_contract(None, MockLogger);
    let donation_contract = env.register_contract(None, MockDonationContract);
    let donation_client = MockDonationContractClient::new(&env, &donation_contract);
    donation_client.initialize(&admin, &logger_mock);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin).address();
    let token_admin_client = token::StellarAssetClient::new(&env, &token_id);
    let token_client = token::Client::new(&env, &token_id);

    let contract_id = env.register_contract(None, VaultContract);
    let client = VaultContractClient::new(&env, &contract_id);
    client.initialize(&admin, &donation_contract, &token_id);

    let campaign_id = Symbol::new(&env, "camp_ms2");

    let signer1 = Address::generate(&env);
    let signer2 = Address::generate(&env);
    let mut signers = soroban_sdk::Vec::new(&env);
    signers.push_back(signer1.clone());
    signers.push_back(signer2.clone());

    client.set_multisig_config(&campaign_id, &signers, &2);

    token_admin_client.mint(&donation_contract, &500);
    token_client.transfer(&donation_contract, &contract_id, &500);
    client.deposit(&campaign_id, &donation_contract, &500);

    let receiver = Address::generate(&env);
    let proposal_idx = client.propose_withdrawal(&campaign_id, &signer1, &300, &receiver);
    // Should panic: only 1 approval, threshold is 2
    client.execute_withdrawal(&campaign_id, &signer1, &proposal_idx);
}

#[test]
#[should_panic(expected = "Proposer is not a registered signer")]
fn test_multisig_non_signer_propose_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let logger_mock = env.register_contract(None, MockLogger);
    let donation_contract = env.register_contract(None, MockDonationContract);
    let donation_client = MockDonationContractClient::new(&env, &donation_contract);
    donation_client.initialize(&admin, &logger_mock);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin).address();
    let token_admin_client = token::StellarAssetClient::new(&env, &token_id);
    let token_client = token::Client::new(&env, &token_id);

    let contract_id = env.register_contract(None, VaultContract);
    let client = VaultContractClient::new(&env, &contract_id);
    client.initialize(&admin, &donation_contract, &token_id);

    let campaign_id = Symbol::new(&env, "camp_ms3");

    let signer1 = Address::generate(&env);
    let mut signers = soroban_sdk::Vec::new(&env);
    signers.push_back(signer1.clone());

    client.set_multisig_config(&campaign_id, &signers, &1);

    token_admin_client.mint(&donation_contract, &500);
    token_client.transfer(&donation_contract, &contract_id, &500);
    client.deposit(&campaign_id, &donation_contract, &500);

    let attacker = Address::generate(&env);
    let receiver = Address::generate(&env);
    // Should panic: attacker is not a registered signer
    client.propose_withdrawal(&campaign_id, &attacker, &300, &receiver);
}

#[test]
fn test_matching_pool() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let logger_mock = env.register_contract(None, MockLogger);
    let donation_contract = env.register_contract(None, MockDonationContract);
    let donation_client = MockDonationContractClient::new(&env, &donation_contract);
    donation_client.initialize(&admin, &logger_mock);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin).address();
    let token_admin_client = token::StellarAssetClient::new(&env, &token_id);
    let token_client = token::Client::new(&env, &token_id);

    let contract_id = env.register_contract(None, VaultContract);
    let client = VaultContractClient::new(&env, &contract_id);
    client.initialize(&admin, &donation_contract, &token_id);

    let campaign_id = Symbol::new(&env, "camp_match");
    let matcher = Address::generate(&env);

    // Fund the matcher and create a 500-token matching pool
    token_admin_client.mint(&matcher, &500);
    client.fund_matching_pool(&campaign_id, &matcher, &500);

    // Verify pool state
    let pool = client.get_matching_pool(&campaign_id).unwrap();
    assert_eq!(pool.total, 500);
    assert_eq!(pool.used, 0);
    assert!(pool.active);
    // Vault should now hold the 500 matching tokens
    assert_eq!(token_client.balance(&contract_id), 500);

    // Donor makes a 200-token donation (already transferred to vault externally)
    token_admin_client.mint(&donation_contract, &200);
    token_client.transfer(&donation_contract, &contract_id, &200);
    client.deposit(&campaign_id, &donation_contract, &200);

    // Balance should be 200 (deposit) + 200 (matched) = 400
    assert_eq!(client.get_campaign_balance(&campaign_id), 400);
    let stats = client.get_campaign_stats(&campaign_id);
    assert_eq!(stats.total_deposited, 400); // 200 donated + 200 matched
    assert_eq!(stats.deposit_count, 1);

    // Pool used should be 200
    let pool2 = client.get_matching_pool(&campaign_id).unwrap();
    assert_eq!(pool2.used, 200);
    assert_eq!(pool2.total, 500);

    // Second donation: 400 tokens â€” only 300 remaining in pool
    token_admin_client.mint(&donation_contract, &400);
    token_client.transfer(&donation_contract, &contract_id, &400);
    client.deposit(&campaign_id, &donation_contract, &400);

    // Matched: min(400, 300) = 300
    let pool3 = client.get_matching_pool(&campaign_id).unwrap();
    assert_eq!(pool3.used, 500); // pool exhausted
    assert_eq!(client.get_campaign_balance(&campaign_id), 400 + 400 + 300); // 1100

    // Pool is now exhausted but still "active" â€” future deposits get 0 match
    token_admin_client.mint(&donation_contract, &100);
    token_client.transfer(&donation_contract, &contract_id, &100);
    client.deposit(&campaign_id, &donation_contract, &100);
    assert_eq!(client.get_campaign_balance(&campaign_id), 1200); // no new matching

    // Admin can deactivate pool
    client.deactivate_matching_pool(&campaign_id, &admin);
    let pool4 = client.get_matching_pool(&campaign_id).unwrap();
    assert!(!pool4.active);
}



// fmt