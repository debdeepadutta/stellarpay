#![cfg(test)]
use super::*;
use soroban_sdk::testutils::Events;
use soroban_sdk::{Env};

#[test]
fn test_donation() {
    let env = Env::default();
    let contract_id = env.register_contract(None, DonationContract);
    let client = DonationContractClient::new(&env, &contract_id);

    // Initial total should be 0
    assert_eq!(client.get_total(), 0);

    // First donation
    let total = client.donate(&100);
    assert_eq!(total, 100);
    assert_eq!(client.get_total(), 100);

    // Second donation
    client.donate(&50);
    assert_eq!(client.get_total(), 150);

    // Check events
    let events = env.events().all();
    assert_eq!(events.len(), 2);
}

#[test]
#[should_panic(expected = "Amount must be positive")]
fn test_negative_donation() {
    let env = Env::default();
    let contract_id = env.register_contract(None, DonationContract);
    let client = DonationContractClient::new(&env, &contract_id);

    client.donate(&-1);
}
