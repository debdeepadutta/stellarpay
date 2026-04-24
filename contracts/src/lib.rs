#![no_std]
use soroban_sdk::{contract, contractimpl, symbol_short, Env, Symbol};

#[contract]
pub struct DonationContract;

const TOTAL_AMOUNT: Symbol = symbol_short!("TOTAL");

#[contractimpl]
impl DonationContract {
    /// Donate a specific amount. The total is incremented and a 'donate' event is emitted.
    pub fn donate(env: Env, amount: i128) -> i128 {
        if amount <= 0 {
            panic!("Amount must be positive");
        }

        // Get current total or 0 if not set
        let mut total: i128 = env.storage().instance().get(&TOTAL_AMOUNT).unwrap_or(0);
        
        // Increment total
        total += amount;

        // Save back to storage
        env.storage().instance().set(&TOTAL_AMOUNT, &total);

        // Emit a donation event
        env.events().publish(
            (symbol_short!("donate"),), // Topics
            amount                      // Data
        );

        total
    }

    /// Return the current total donations
    pub fn get_total(env: Env) -> i128 {
        env.storage().instance().get(&TOTAL_AMOUNT).unwrap_or(0)
    }
}

mod test;
