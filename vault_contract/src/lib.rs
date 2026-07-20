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
pub struct Milestone {
    pub percentage: u32,
    pub approved: bool,
    pub cap: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CampaignVaultConfig {
    pub goal: i128,
    pub verifier: Address,
    pub milestones: Vec<Milestone>,
    pub total_withdrawn: i128,
}

/// A matching pool funded by a matcher for a specific campaign.
/// On every donation, up to min(donation, remaining) is auto-matched 1:1.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MatchingPool {
    pub funder: Address,
    pub total: i128,    // total pledged by matcher (in token's base units)
    pub used: i128,     // how much has been matched so far
    pub active: bool,   // funder can deactivate to stop future matching
}

/// Multi-sig config attached to a campaign
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MultiSigConfig {
    pub signers: Vec<Address>,
    pub threshold: u32,   // minimum approvals required (e.g. 2 out of 3)
}

/// A pending withdrawal proposal requiring N-of-M approval
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WithdrawalProposal {
    pub campaign_id: Symbol,
    pub amount: i128,
    pub to: Address,
    pub proposer: Address,
    pub approvals: Vec<Address>,
    pub threshold: u32,
    pub executed: bool,
    pub created_at: u64,
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
    CampaignConfig(Symbol),
    MultiSigConfig(Symbol),
    WithdrawalProposal(Symbol, u32), // (campaign_id, proposal_index)
    ProposalCount(Symbol),
    MatchingPool(Symbol),            // matching pool per campaign
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

    /// Sets the milestones and verifier configuration for a specific campaign's vault
    pub fn set_campaign_vault_config(
        env: Env,
        campaign_id: Symbol,
        goal: i128,
        milestones_pct: Vec<u32>,
        verifier: Address,
    ) {
        let authorized_contract: Address = env
            .storage()
            .instance()
            .get(&DataKey::DonationContract)
            .expect("Vault not initialized");
        authorized_contract.require_auth();

        let mut milestones = Vec::new(&env);
        for pct in milestones_pct.iter() {
            let cap = (goal * (pct as i128)) / 100;
            milestones.push_back(Milestone {
                percentage: pct,
                approved: false,
                cap,
            });
        }

        let config = CampaignVaultConfig {
            goal,
            verifier,
            milestones,
            total_withdrawn: 0,
        };

        let config_key = DataKey::CampaignConfig(campaign_id);
        env.storage().persistent().set(&config_key, &config);
    }

    /// Configures multi-sig for a campaign. Only admin or campaign admin (via donation contract) can call.
    pub fn set_multisig_config(
        env: Env,
        campaign_id: Symbol,
        signers: Vec<Address>,
        threshold: u32,
    ) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Vault not initialized");
        admin.require_auth();

        if signers.len() < threshold {
            panic!("Threshold cannot exceed number of signers");
        }
        if threshold == 0 {
            panic!("Threshold must be at least 1");
        }

        let multisig = MultiSigConfig { signers, threshold };
        env.storage()
            .persistent()
            .set(&DataKey::MultiSigConfig(campaign_id), &multisig);
    }

    /// Propose a withdrawal (creates a pending proposal requiring multi-sig approval).
    /// Any registered signer can propose. If no multi-sig is configured, falls back to direct withdraw.
    pub fn propose_withdrawal(
        env: Env,
        campaign_id: Symbol,
        proposer: Address,
        amount: i128,
        to: Address,
    ) -> u32 {
        proposer.require_auth();

        let multisig_opt: Option<MultiSigConfig> = env
            .storage()
            .persistent()
            .get(&DataKey::MultiSigConfig(campaign_id.clone()));

        let multisig = multisig_opt.expect("Multi-sig not configured for this campaign");

        // Verify proposer is a registered signer
        let mut is_signer = false;
        for signer in multisig.signers.iter() {
            if signer == proposer {
                is_signer = true;
                break;
            }
        }
        if !is_signer {
            panic!("Proposer is not a registered signer");
        }

        if amount <= 0 {
            panic!("Amount must be positive");
        }

        // Check balance
        let stats_key = DataKey::CampaignStats(campaign_id.clone());
        let stats: VaultStats = env
            .storage()
            .persistent()
            .get(&stats_key)
            .unwrap_or(VaultStats {
                total_deposited: 0,
                total_withdrawn: 0,
                current_balance: 0,
                deposit_count: 0,
            });

        if amount > stats.current_balance {
            panic!("Insufficient balance");
        }

        let mut approvals = Vec::new(&env);
        approvals.push_back(proposer.clone());

        let proposal = WithdrawalProposal {
            campaign_id: campaign_id.clone(),
            amount,
            to,
            proposer,
            approvals,
            threshold: multisig.threshold,
            executed: false,
            created_at: env.ledger().timestamp(),
        };

        let count_key = DataKey::ProposalCount(campaign_id.clone());
        let idx: u32 = env.storage().persistent().get(&count_key).unwrap_or(0);
        env.storage()
            .persistent()
            .set(&DataKey::WithdrawalProposal(campaign_id.clone(), idx), &proposal);
        env.storage()
            .persistent()
            .set(&count_key, &(idx + 1));

        env.events().publish(
            (Symbol::new(&env, "proposal_created"), campaign_id),
            (idx, amount)
        );

        idx
    }

    /// Sign an existing pending proposal. Once threshold is reached, the proposal is ready to execute.
    pub fn sign_withdrawal(
        env: Env,
        campaign_id: Symbol,
        signer: Address,
        proposal_idx: u32,
    ) {
        signer.require_auth();

        let multisig: MultiSigConfig = env
            .storage()
            .persistent()
            .get(&DataKey::MultiSigConfig(campaign_id.clone()))
            .expect("Multi-sig not configured");

        // Verify signer is registered
        let mut is_signer = false;
        for s in multisig.signers.iter() {
            if s == signer {
                is_signer = true;
                break;
            }
        }
        if !is_signer {
            panic!("Signer is not a registered multi-sig signer");
        }

        let proposal_key = DataKey::WithdrawalProposal(campaign_id.clone(), proposal_idx);
        let mut proposal: WithdrawalProposal = env
            .storage()
            .persistent()
            .get(&proposal_key)
            .expect("Proposal not found");

        if proposal.executed {
            panic!("Proposal already executed");
        }

        // Check not already signed
        for existing in proposal.approvals.iter() {
            if existing == signer {
                panic!("Already signed by this signer");
            }
        }

        proposal.approvals.push_back(signer.clone());
        env.storage().persistent().set(&proposal_key, &proposal);

        env.events().publish(
            (Symbol::new(&env, "proposal_signed"), campaign_id),
            (proposal_idx, signer)
        );
    }

    /// Execute a proposal that has reached the required approval threshold.
    pub fn execute_withdrawal(
        env: Env,
        campaign_id: Symbol,
        executor: Address,
        proposal_idx: u32,
    ) {
        executor.require_auth();

        let proposal_key = DataKey::WithdrawalProposal(campaign_id.clone(), proposal_idx);
        let mut proposal: WithdrawalProposal = env
            .storage()
            .persistent()
            .get(&proposal_key)
            .expect("Proposal not found");

        if proposal.executed {
            panic!("Proposal already executed");
        }

        if (proposal.approvals.len() as u32) < proposal.threshold {
            panic!("Insufficient approvals to execute");
        }

        // Milestone cap checking still applies
        let config_key = DataKey::CampaignConfig(campaign_id.clone());
        let config_opt: Option<CampaignVaultConfig> = env.storage().persistent().get(&config_key);
        if let Some(mut config) = config_opt {
            let mut total_approved_cap: i128 = 0;
            for milestone in config.milestones.iter() {
                if milestone.approved {
                    total_approved_cap += milestone.cap;
                }
            }
            if total_approved_cap > config.goal {
                total_approved_cap = config.goal;
            }
            if config.total_withdrawn + proposal.amount > total_approved_cap {
                panic!("Amount exceeds approved milestone cap");
            }
            config.total_withdrawn += proposal.amount;
            env.storage().persistent().set(&config_key, &config);
        }

        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = token::Client::new(&env, &token_addr);
        token_client.transfer(&env.current_contract_address(), &proposal.to, &proposal.amount);

        // Record withdrawal
        let record = WithdrawalRecord {
            amount: proposal.amount,
            to: proposal.to.clone(),
            timestamp: env.ledger().timestamp(),
        };
        let withdrawals_key = DataKey::CampaignWithdrawals(campaign_id.clone());
        let mut history: Vec<WithdrawalRecord> = env
            .storage()
            .persistent()
            .get(&withdrawals_key)
            .unwrap_or(Vec::new(&env));
        history.push_back(record);
        env.storage().persistent().set(&withdrawals_key, &history);

        // Update stats
        let stats_key = DataKey::CampaignStats(campaign_id.clone());
        let mut stats: VaultStats = env
            .storage()
            .persistent()
            .get(&stats_key)
            .unwrap_or(VaultStats {
                total_deposited: 0,
                total_withdrawn: 0,
                current_balance: 0,
                deposit_count: 0,
            });
        stats.total_withdrawn += proposal.amount;
        stats.current_balance -= proposal.amount;
        env.storage().persistent().set(&stats_key, &stats);

        // Mark as executed
        proposal.executed = true;
        env.storage().persistent().set(&proposal_key, &proposal);

        // Fetch logger from donation contract and log withdrawal
        let donation_contract: Address = env.storage().instance().get(&DataKey::DonationContract).unwrap();
        let campaign_admin: Address = env.invoke_contract(
            &donation_contract,
            &Symbol::new(&env, "get_campaign_admin"),
            (campaign_id.clone(),).into_val(&env)
        );
        let logger_addr: Address = env.invoke_contract(
            &donation_contract,
            &Symbol::new(&env, "get_logger"),
            ().into_val(&env)
        );
        env.invoke_contract::<()>(
            &logger_addr,
            &Symbol::new(&env, "log_campaign_withdrawal"),
            (campaign_admin, proposal.amount).into_val(&env)
        );

        env.events().publish(
            (Symbol::new(&env, "withdrawal_exec"), campaign_id),
            (proposal_idx, proposal.amount)
        );
    }

    /// Returns a specific withdrawal proposal
    pub fn get_proposal(env: Env, campaign_id: Symbol, proposal_idx: u32) -> Option<WithdrawalProposal> {
        env.storage()
            .persistent()
            .get(&DataKey::WithdrawalProposal(campaign_id, proposal_idx))
    }

    /// Returns number of proposals for a campaign
    pub fn get_proposal_count(env: Env, campaign_id: Symbol) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::ProposalCount(campaign_id))
            .unwrap_or(0)
    }

    /// Returns the multi-sig config for a campaign
    pub fn get_multisig_config(env: Env, campaign_id: Symbol) -> Option<MultiSigConfig> {
        env.storage()
            .persistent()
            .get(&DataKey::MultiSigConfig(campaign_id))
    }

    /// Approves a milestone, releasing its associated withdrawal cap
    pub fn approve_milestone(env: Env, campaign_id: Symbol, verifier: Address, percentage: u32) {
        let config_key = DataKey::CampaignConfig(campaign_id.clone());
        let mut config: CampaignVaultConfig = env
            .storage()
            .persistent()
            .get(&config_key)
            .expect("Campaign config not found");

        if verifier != config.verifier {
            panic!("Only designated verifier can approve milestones");
        }
        verifier.require_auth();

        let mut updated_milestones = Vec::new(&env);
        let mut found = false;
        for milestone in config.milestones.iter() {
            let mut m = milestone.clone();
            if m.percentage == percentage {
                m.approved = true;
                found = true;
            }
            updated_milestones.push_back(m);
        }

        if !found {
            panic!("Milestone percentage not found");
        }

        config.milestones = updated_milestones;
        env.storage().persistent().set(&config_key, &config);

        env.events().publish(
            (Symbol::new(&env, "milestone_approved"), campaign_id),
            percentage
        );
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
        // Auto-apply matching pool if active
        let pool_key = DataKey::MatchingPool(campaign_id.clone());
        if let Some(mut pool) = env.storage().persistent().get::<_, MatchingPool>(&pool_key) {
            if pool.active && pool.used < pool.total {
                let remaining = pool.total - pool.used;
                let matched = if amount < remaining { amount } else { remaining };
                pool.used += matched;
                // Credit the matched amount as additional deposit (tokens already held by vault)
                stats.total_deposited += matched;
                stats.current_balance += matched;
                env.storage().persistent().set(&pool_key, &pool);
                // Emit matching event
                env.events().publish(
                    (symbol_short!("matched"), campaign_id.clone(), from.clone()),
                    matched
                );
            }
        }

        env.storage().persistent().set(&stats_key, &stats);

        // Emit event
        env.events().publish(
            (symbol_short!("deposit"), campaign_id, from),
            amount
        );
    }

    /// Withdraws funds from a specific campaign's vault sub-balance. Only callable by the campaign admin.
    /// NOTE: For campaigns with multi-sig configured, use propose_withdrawal/sign_withdrawal/execute_withdrawal instead.
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

        // Milestone cap checking
        let config_key = DataKey::CampaignConfig(campaign_id.clone());
        let config_opt: Option<CampaignVaultConfig> = env.storage().persistent().get(&config_key);
        if let Some(mut config) = config_opt {
            let mut total_approved_cap: i128 = 0;
            for milestone in config.milestones.iter() {
                if milestone.approved {
                    total_approved_cap += milestone.cap;
                }
            }
            if total_approved_cap > config.goal {
                total_approved_cap = config.goal;
            }
            if config.total_withdrawn + amount > total_approved_cap {
                panic!("Amount exceeds approved milestone cap");
            }
            config.total_withdrawn += amount;
            env.storage().persistent().set(&config_key, &config);
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

        // Fetch logger from donation contract and log withdrawal
        let logger_addr: Address = env.invoke_contract(
            &donation_contract,
            &Symbol::new(&env, "get_logger"),
            ().into_val(&env)
        );
        env.invoke_contract::<()>(
            &logger_addr,
            &Symbol::new(&env, "log_campaign_withdrawal"),
            (campaign_admin, amount).into_val(&env)
        );

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

    /// Returns the milestone configuration for a specific campaign
    pub fn get_campaign_config(env: Env, campaign_id: Symbol) -> Option<CampaignVaultConfig> {
        let config_key = DataKey::CampaignConfig(campaign_id);
        env.storage().persistent().get(&config_key)
    }

    /// Fund a matching pool for a campaign. Anyone can be a matcher.
    /// The matcher transfers tokens to the vault; those tokens will be
    /// automatically applied 1:1 on future donations up to `amount`.
    pub fn fund_matching_pool(env: Env, campaign_id: Symbol, funder: Address, amount: i128) {
        funder.require_auth();

        if amount <= 0 {
            panic!("Matching pool amount must be positive");
        }

        let token_addr: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let token_client = token::Client::new(&env, &token_addr);
        // Transfer matching funds from funder into the vault
        token_client.transfer(&funder, &env.current_contract_address(), &amount);

        let pool_key = DataKey::MatchingPool(campaign_id.clone());
        // If a pool already exists and is still active, extend it; otherwise create new
        let pool = if let Some(mut existing) = env.storage().persistent().get::<_, MatchingPool>(&pool_key) {
            existing.total += amount;
            existing.active = true;
            existing
        } else {
            MatchingPool { funder: funder.clone(), total: amount, used: 0, active: true }
        };
        env.storage().persistent().set(&pool_key, &pool);

        env.events().publish(
            (symbol_short!("pool_add"), campaign_id),
            (funder, amount)
        );
    }

    /// Get the current state of a matching pool for a campaign.
    pub fn get_matching_pool(env: Env, campaign_id: Symbol) -> Option<MatchingPool> {
        env.storage().persistent().get(&DataKey::MatchingPool(campaign_id))
    }

    /// Deactivate a matching pool. Only the original funder or admin can do this.
    pub fn deactivate_matching_pool(env: Env, campaign_id: Symbol, caller: Address) {
        caller.require_auth();
        let pool_key = DataKey::MatchingPool(campaign_id.clone());
        let mut pool: MatchingPool = env
            .storage()
            .persistent()
            .get(&pool_key)
            .expect("No matching pool for this campaign");

        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        if caller != pool.funder && caller != admin {
            panic!("Only funder or admin can deactivate");
        }
        pool.active = false;
        env.storage().persistent().set(&pool_key, &pool);
    }
}

mod test;


