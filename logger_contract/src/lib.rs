#![no_std]
use soroban_sdk::{contract, contractimpl, symbol_short, Env, Symbol};

#[contract]
pub struct LoggerContract;

const LAST_DONATION: Symbol = symbol_short!("LAST_AMT");

#[contractimpl]
impl LoggerContract {
    /// Logs a donation amount and stores it as the last donation.
    pub fn log_donation(env: Env, amount: i128) {
        if amount <= 0 {
            panic!("Amount must be positive");
        }

        // Store the last donation amount in instance storage
        env.storage().instance().set(&LAST_DONATION, &amount);

        // Emit an event
        // Topic: "log", Data: amount
        env.events().publish(
            (symbol_short!("log"),), 
            amount
        );
    }

    /// Returns the last logged donation amount
    pub fn get_last_donation(env: Env) -> i128 {
        env.storage().instance().get(&LAST_DONATION).unwrap_or(0)
    }
}

mod test;
