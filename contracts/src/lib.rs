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
pub struct CampaignInfo {
    pub admin: Address,
    pub goal: i128,
    pub total_raised: i128,
    pub category: Symbol,
    pub status: Symbol,
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
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DonorReputation {
    pub total_donated: i128,
    pub campaign_count: u32,
    pub score: i128,  // total_donated / 10_000_000 (XLM) * 10 + campaign_count * 50
    pub last_donation_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Subscription {
    pub amount: i128,
    pub interval: u64,
    pub next_execution: u64,
    pub relayer: Address,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Token,
    Logger,
    Vault,
    Total,
    Campaign(Symbol),
    CampaignDonorTotal(Symbol, Address),
    CampaignTopDonors(Symbol),
    DonorTotal(Address),
    TopDonors,
    DonorReputation(Address),
    DonorCampaignSeen(Address, Symbol), // whether donor has donated to this campaign before
    Sbt,                                // SBT contract address for impact receipts
    Subscription(Address, Symbol),      // (donor, campaign_id)
}

#[contract]
pub struct DonationContract;

#[contractimpl]
impl DonationContract {
    /// Initialize the platform registry contract
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

    /// Set the SBT contract address. Only callable by admin.
    pub fn set_sbt_contract(env: Env, sbt: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).expect("Not initialized");
        admin.require_auth();
        env.storage().instance().set(&DataKey::Sbt, &sbt);
    }

    /// Create a new campaign on-chain with milestones, verifier and category
    pub fn create_campaign(
        env: Env,
        campaign_id: Symbol,
        admin: Address,
        goal: i128,
        milestones: Vec<u32>,
        verifier: Address,
        category: Symbol,
    ) {
        let key = DataKey::Campaign(campaign_id.clone());
        if env.storage().persistent().has(&key) {
            panic!("Campaign already exists");
        }
        if goal <= 0 {
            panic!("Goal must be positive");
        }
        
        let campaign = CampaignInfo {
            admin: admin.clone(),
            goal,
            total_raised: 0,
            category: category.clone(),
            status: Symbol::new(&env, "active"),
        };
        env.storage().persistent().set(&key, &campaign);
        
        let empty_top: Vec<(Address, i128)> = Vec::new(&env);
        env.storage().persistent().set(&DataKey::CampaignTopDonors(campaign_id.clone()), &empty_top);

        // Retrieve the vault contract address
        let vault_addr: Address = env.storage().instance().get(&DataKey::Vault).expect("Vault not set");
        
        // Invoke vault to initialize the milestone configuration
        env.invoke_contract::<()>(
            &vault_addr,
            &Symbol::new(&env, "set_campaign_vault_config"),
            (campaign_id.clone(), goal, milestones, verifier).into_val(&env),
        );

        // Emit campaign creation event
        env.events().publish(
            (symbol_short!("created"), campaign_id.clone()),
            (admin.clone(), goal)
        );

        // Cross-contract call to Logger
        let logger_addr: Address = env.storage().instance().get(&DataKey::Logger).expect("Logger not set");
        env.invoke_contract::<()>(
            &logger_addr,
            &Symbol::new(&env, "log_campaign_creation"),
            (admin,).into_val(&env),
        );
    }

    /// Donate tokens to a specific campaign. Updates registry, transfers funds to Vault, and calls Logger.
    pub fn donate(env: Env, campaign_id: Symbol, donor: Address, amount: i128) {
        donor.require_auth();
        Self::internal_donate(env, campaign_id, donor, amount, false);
    }

    /// Internal function to execute donation logic without requiring donor auth directly
    /// (used by trigger_subscription_donation which is authenticated by the relayer).
    fn internal_donate(env: Env, campaign_id: Symbol, donor: Address, amount: i128, from_allowance: bool) {
        if amount <= 0 {
            panic!("Amount must be positive");
        }

        let campaign_key = DataKey::Campaign(campaign_id.clone());
        let mut campaign: CampaignInfo = env
            .storage()
            .persistent()
            .get(&campaign_key)
            .expect("Campaign not found");

        if campaign.status != Symbol::new(&env, "active") {
            panic!("Campaign is inactive");
        }

        // 1. Update Donor Total for this campaign (Persistent Storage)
        let donor_total_key = DataKey::CampaignDonorTotal(campaign_id.clone(), donor.clone());
        let mut donor_total: i128 = env.storage().persistent().get(&donor_total_key).unwrap_or(0);
        donor_total += amount;
        env.storage().persistent().set(&donor_total_key, &donor_total);

        // 2. Update Campaign Total raised
        campaign.total_raised += amount;
        env.storage().persistent().set(&campaign_key, &campaign);

        // 3. Update Global platform stats
        let mut total: i128 = env.storage().instance().get(&DataKey::Total).unwrap_or(0);
        total += amount;
        env.storage().instance().set(&DataKey::Total, &total);

        // 4. Update Campaign-specific Top Donors
        Self::update_campaign_top_donors(&env, campaign_id.clone(), donor.clone(), donor_total);

        // 5. Transfer funds directly to Vault
        let token_addr: Address = env.storage().instance().get(&DataKey::Token).expect("Token not set");
        let vault_addr: Address = env.storage().instance().get(&DataKey::Vault).expect("Vault not set");
        
        let token_client = token::Client::new(&env, &token_addr);
        if from_allowance {
            token_client.transfer_from(&env.current_contract_address(), &donor, &vault_addr, &amount);
        } else {
            token_client.transfer(&donor, &vault_addr, &amount);
        }
        
        // Call Vault.deposit (for campaign-specific accounting)
        env.invoke_contract::<()>(
            &vault_addr,
            &symbol_short!("deposit"),
            (campaign_id.clone(), donor.clone(), amount).into_val(&env),
        );

        // 5b. Mint SBT Receipt if contract is configured
        let sbt_opt: Option<Address> = env.storage().instance().get(&DataKey::Sbt);
        if let Some(sbt_addr) = sbt_opt {
            env.invoke_contract::<u64>(
                &sbt_addr,
                &Symbol::new(&env, "mint"),
                (donor.clone(), campaign_id.clone(), amount, campaign.category.clone()).into_val(&env),
            );
        }

        // 6. Cross-contract call to Logger (global history)
        let logger_addr: Address = env.storage().instance().get(&DataKey::Logger).expect("Logger not set");
        env.invoke_contract::<()>(
            &logger_addr,
            &Symbol::new(&env, "log_donation"),
            (donor.clone(), amount, campaign.admin.clone(), env.ledger().timestamp()).into_val(&env),
        );

        // 8. Update global donor reputation
        let seen_key = DataKey::DonorCampaignSeen(donor.clone(), campaign_id.clone());
        let already_donated_here: bool = env.storage().persistent().get(&seen_key).unwrap_or(false);
        
        let rep_key = DataKey::DonorReputation(donor.clone());
        let mut rep: DonorReputation = env.storage().persistent().get(&rep_key).unwrap_or(DonorReputation {
            total_donated: 0,
            campaign_count: 0,
            score: 0,
            last_donation_at: 0,
        });
        rep.total_donated += amount;
        if !already_donated_here {
            rep.campaign_count += 1;
            env.storage().persistent().set(&seen_key, &true);
        }
        rep.last_donation_at = env.ledger().timestamp();
        // Score: 10 pts per XLM donated + 50 pts per unique campaign
        rep.score = (rep.total_donated / 10_000_000) * 10 + (rep.campaign_count as i128) * 50;
        env.storage().persistent().set(&rep_key, &rep);

        // 7. Emit typed event
        env.events().publish(
            (symbol_short!("donation"), campaign_id, donor),
            (amount, env.ledger().timestamp())
        );
    }

    /// Return total platform donations
    pub fn get_total(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::Total).unwrap_or(0)
    }

    /// Return logger contract address
    pub fn get_logger(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Logger).expect("Logger not set")
    }

    /// Return total donations for a specific campaign
    pub fn get_campaign_total(env: Env, campaign_id: Symbol) -> i128 {
        let key = DataKey::Campaign(campaign_id);
        let campaign: Option<CampaignInfo> = env.storage().persistent().get(&key);
        match campaign {
            Some(c) => c.total_raised,
            None => 0,
        }
    }

    /// Return admin for a specific campaign
    pub fn get_campaign_admin(env: Env, campaign_id: Symbol) -> Address {
        let key = DataKey::Campaign(campaign_id);
        let campaign: CampaignInfo = env.storage().persistent().get(&key).expect("Campaign not found");
        campaign.admin
    }

    /// Return full campaign info on-chain
    pub fn get_campaign_info(env: Env, campaign_id: Symbol) -> Option<CampaignInfo> {
        let key = DataKey::Campaign(campaign_id);
        env.storage().persistent().get(&key)
    }

    /// Return donor total for a specific campaign
    pub fn get_campaign_donor_total(env: Env, campaign_id: Symbol, donor: Address) -> i128 {
        let key = DataKey::CampaignDonorTotal(campaign_id, donor);
        env.storage().persistent().get(&key).unwrap_or(0)
    }

    /// Deactivate a campaign. Only the campaign admin can do this.
    pub fn deactivate_campaign(env: Env, campaign_id: Symbol, admin: Address) {
        admin.require_auth();

        let campaign_key = DataKey::Campaign(campaign_id.clone());
        let mut campaign: CampaignInfo = env
            .storage()
            .persistent()
            .get(&campaign_key)
            .expect("Campaign not found");

        if campaign.admin != admin {
            panic!("Only campaign admin can deactivate");
        }

        campaign.status = Symbol::new(&env, "inactive");
        env.storage().persistent().set(&campaign_key, &campaign);

        env.events().publish(
            (symbol_short!("inactive"), campaign_id),
            admin
        );
    }

    /// Return top 5 donors for a specific campaign
    pub fn get_campaign_top_donors(env: Env, campaign_id: Symbol) -> Vec<(Address, i128)> {
        env.storage().persistent().get(&DataKey::CampaignTopDonors(campaign_id))
            .unwrap_or(Vec::new(&env))
    }

    /// Return donor reputation score for a given address
    pub fn get_donor_reputation(env: Env, donor: Address) -> Option<DonorReputation> {
        env.storage().persistent().get(&DataKey::DonorReputation(donor))
    }

    /// Helper to update top 5 donors list for a campaign
    fn update_campaign_top_donors(env: &Env, campaign_id: Symbol, donor: Address, total: i128) {
        let top_key = DataKey::CampaignTopDonors(campaign_id);
        let mut top_donors: Vec<(Address, i128)> = env.storage().persistent().get(&top_key).unwrap_or(Vec::new(env));
        
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

        // Sort descending
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

        let mut final_list: Vec<(Address, i128)> = Vec::new(env);
        for i in 0..5 {
            if i < sorted.len() {
                final_list.push_back(sorted.get(i).unwrap());
            }
        }

        env.storage().persistent().set(&top_key, &final_list);
    }

    /// Setup a recurring subscription. The `donor` must sign this transaction.
    /// `interval` is in seconds. The donor must have already approved the donation contract
    /// via the token's `approve` method.
    pub fn subscribe(
        env: Env,
        campaign_id: Symbol,
        donor: Address,
        amount: i128,
        interval: u64,
        relayer: Address,
    ) {
        donor.require_auth();

        if amount <= 0 {
            panic!("Amount must be positive");
        }
        if interval == 0 {
            panic!("Interval must be positive");
        }

        let key = DataKey::Subscription(donor.clone(), campaign_id.clone());
        let sub = Subscription {
            amount,
            interval,
            next_execution: env.ledger().timestamp() + interval,
            relayer: relayer.clone(),
        };
        env.storage().persistent().set(&key, &sub);
        
        env.events().publish(
            (symbol_short!("subscribe"), campaign_id, donor),
            (amount, interval, relayer)
        );
    }

    /// Trigger a subscription donation. The `relayer` must sign this transaction.
    pub fn trigger_subscription_donation(
        env: Env,
        campaign_id: Symbol,
        donor: Address,
    ) {
        let key = DataKey::Subscription(donor.clone(), campaign_id.clone());
        let mut sub: Subscription = env.storage().persistent().get(&key).expect("No subscription found");
        
        sub.relayer.require_auth();

        let current_time = env.ledger().timestamp();
        if current_time < sub.next_execution {
            panic!("Too early to trigger subscription");
        }

        // Execute donation (pulling funds using transfer_from)
        Self::internal_donate(env.clone(), campaign_id.clone(), donor.clone(), sub.amount, true);

        // Update next execution time
        sub.next_execution = current_time + sub.interval;
        env.storage().persistent().set(&key, &sub);
    }
}

mod test;
