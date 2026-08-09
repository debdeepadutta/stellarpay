#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env, String, Symbol};

#[test]
fn test_sbt_mint_and_retrieve() {
    let env = Env::default();
    env.mock_all_auths();

    let minter = Address::generate(&env);
    let donor = Address::generate(&env);

    let contract_id = env.register_contract(None, SbtContract);
    let client = SbtContractClient::new(&env, &contract_id);

    client.initialize(&minter);

    let campaign_id = Symbol::new(&env, "camp1");
    let category = Symbol::new(&env, "environment");

    // Mint a receipt
    let receipt_id = client.mint(&donor, &campaign_id, &500_000_000i128, &category);
    assert_eq!(receipt_id, 0);

    // Retrieve the receipt
    let receipt = client.get_receipt(&receipt_id).unwrap();
    assert_eq!(receipt.id, 0);
    assert_eq!(receipt.donor, donor);
    assert_eq!(receipt.amount, 500_000_000i128);

    // Donor's receipt list
    let ids = client.get_donor_receipts(&donor);
    assert_eq!(ids.len(), 1);
    assert_eq!(ids.get(0).unwrap(), 0u64);

    // Mint a second receipt
    let campaign2 = Symbol::new(&env, "camp2");
    let receipt_id2 = client.mint(&donor, &campaign2, &1_000_000_000i128, &category);
    assert_eq!(receipt_id2, 1);

    // Total count
    assert_eq!(client.get_receipt_count(), 2);

    // Donor now has 2 receipts
    let ids2 = client.get_donor_receipts(&donor);
    assert_eq!(ids2.len(), 2);
}

#[test]
#[should_panic(expected = "Amount must be positive")]
fn test_sbt_zero_amount_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let minter = Address::generate(&env);
    let donor = Address::generate(&env);

    let contract_id = env.register_contract(None, SbtContract);
    let client = SbtContractClient::new(&env, &contract_id);
    client.initialize(&minter);

    let campaign_id = Symbol::new(&env, "camp1");
    let category = Symbol::new(&env, "general");

    client.mint(&donor, &campaign_id, &0i128, &category);
}


// fmt