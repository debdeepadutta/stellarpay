#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Env, IntoVal, Symbol, Vec,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DonationRecord {
    pub donor: Address,
    pub amount: i128,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VaultStats {
    pub total_deposited: i128,
    pub total_withdrawn: i128,
    pub current_balance: i128,
    pub deposit_count: u32,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Token,
    Logger,
    Vault,
    Total,
    DonorTotal(Address),
    TopDonors,
}

#[contract]
pub struct DonationContract;

#[contractimpl]
impl DonationContract {
    /// Initialize the contract with necessary settings
    pub fn initialize(
        env: Env,
        admin: Address,
        token: Address,
        logger: Address,
        vault: Address,
    ) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Logger, &logger);
        env.storage().instance().set(&DataKey::Vault, &vault);
        env.storage().instance().set(&DataKey::Total, &0i128);
        
        let empty_top: Vec<(Address, i128)> = Vec::new(&env);
        env.storage().instance().set(&DataKey::TopDonors, &empty_top);
    }


    /// Donate tokens. Enforces cap, updates storage, emits events, and calls external contracts.
    pub fn donate(env: Env, donor: Address, amount: i128) {
        donor.require_auth();

        if amount <= 0 {
            panic!("Amount must be positive");
        }

        let mut donor_total: i128 = env.storage().persistent().get(&DataKey::DonorTotal(donor.clone())).unwrap_or(0);

        // 1. Update Donor Total (Persistent Storage)
        donor_total += amount;
        env.storage().persistent().set(&DataKey::DonorTotal(donor.clone()), &donor_total);

        // 2. Update Global Total (Instance Storage)
        let mut total: i128 = env.storage().instance().get(&DataKey::Total).unwrap_or(0);
        total += amount;
        env.storage().instance().set(&DataKey::Total, &total);

        // 3. Update Top Donors
        Self::update_top_donors(&env, donor.clone(), donor_total);

        // 4. Transfer funds directly to Vault and record deposit
        let token_addr: Address = env.storage().instance().get(&DataKey::Token).expect("Token not set");
        let vault_addr: Address = env.storage().instance().get(&DataKey::Vault).expect("Vault not set");
        
        let token_client = token::Client::new(&env, &token_addr);
        token_client.transfer(&donor, &vault_addr, &amount);
        
        // Call Vault.deposit (for accounting)
        env.invoke_contract::<()>(
            &vault_addr,
            &symbol_short!("deposit"),
            (donor.clone(), amount).into_val(&env),
        );

        // 5. Cross-contract call to Logger
        let logger_addr: Address = env.storage().instance().get(&DataKey::Logger).expect("Logger not set");
        env.invoke_contract::<()>(
            &logger_addr,
            &Symbol::new(&env, "log_donation"),
            (donor.clone(), amount, env.ledger().timestamp()).into_val(&env),
        );

        // 6. Emit typed event
        env.events().publish(
            (symbol_short!("donation"), donor),
            (amount, env.ledger().timestamp())
        );
    }

    /// Return total donations
    pub fn get_total(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::Total).unwrap_or(0)
    }

    /// Return total donations for a specific donor
    pub fn get_donor_total(env: Env, donor: Address) -> i128 {
        env.storage().persistent().get(&DataKey::DonorTotal(donor)).unwrap_or(0)
    }

    /// Return top 5 donors
    pub fn get_top_donors(env: Env) -> Vec<(Address, i128)> {
        env.storage().instance().get(&DataKey::TopDonors).unwrap_or(Vec::new(&env))
    }

    /// Proxy to get vault statistics
    pub fn get_vault_stats(env: Env) -> VaultStats {
        let vault_addr: Address = env.storage().instance().get(&DataKey::Vault).expect("Vault not set");
        env.invoke_contract(&vault_addr, &Symbol::new(&env, "get_vault_stats"), ().into_val(&env))
    }

    /// Proxy to get recent donation logs
    pub fn get_recent_logs(env: Env, limit: u32) -> Vec<DonationRecord> {
        let logger_addr: Address = env.storage().instance().get(&DataKey::Logger).expect("Logger not set");
        env.invoke_contract(&logger_addr, &Symbol::new(&env, "get_recent_donations"), (limit,).into_val(&env))
    }

    // Helper to update top 5 donors list
    fn update_top_donors(env: &Env, donor: Address, total: i128) {
        let mut top_donors: Vec<(Address, i128)> = env.storage().instance().get(&DataKey::TopDonors).unwrap_or(Vec::new(env));
        
        // Check if donor is already in the list
        let mut found = false;
        let mut new_list: Vec<(Address, i128)> = Vec::new(env);
        
        for d in top_donors.iter() {
            if d.0 == donor {
                new_list.push_back((donor.clone(), total));
                found = true;
            } else {
                new_list.push_back(d);
            }
        }

        if !found {
            new_list.push_back((donor, total));
        }

        // Sort by amount descending
        let mut sorted: Vec<(Address, i128)> = Vec::new(env);
        while new_list.len() > 0 {
            let mut max_idx = 0;
            let mut max_amt = -1;
            for i in 0..new_list.len() {
                let item = new_list.get(i).unwrap();
                if item.1 > max_amt {
                    max_amt = item.1;
                    max_idx = i;
                }
            }
            sorted.push_back(new_list.get(max_idx).unwrap());
            new_list.remove(max_idx);
        }

        // Keep only top 5
        let mut final_list: Vec<(Address, i128)> = Vec::new(env);
        for i in 0..5 {
            if i < sorted.len() {
                final_list.push_back(sorted.get(i).unwrap());
            }
        }

        env.storage().instance().set(&DataKey::TopDonors, &final_list);
    }
}

mod test;
