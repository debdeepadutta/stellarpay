#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, auth::Context, Bytes, BytesN, Env, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    JsonTooLong = 3,
    JsonParseError = 4,
    InvalidChallenge = 5,
    ChallengeMismatch = 6,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Signature {
    pub authenticator_data: Bytes,
    pub client_data_json: Bytes,
    pub signature: BytesN<64>,
}

#[contracttype]
pub enum DataKey {
    PublicKey,
}

#[derive(serde::Deserialize)]
pub struct ClientDataJson<'a> {
    pub challenge: &'a str,
}

#[contract]
pub struct SmartWallet;

#[contractimpl]
impl SmartWallet {
    /// Initialize the wallet with the user's secp256r1 public key (65 bytes uncompressed SEC-1 format)
    pub fn init(env: Env, pk: BytesN<65>) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::PublicKey) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::PublicKey, &pk);
        Ok(())
    }

    /// Extend the TTL of the contract instance and its storage
    pub fn extend_ttl(env: Env) {
        let max_ttl = 100_000;
        env.storage().instance().extend_ttl(max_ttl, max_ttl);
    }

    /// Custom account authorization entrypoint
    #[allow(non_snake_case)]
    pub fn __check_auth(
        env: Env,
        signature_payload: BytesN<32>,
        signature: Signature,
        _auth_contexts: Vec<Context>,
    ) -> Result<(), Error> {
        // Extend TTL to prevent contract expiration
        Self::extend_ttl(env.clone());

        // 1. Retrieve the stored public key
        let pk: BytesN<65> = env
            .storage()
            .instance()
            .get(&DataKey::PublicKey)
            .ok_or(Error::NotInitialized)?;

        // 2. Reconstruct the message payload signed by the WebAuthn authenticator.
        // WebAuthn signature verifies: SHA-256 of (authenticator_data || sha256(client_data_json))
        let mut message = Bytes::new(&env);
        message.append(&signature.authenticator_data);
        
        let client_data_hash = env.crypto().sha256(&signature.client_data_json);
        message.append(&client_data_hash.into());
        
        let message_digest = env.crypto().sha256(&message);

        // 3. Verify ECDSA signature on secp256r1 curve
        env.crypto()
            .secp256r1_verify(&pk.into(), &message_digest, &signature.signature);

        // 4. Verify that the client_data_json contains the signature_payload as the challenge
        let json_len = signature.client_data_json.len() as usize;
        if json_len > 1024 {
            return Err(Error::JsonTooLong);
        }
        
        let mut json_buf = [0u8; 1024];
        signature.client_data_json.copy_into_slice(&mut json_buf[..json_len]);
        let json_slice = &json_buf[..json_len];

        let (client_data, _): (ClientDataJson, usize) = serde_json_core::from_slice(json_slice)
            .map_err(|_| Error::JsonParseError)?;

        // Challenge is the signature_payload represented as a base64url string (43 bytes)
        let challenge_bytes = signature_payload.to_array();
        let encoded_challenge = base64url_encode_32(&challenge_bytes);

        let expected_challenge_str = core::str::from_utf8(&encoded_challenge)
            .map_err(|_| Error::InvalidChallenge)?;

        if client_data.challenge != expected_challenge_str {
            return Err(Error::ChallengeMismatch);
        }

        Ok(())
    }
}

/// Helper function to encode 32 bytes to base64url (no padding, 43 chars)
fn base64url_encode_32(input: &[u8; 32]) -> [u8; 43] {
    const CHARSET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut output = [0u8; 43];
    
    let mut in_idx = 0;
    let mut out_idx = 0;
    
    // Process 10 chunks of 3 bytes = 30 bytes (producing 40 chars)
    for _ in 0..10 {
        let b0 = input[in_idx] as usize;
        let b1 = input[in_idx + 1] as usize;
        let b2 = input[in_idx + 2] as usize;
        in_idx += 3;
        
        output[out_idx] = CHARSET[b0 >> 2];
        output[out_idx + 1] = CHARSET[((b0 & 0x03) << 4) | (b1 >> 4)];
        output[out_idx + 2] = CHARSET[((b1 & 0x0f) << 2) | (b2 >> 6)];
        output[out_idx + 3] = CHARSET[b2 & 0x3f];
        out_idx += 4;
    }
    
    // Process last 2 bytes (producing 3 chars)
    let b0 = input[30] as usize;
    let b1 = input[31] as usize;
    output[out_idx] = CHARSET[b0 >> 2];
    output[out_idx + 1] = CHARSET[((b0 & 0x03) << 4) | (b1 >> 4)];
    output[out_idx + 2] = CHARSET[(b1 & 0x0f) << 2];
    
    output
}

mod test;


