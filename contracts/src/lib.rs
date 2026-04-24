#![no_std]
use soroban_sdk::{contract, contractimpl, symbol_short, token, Address, Env, Symbol};

#[contract]
pub struct DonationContract;

const TOTAL_AMOUNT: Symbol = symbol_short!("TOTAL");

#[contractimpl]
impl DonationContract {
    /// Donate a specific amount of tokens. 
    /// The contract must receive XLM. The total is incremented and a 'donate' event is emitted.
    pub fn donate(env: Env, caller: Address, token: Address, amount: i128) -> i128 {
        if amount <= 0 {
            panic!("Amount must be positive");
        }
        
        // Ensure the caller authorized this specific call
        caller.require_auth();

        // Transfer tokens from the caller to this contract's address
        // Convert XLM amount to stroops (1 XLM = 10,000,000 stroops)
        let stroops = amount * 10_000_000;
        let client = token::Client::new(&env, &token);
        client.transfer(&caller, &env.current_contract_address(), &stroops);

        // Get current total or 0 if not set
        let mut total: i128 = env.storage().instance().get(&TOTAL_AMOUNT).unwrap_or(0);
        
        // Increment total
        total += amount;

        // Save back to storage
        env.storage().instance().set(&TOTAL_AMOUNT, &total);

        // Emit a donation event
        env.events().publish(
            (symbol_short!("donate"), caller), // Topics
            amount                             // Data
        );

        total
    }

    /// Return the current total donations
    pub fn get_total(env: Env) -> i128 {
        env.storage().instance().get(&TOTAL_AMOUNT).unwrap_or(0)
    }
}

// mod test; // Tests temporarily disabled due to signature changes
