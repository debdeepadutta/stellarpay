#![cfg(test)]
use super::*;
use soroban_sdk::Env;

#[test]
fn test_log_donation() {
    let env = Env::default();
    let contract_id = env.register_contract(None, LoggerContract);
    let client = LoggerContractClient::new(&env, &contract_id);

    // Initial value should be 0
    assert_eq!(client.get_last_donation(), 0);

    // Log a donation
    client.log_donation(&100);

    // Check if it was stored
    assert_eq!(client.get_last_donation(), 100);

    // Log another one
    client.log_donation(&250);
    assert_eq!(client.get_last_donation(), 250);
}

#[test]
#[should_panic(expected = "Amount must be positive")]
fn test_log_negative_amount() {
    let env = Env::default();
    let contract_id = env.register_contract(None, LoggerContract);
    let client = LoggerContractClient::new(&env, &contract_id);

    client.log_donation(&-10);
}
