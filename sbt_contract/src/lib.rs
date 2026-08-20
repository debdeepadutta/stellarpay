#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String, Symbol, Vec};

/// Impact Receipt — a soul-bound token recording a donation.
/// Non-transferable by design (no transfer function exposed).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ImpactReceipt {
    pub id: u64,               // auto-increment receipt ID
    pub donor: Address,
    pub campaign_id: Symbol,
    pub amount: i128,          // in stroops
    pub category: Symbol,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Authorized,       // authorized minter (donation contract)
    ReceiptCount,     // global u64 auto-increment
    Receipt(u64),                   // ImpactReceipt by ID
    DonorReceipts(Address),         // Vec<u64> — all receipt IDs for a donor
}

#[contract]
pub struct SbtContract;

#[contractimpl]
impl SbtContract {
    /// Initialize — sets the authorized minter (typically the donation contract address).
    pub fn initialize(env: Env, authorized_minter: Address) {
        if env.storage().instance().has(&DataKey::Authorized) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&DataKey::Authorized, &authorized_minter);
        env.storage().instance().set(&DataKey::ReceiptCount, &0u64);
    }

    /// Mint a new impact receipt. Only callable by the authorized minter contract.
    pub fn mint(
        env: Env,
        donor: Address,
        campaign_id: Symbol,
        amount: i128,
        category: Symbol,
    ) -> u64 {
        let minter: Address = env
            .storage()
            .instance()
            .get(&DataKey::Authorized)
            .expect("Not initialized");
        minter.require_auth();

        if amount <= 0 {
            panic!("Amount must be positive");
        }

        let count_key = DataKey::ReceiptCount;
        let receipt_id: u64 = env.storage().instance().get(&count_key).unwrap_or(0);

        let receipt = ImpactReceipt {
            id: receipt_id,
            donor: donor.clone(),
            campaign_id: campaign_id.clone(),
            amount,
            category,
            timestamp: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&DataKey::Receipt(receipt_id), &receipt);

        // Update donor's receipt list
        let donor_key = DataKey::DonorReceipts(donor.clone());
        let mut ids: Vec<u64> = env.storage().persistent().get(&donor_key).unwrap_or(Vec::new(&env));
        ids.push_back(receipt_id);
        env.storage().persistent().set(&donor_key, &ids);

        // Increment global count
        env.storage().instance().set(&count_key, &(receipt_id + 1));

        env.events().publish(
            (Symbol::new(&env, "sbt_minted"), campaign_id),
            (receipt_id, donor, amount)
        );

        receipt_id
    }

    /// Get a specific receipt by ID.
    pub fn get_receipt(env: Env, receipt_id: u64) -> Option<ImpactReceipt> {
        env.storage().persistent().get(&DataKey::Receipt(receipt_id))
    }

    /// Get all receipt IDs owned by a donor.
    pub fn get_donor_receipts(env: Env, donor: Address) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::DonorReceipts(donor))
            .unwrap_or(Vec::new(&env))
    }

    /// Get total number of receipts minted.
    pub fn get_receipt_count(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::ReceiptCount).unwrap_or(0)
    }
}

mod test;

