#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, Vec};

#[test]
fn test_logger_full_flow() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, LoggerContract);
    let client = LoggerContractClient::new(&env, &contract_id);

    let donation_contract = Address::generate(&env);
    client.initialize(&donation_contract);

    let d1 = Address::generate(&env);
    let d2 = Address::generate(&env);

    // 1. Log donations (authorized as donation_contract)
    client.log_donation(&d1, &100, &1000);
    client.log_donation(&d2, &200, &2000);
    client.log_donation(&d1, &300, &3000);

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

    // 5. Check recent donations
    let recent = client.get_recent_donations(&2);
    assert_eq!(recent.len(), 2);
    assert_eq!(recent.get(0).unwrap().amount, 200);
    assert_eq!(recent.get(1).unwrap().amount, 300);
}

#[test]
#[should_panic(expected = "Already initialized")]
fn test_already_initialized() {
    let env = Env::default();
    let contract_id = env.register_contract(None, LoggerContract);
    let client = LoggerContractClient::new(&env, &contract_id);

    let donation_contract = Address::generate(&env);
    client.initialize(&donation_contract);
    client.initialize(&donation_contract);
}

#[test]
#[should_panic] // Authentication will fail because we didn't mock auth for the correct address or it's not authorized
fn test_unauthorized_log() {
    let env = Env::default();
    // env.mock_all_auths(); // If we don't mock all auths, we can test specific failures

    let contract_id = env.register_contract(None, LoggerContract);
    let client = LoggerContractClient::new(&env, &contract_id);

    let donation_contract = Address::generate(&env);
    client.initialize(&donation_contract);

    let attacker = Address::generate(&env);
    // Attacker tries to log
    client.log_donation(&attacker, &100, &1000);
}
