#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String};

#[test]
fn test_logger_full_flow() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, LoggerContract);
    let client = LoggerContractClient::new(&env, &contract_id);

    let donation_contract = Address::generate(&env);
    let vault_contract = Address::generate(&env);
    let admin = Address::generate(&env);
    client.initialize(&donation_contract, &vault_contract, &admin);

    let d1 = Address::generate(&env);
    let d2 = Address::generate(&env);

    let admin1 = Address::generate(&env);

    // 1. Log donations (authorized as donation_contract)
    client.log_donation(&d1, &100, &admin1, &1000);
    client.log_donation(&d2, &200, &admin1, &2000);
    client.log_donation(&d1, &300, &admin1, &3000);

    // 2. Check count
    assert_eq!(client.get_donation_count(), 3);

    // 3. Check all donations
    let all = client.get_all_donations();
    assert_eq!(all.len(), 3);
    assert_eq!(all.get(0).unwrap().amount, 100);
    assert_eq!(all.get(2).unwrap().donor, d1);

    // 4. Check donor history
    let d1_history = client.get_donor_history(&d1);
    assert_eq!(d1_history.len(), 2);
    assert_eq!(d1_history.get(0).unwrap().amount, 100);
    assert_eq!(d1_history.get(1).unwrap().amount, 300);

    let recent = client.get_recent_donations(&2);
    assert_eq!(recent.len(), 2);
    assert_eq!(recent.get(0).unwrap().amount, 200);
    assert_eq!(recent.get(1).unwrap().amount, 300);

    // 6. Test Admin Reputation
    let rep = client.get_admin_reputation(&admin1);
    assert_eq!(rep.total_funds_raised, 600);
    
    client.log_campaign_creation(&admin1);
    let rep2 = client.get_admin_reputation(&admin1);
    assert_eq!(rep2.campaigns_created, 1);
}

#[test]
fn test_flag_and_resolve_campaign() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, LoggerContract);
    let client = LoggerContractClient::new(&env, &contract_id);

    let donation_contract = Address::generate(&env);
    let vault_contract = Address::generate(&env);
    let admin = Address::generate(&env);
    client.initialize(&donation_contract, &vault_contract, &admin);

    let campaign_id = soroban_sdk::Symbol::new(&env, "camp1");
    let reason = String::from_str(&env, "Suspicious activity: rapid repeated micro-donations");

    // Not flagged initially
    assert!(!client.is_flagged(&campaign_id));

    // Admin flags the campaign
    client.flag_campaign(&campaign_id, &reason, &admin);

    // Now it's flagged
    assert!(client.is_flagged(&campaign_id));
    let flags = client.get_campaign_flags(&campaign_id);
    assert_eq!(flags.len(), 1);
    assert!(!flags.get(0).unwrap().resolved);

    // Admin resolves the flag
    client.resolve_flags(&campaign_id, &admin);
    assert!(!client.is_flagged(&campaign_id));
    let flags2 = client.get_campaign_flags(&campaign_id);
    assert!(flags2.get(0).unwrap().resolved);
}

#[test]
#[should_panic(expected = "Already initialized")]
fn test_already_initialized() {
    let env = Env::default();
    let contract_id = env.register_contract(None, LoggerContract);
    let client = LoggerContractClient::new(&env, &contract_id);

    let donation_contract = Address::generate(&env);
    let vault_contract = Address::generate(&env);
    let admin = Address::generate(&env);
    client.initialize(&donation_contract, &vault_contract, &admin);
    client.initialize(&donation_contract, &vault_contract, &admin);
}

#[test]
#[should_panic]
fn test_unauthorized_log() {
    let env = Env::default();
    let contract_id = env.register_contract(None, LoggerContract);
    let client = LoggerContractClient::new(&env, &contract_id);

    let donation_contract = Address::generate(&env);
    let vault_contract = Address::generate(&env);
    let admin = Address::generate(&env);
    client.initialize(&donation_contract, &vault_contract, &admin);

    let attacker = Address::generate(&env);
    let campaign_admin = Address::generate(&env);
    client.log_donation(&attacker, &100, &campaign_admin, &1000);
}
