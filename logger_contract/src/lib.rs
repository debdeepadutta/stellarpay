#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Symbol, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DonationRecord {
    pub donor: Address,
    pub amount: i128,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    History,
    DonationContract,
}

#[contract]
pub struct LoggerContract;

#[contractimpl]
impl LoggerContract {
    /// Initialize the logger with the authorized donation contract address
    pub fn initialize(env: Env, donation_contract: Address) {
        if env.storage().instance().has(&DataKey::DonationContract) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&DataKey::DonationContract, &donation_contract);
        
        let empty_history: Vec<DonationRecord> = Vec::new(&env);
        env.storage().persistent().set(&DataKey::History, &empty_history);
    }

    /// Logs a donation. Only callable by the authorized donation contract.
    pub fn log_donation(env: Env, donor: Address, amount: i128, timestamp: u64) {
        let authorized_contract: Address = env
            .storage()
            .instance()
            .get(&DataKey::DonationContract)
            .expect("Logger not initialized");
        
        // Ensure the caller is the authorized donation contract
        authorized_contract.require_auth();

        if amount <= 0 {
            panic!("Amount must be positive");
        }

        let record = DonationRecord {
            donor: donor.clone(),
            amount,
            timestamp,
        };

        // Append to history
        let mut history: Vec<DonationRecord> = env
            .storage()
            .persistent()
            .get(&DataKey::History)
            .unwrap_or(Vec::new(&env));
        
        history.push_back(record.clone());
        env.storage().persistent().set(&DataKey::History, &history);

        // Emit event
        env.events().publish(
            (symbol_short!("log"), donor),
            (amount, timestamp)
        );
    }

    /// Returns the full donation history
    pub fn get_all_donations(env: Env) -> Vec<DonationRecord> {
        env.storage().persistent().get(&DataKey::History).unwrap_or(Vec::new(&env))
    }

    /// Returns all donations made by a specific wallet
    pub fn get_donor_history(env: Env, donor: Address) -> Vec<DonationRecord> {
        let history: Vec<DonationRecord> = env
            .storage()
            .persistent()
            .get(&DataKey::History)
            .unwrap_or(Vec::new(&env));
        
        let mut donor_history: Vec<DonationRecord> = Vec::new(&env);
        for record in history.iter() {
            if record.donor == donor {
                donor_history.push_back(record);
            }
        }
        donor_history
    }

    /// Returns the total number of donations made
    pub fn get_donation_count(env: Env) -> u32 {
        let history: Vec<DonationRecord> = env
            .storage()
            .persistent()
            .get(&DataKey::History)
            .unwrap_or(Vec::new(&env));
        history.len()
    }

    /// Returns the most recent N donations
    pub fn get_recent_donations(env: Env, limit: u32) -> Vec<DonationRecord> {
        let history: Vec<DonationRecord> = env
            .storage()
            .persistent()
            .get(&DataKey::History)
            .unwrap_or(Vec::new(&env));
        
        let mut recent: Vec<DonationRecord> = Vec::new(&env);
        let len = history.len();
        let start = if len > limit { len - limit } else { 0 };
        
        for i in start..len {
            recent.push_back(history.get(i).unwrap());
        }
        recent
    }
}

mod test;
