#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, token, Address, Env, IntoVal, Symbol, Vec};

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
    CampaignStats(Symbol),
    CampaignWithdrawals(Symbol),
}

#[contract]
pub struct VaultContract;

#[contractimpl]
impl VaultContract {
    /// Initialize the vault with platform admin, authorized donation contract, and token address.
    pub fn initialize(env: Env, admin: Address, donation_contract: Address, token: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::DonationContract, &donation_contract);
        env.storage().instance().set(&DataKey::Token, &token);
    }

    /// Deposits XLM from the Donation contract for a specific campaign.
    pub fn deposit(env: Env, campaign_id: Symbol, from: Address, amount: i128) {
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

        // Update stats for this specific campaign
        let stats_key = DataKey::CampaignStats(campaign_id.clone());
        let mut stats: VaultStats = env.storage().persistent().get(&stats_key).unwrap_or(VaultStats {
            total_deposited: 0,
            total_withdrawn: 0,
            current_balance: 0,
            deposit_count: 0,
        });

        stats.total_deposited += amount;
        stats.current_balance += amount;
        stats.deposit_count += 1;
        env.storage().persistent().set(&stats_key, &stats);

        // Emit event
        env.events().publish(
            (symbol_short!("deposit"), campaign_id, from),
            amount
        );
    }

    /// Withdraws funds from a specific campaign's vault sub-balance. Only callable by the campaign admin.
    pub fn withdraw(env: Env, campaign_id: Symbol, admin: Address, amount: i128, to: Address) {
        let donation_contract: Address = env
            .storage()
            .instance()
            .get(&DataKey::DonationContract)
            .expect("Vault not initialized");
        
        // Query the donation contract to find the registered admin of this campaign
        let campaign_admin: Address = env.invoke_contract(
            &donation_contract,
            &Symbol::new(&env, "get_campaign_admin"),
            (campaign_id.clone(),).into_val(&env)
        );

        if admin != campaign_admin {
            panic!("Only campaign admin can withdraw");
        }
        admin.require_auth();

        let stats_key = DataKey::CampaignStats(campaign_id.clone());
        let mut stats: VaultStats = env.storage().persistent().get(&stats_key).unwrap_or(VaultStats {
            total_deposited: 0,
            total_withdrawn: 0,
            current_balance: 0,
            deposit_count: 0,
        });

        if amount > stats.current_balance {
            panic!("Insufficient balance");
        }

        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = token::Client::new(&env, &token_addr);

        // Transfer funds from Vault to 'to' address
        token_client.transfer(&env.current_contract_address(), &to, &amount);

        // Record withdrawal
        let record = WithdrawalRecord {
            amount,
            to: to.clone(),
            timestamp: env.ledger().timestamp(),
        };
        
        let withdrawals_key = DataKey::CampaignWithdrawals(campaign_id.clone());
        let mut history: Vec<WithdrawalRecord> = env.storage().persistent().get(&withdrawals_key).unwrap_or(Vec::new(&env));
        history.push_back(record);
        env.storage().persistent().set(&withdrawals_key, &history);

        // Update stats
        stats.total_withdrawn += amount;
        stats.current_balance -= amount;
        env.storage().persistent().set(&stats_key, &stats);

        // Emit event
        env.events().publish(
            (symbol_short!("withdraw"), campaign_id, to),
            amount
        );
    }

    /// Returns the current balance held in the vault for a specific campaign
    pub fn get_campaign_balance(env: Env, campaign_id: Symbol) -> i128 {
        let stats_key = DataKey::CampaignStats(campaign_id);
        let stats: VaultStats = env.storage().persistent().get(&stats_key).unwrap_or(VaultStats {
            total_deposited: 0,
            total_withdrawn: 0,
            current_balance: 0,
            deposit_count: 0,
        });
        stats.current_balance
    }

    /// Returns the withdrawal history for a specific campaign
    pub fn get_campaign_withdrawal_history(env: Env, campaign_id: Symbol) -> Vec<WithdrawalRecord> {
        let withdrawals_key = DataKey::CampaignWithdrawals(campaign_id);
        env.storage().persistent().get(&withdrawals_key).unwrap_or(Vec::new(&env))
    }

    /// Returns statistics for a specific campaign
    pub fn get_campaign_stats(env: Env, campaign_id: Symbol) -> VaultStats {
        let stats_key = DataKey::CampaignStats(campaign_id);
        env.storage().persistent().get(&stats_key).unwrap_or(VaultStats {
            total_deposited: 0,
            total_withdrawn: 0,
            current_balance: 0,
            deposit_count: 0,
        })
    }
}

mod test;
