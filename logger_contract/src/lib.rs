#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, String, Symbol, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DonationRecord {
    pub donor: Address,
    pub amount: i128,
    pub timestamp: u64,
}

/// A compliance flag raised against a campaign.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FlagRecord {
    pub campaign_id: Symbol,
    pub reason: String,      // human-readable reason code
    pub flagged_by: Address, // compliance officer who raised the flag
    pub timestamp: u64,
    pub resolved: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminReputation {
    pub campaigns_created: u32,
    pub total_funds_raised: i128,
    pub total_funds_withdrawn: i128,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    History,
    DonationContract,
    VaultContract,           // authorized vault contract
    Admin,                   // platform admin who can flag/resolve
    CampaignFlags(Symbol),   // Vec<FlagRecord> per campaign
    FlagCount,               // global flag count for quick access
    AdminRep(Address),       // AdminReputation per admin
}

#[contract]
pub struct LoggerContract;

#[contractimpl]
impl LoggerContract {
    /// Initialize the logger with the authorized donation contract, vault contract, and platform admin.
    pub fn initialize(env: Env, donation_contract: Address, vault_contract: Address, admin: Address) {
        if env.storage().instance().has(&DataKey::DonationContract) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&DataKey::DonationContract, &donation_contract);
        env.storage().instance().set(&DataKey::VaultContract, &vault_contract);
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::FlagCount, &0u32);
        
        let empty_history: Vec<DonationRecord> = Vec::new(&env);
        env.storage().persistent().set(&DataKey::History, &empty_history);
    }

    /// Log the creation of a new campaign by an admin
    pub fn log_campaign_creation(env: Env, admin: Address) {
        let authorized_contract: Address = env
            .storage()
            .instance()
            .get(&DataKey::DonationContract)
            .expect("Logger not initialized");
        authorized_contract.require_auth();

        let key = DataKey::AdminRep(admin.clone());
        let mut rep: AdminReputation = env.storage().persistent().get(&key).unwrap_or(AdminReputation {
            campaigns_created: 0,
            total_funds_raised: 0,
            total_funds_withdrawn: 0,
        });

        rep.campaigns_created += 1;
        env.storage().persistent().set(&key, &rep);
    }

    /// Logs a donation. Only callable by the authorized donation contract.
    pub fn log_donation(env: Env, donor: Address, amount: i128, admin: Address, timestamp: u64) {
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

        // Update admin reputation
        let rep_key = DataKey::AdminRep(admin.clone());
        let mut rep: AdminReputation = env.storage().persistent().get(&rep_key).unwrap_or(AdminReputation {
            campaigns_created: 0,
            total_funds_raised: 0,
            total_funds_withdrawn: 0,
        });
        rep.total_funds_raised += amount;
        env.storage().persistent().set(&rep_key, &rep);

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

    /// Flag a campaign for potential compliance/fraud issues.
    /// Only the platform admin can raise a flag.
    pub fn flag_campaign(
        env: Env,
        campaign_id: Symbol,
        reason: String,
        flagged_by: Address,
    ) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Logger not initialized");
        
        if flagged_by != admin {
            panic!("Only admin can flag campaigns");
        }
        flagged_by.require_auth();

        let flag = FlagRecord {
            campaign_id: campaign_id.clone(),
            reason,
            flagged_by,
            timestamp: env.ledger().timestamp(),
            resolved: false,
        };

        let flags_key = DataKey::CampaignFlags(campaign_id.clone());
        let mut flags: Vec<FlagRecord> = env
            .storage()
            .persistent()
            .get(&flags_key)
            .unwrap_or(Vec::new(&env));
        flags.push_back(flag);
        env.storage().persistent().set(&flags_key, &flags);

        // Increment global flag count
        let count: u32 = env.storage().instance().get(&DataKey::FlagCount).unwrap_or(0);
        env.storage().instance().set(&DataKey::FlagCount, &(count + 1));

        env.events().publish(
            (symbol_short!("flagged"), campaign_id),
            env.ledger().timestamp()
        );
    }

    /// Resolve (clear) all flags for a campaign. Only admin can do this.
    pub fn resolve_flags(env: Env, campaign_id: Symbol, resolver: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Logger not initialized");
        
        if resolver != admin {
            panic!("Only admin can resolve flags");
        }
        resolver.require_auth();

        let flags_key = DataKey::CampaignFlags(campaign_id.clone());
        let mut flags: Vec<FlagRecord> = env
            .storage()
            .persistent()
            .get(&flags_key)
            .unwrap_or(Vec::new(&env));

        let mut resolved_flags = Vec::new(&env);
        for flag in flags.iter() {
            let mut f = flag.clone();
            f.resolved = true;
            resolved_flags.push_back(f);
        }
        env.storage().persistent().set(&flags_key, &resolved_flags);

        env.events().publish(
            (symbol_short!("resolved"), campaign_id),
            env.ledger().timestamp()
        );
    }

    /// Returns all flags for a specific campaign.
    pub fn get_campaign_flags(env: Env, campaign_id: Symbol) -> Vec<FlagRecord> {
        let flags_key = DataKey::CampaignFlags(campaign_id);
        env.storage().persistent().get(&flags_key).unwrap_or(Vec::new(&env))
    }

    /// Check if a campaign has any unresolved flags.
    pub fn is_flagged(env: Env, campaign_id: Symbol) -> bool {
        let flags_key = DataKey::CampaignFlags(campaign_id);
        let flags: Vec<FlagRecord> = env
            .storage()
            .persistent()
            .get(&flags_key)
            .unwrap_or(Vec::new(&env));
        for flag in flags.iter() {
            if !flag.resolved {
                return true;
            }
        }
        false
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

    /// Logs a successful withdrawal. Only callable by the authorized vault contract.
    pub fn log_campaign_withdrawal(env: Env, admin: Address, amount: i128) {
        let vault_contract: Address = env
            .storage()
            .instance()
            .get(&DataKey::VaultContract)
            .expect("Vault contract not configured in logger");
        vault_contract.require_auth();

        if amount <= 0 {
            panic!("Amount must be positive");
        }

        let rep_key = DataKey::AdminRep(admin.clone());
        let mut rep: AdminReputation = env.storage().persistent().get(&rep_key).unwrap_or(AdminReputation {
            campaigns_created: 0,
            total_funds_raised: 0,
            total_funds_withdrawn: 0,
        });
        rep.total_funds_withdrawn += amount;
        env.storage().persistent().set(&rep_key, &rep);
    }

    /// Returns the reputation statistics for an admin.
    pub fn get_admin_reputation(env: Env, admin: Address) -> AdminReputation {
        env.storage().persistent().get(&DataKey::AdminRep(admin)).unwrap_or(AdminReputation {
            campaigns_created: 0,
            total_funds_raised: 0,
            total_funds_withdrawn: 0,
        })
    }
}

mod test;


// fmt