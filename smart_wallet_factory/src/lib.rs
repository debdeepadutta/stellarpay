#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, BytesN, Env, Symbol, Val, Vec, IntoVal};

#[contracttype]
pub enum DataKey {
    WasmHash,
}

#[contract]
pub struct WebAuthnFactory;

#[contractimpl]
impl WebAuthnFactory {
    /// Initialize the factory with the WASM hash of the smart wallet contract
    pub fn initialize(env: Env, wasm_hash: BytesN<32>) {
        if env.storage().instance().has(&DataKey::WasmHash) {
            panic!("Already initialized");
        }
        env.storage().instance().set(&DataKey::WasmHash, &wasm_hash);
    }

    /// Retrieve the stored smart wallet WASM hash
    pub fn get_wasm_hash(env: Env) -> BytesN<32> {
        env.storage().instance().get(&DataKey::WasmHash).expect("Not initialized")
    }

    /// Deploy a new smart wallet contract deterministically using a salt and user public key
    pub fn deploy(env: Env, salt: BytesN<32>, pk: BytesN<65>) -> Address {
        let wasm_hash: BytesN<32> = env
            .storage()
            .instance()
            .get(&DataKey::WasmHash)
            .expect("Factory not initialized");

        // Deploy the contract deterministically
        let wallet_address = env
            .deployer()
            .with_current_contract(salt)
            .deploy(wasm_hash);

        // Call the init function of the smart wallet contract
        env.invoke_contract::<()>(
            &wallet_address,
            &Symbol::new(&env, "init"),
            (pk,).into_val(&env),
        );

        wallet_address
    }
}
