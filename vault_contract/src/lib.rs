#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, token, Address, Env, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WithdrawalRecord {
    pub amount: i128,
    pub to: Address,
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
    DonationContract,
    Token,
    Stats,
    Withdrawals,
}

#[contract]
pub struct VaultContract;

#[contractimpl]
impl VaultContract {
    /// Initialize the vault with admin, authorized donation contract, and token address.
    pub fn initialize(env: Env, admin: Address, donation_contract: Address, token: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::DonationContract, &donation_contract);
        env.storage().instance().set(&DataKey::Token, &token);

        let stats = VaultStats {
            total_deposited: 0,
            total_withdrawn: 0,
            current_balance: 0,
            deposit_count: 0,
        };
        env.storage().instance().set(&DataKey::Stats, &stats);
        
        let withdrawals: Vec<WithdrawalRecord> = Vec::new(&env);
        env.storage().persistent().set(&DataKey::Withdrawals, &withdrawals);
    }

    /// Deposits XLM from the Donation contract.
    pub fn deposit(env: Env, from: Address, amount: i128) {
        let authorized_contract: Address = env
            .storage()
            .instance()
            .get(&DataKey::DonationContract)
            .expect("Vault not initialized");
        
        // Only the Donation contract can trigger a deposit recorded by this vault
        authorized_contract.require_auth();

        if amount <= 0 {
            panic!("Amount must be positive");
        }

        // Update stats
        let mut stats: VaultStats = env.storage().instance().get(&DataKey::Stats).unwrap();
        stats.total_deposited += amount;
        stats.current_balance += amount;
        stats.deposit_count += 1;
        env.storage().instance().set(&DataKey::Stats, &stats);

        // Emit event
        env.events().publish(
            (symbol_short!("deposit"), from),
            amount
        );
    }

    /// Withdraws funds from the vault. Only callable by admin.
    pub fn withdraw(env: Env, admin: Address, amount: i128, to: Address) {
        let stored_admin: Address = env.storage().instance().get(&DataKey::Admin).expect("Vault not initialized");
        if admin != stored_admin {
            panic!("Only admin can withdraw");
        }
        admin.require_auth();

        let mut stats: VaultStats = env.storage().instance().get(&DataKey::Stats).unwrap();
        if amount > stats.current_balance {
            panic!("Insufficient balance");
        }

        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = token::Client::new(&env, &token_addr);

        // Transfer funds to the destination
        token_client.transfer(&env.current_contract_address(), &to, &amount);

        // Record withdrawal
        let record = WithdrawalRecord {
            amount,
            to: to.clone(),
            timestamp: env.ledger().timestamp(),
        };
        let mut history: Vec<WithdrawalRecord> = env.storage().persistent().get(&DataKey::Withdrawals).unwrap();
        history.push_back(record);
        env.storage().persistent().set(&DataKey::Withdrawals, &history);

        // Update stats
        stats.total_withdrawn += amount;
        stats.current_balance -= amount;
        env.storage().instance().set(&DataKey::Stats, &stats);

        // Emit event
        env.events().publish(
            (symbol_short!("withdraw"), to),
            amount
        );
    }

    /// Returns the total balance held in the vault
    pub fn get_balance(env: Env) -> i128 {
        let stats: VaultStats = env.storage().instance().get(&DataKey::Stats).unwrap_or(VaultStats {
            total_deposited: 0,
            total_withdrawn: 0,
            current_balance: 0,
            deposit_count: 0,
        });
        stats.current_balance
    }

    /// Returns the full withdrawal history
    pub fn get_withdrawal_history(env: Env) -> Vec<WithdrawalRecord> {
        env.storage().persistent().get(&DataKey::Withdrawals).unwrap_or(Vec::new(&env))
    }

    /// Returns current vault statistics
    pub fn get_vault_stats(env: Env) -> VaultStats {
        env.storage().instance().get(&DataKey::Stats).unwrap()
    }
}

mod test;
