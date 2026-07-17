import { 
  xdr, 
  Address, 
  hash, 
  Networks 
} from '@stellar/stellar-sdk';

// buildAuthorizationEntryPreimage was removed in stellar-sdk v15.
// We rebuild it manually using the raw XDR types.
function buildAuthPreimage(entry, networkPassphrase) {
  const networkId = hash(Buffer.from(networkPassphrase));
  const addrCreds = entry.credentials().address();
  const preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
    new xdr.HashIdPreimageSorobanAuthorization({
      networkId,
      nonce: addrCreds.nonce(),
      signatureExpirationLedger: addrCreds.signatureExpirationLedger(),
      invocation: entry.rootInvocation(),
    })
  );
  return preimage.toXDR();
}
import { Buffer } from 'buffer';

// Helper to convert DER signature to compact 64-byte format (R || S)
export function convertEcdsaSignatureAsnToCompact(asn1Signature) {
  const sig = Buffer.isBuffer(asn1Signature) ? asn1Signature : Buffer.from(asn1Signature);
  if (sig[0] !== 0x30) throw new Error("Invalid signature format");
  
  let pos = 2;
  if (sig[pos] !== 0x02) throw new Error("Invalid R header");
  pos++;
  let rLen = sig[pos];
  pos++;
  let rStart = pos;
  if (sig[rStart] === 0x00) {
    rStart++;
    rLen--;
  }
  const r = sig.subarray(rStart, rStart + rLen);
  pos += sig[pos - 1]; // skip to S header
  
  if (sig[pos] !== 0x02) throw new Error("Invalid S header");
  pos++;
  let sLen = sig[pos];
  pos++;
  let sStart = pos;
  if (sig[sStart] === 0x00) {
    sStart++;
    sLen--;
  }
  const s = sig.subarray(sStart, sStart + sLen);
  
  const compact = Buffer.alloc(64);
  r.copy(compact, 32 - r.length);
  s.copy(compact, 64 - s.length);
  return compact;
}

// Check if WebAuthn is supported
export function isWebAuthnSupported() {
  return !!(navigator.credentials && navigator.credentials.create && navigator.credentials.get);
}

// 1. Register a new passkey credential and extract raw SEC-1 65-byte public key
export async function registerPasskey(username) {
  if (!isWebAuthnSupported()) {
    throw new Error("WebAuthn is not supported on this device/browser.");
  }

  const challenge = window.crypto.getRandomValues(new Uint8Array(32));
  // Use a STABLE rpId so passkeys survive Vercel re-deployments to new URLs.
  // For localhost dev, use hostname. For production, use the stable Vercel project alias.
  const hostname = window.location.hostname;
  const rpId = hostname === 'localhost' || hostname === '127.0.0.1'
    ? hostname
    : 'stellarpay-debdeepa-duttas-projects.vercel.app';

  const options = {
    publicKey: {
      challenge,
      rp: {
        name: "Stellar Philanthropy",
        id: rpId,
      },
      user: {
        id: window.crypto.getRandomValues(new Uint8Array(16)),
        name: username,
        displayName: username,
      },
      pubKeyCredParams: [
        {
          type: "public-key",
          alg: -7, // ES256 (secp256r1)
        }
      ],
      timeout: 60000,
      authenticatorSelection: {
        userVerification: "preferred", // biometric preferred, PIN fallback if no biometrics
        residentKey: "required",
        requireResidentKey: true,
      },
      attestation: "direct",
    }
  };

  console.log("[Passkey] Registering credential for user:", username);
  const credential = await navigator.credentials.create(options);
  
  if (!credential || !credential.response) {
    throw new Error("Failed to create credential: empty response.");
  }

  // Get raw public key (DER SubjectPublicKeyInfo format)
  // Modern browsers support response.getPublicKey()
  if (typeof credential.response.getPublicKey !== 'function') {
    throw new Error("Browser does not support getPublicKey().");
  }
  const publicKeyDer = credential.response.getPublicKey();
  
  // Extract 65-byte uncompressed key (strip 26-byte DER header)
  const rawPublicKey = new Uint8Array(publicKeyDer).slice(26);
  
  if (rawPublicKey[0] !== 0x04 || rawPublicKey.length !== 65) {
    throw new Error(`Invalid public key format extracted. Expected 65-byte SEC-1 uncompressed key, got ${rawPublicKey.length} bytes.`);
  }

  // base64url encode rawKeyId for storage (avoids Firestore path issues with '/')
  const keyIdBase64 = Buffer.from(credential.rawId).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  return {
    keyId: credential.id,
    keyIdBase64,
    publicKeyHex: Buffer.from(rawPublicKey).toString('hex'),
    rawPublicKey,
  };
}

// 2. Authenticate a challenge using a registered passkey
export async function signChallenge(challengeBytes, keyIdBase64) {
  if (!isWebAuthnSupported()) {
    throw new Error("WebAuthn is not supported on this device/browser.");
  }

  const hostname = window.location.hostname;
  const rpId = hostname === 'localhost' || hostname === '127.0.0.1'
    ? hostname
    : 'stellarpay-debdeepa-duttas-projects.vercel.app';
  const allowCredentials = [];
  
  if (keyIdBase64) {
    // Revert base64url to standard base64 for Buffer parsing
    const standardBase64 = keyIdBase64.replace(/-/g, '+').replace(/_/g, '/');
    allowCredentials.push({
      type: "public-key",
      id: new Uint8Array(Buffer.from(standardBase64, 'base64')),
    });
  }

  const options = {
    publicKey: {
      challenge: challengeBytes,
      rpId,
      allowCredentials,
      userVerification: "preferred", // biometric preferred, PIN fallback if no biometrics
      timeout: 60000,
    }
  };

  console.log("[Passkey] Requesting assertion for credential ID:", keyIdBase64);
  const assertion = await navigator.credentials.get(options);

  if (!assertion || !assertion.response) {
    throw new Error("WebAuthn assertion failed: empty response.");
  }

  // Convert ASN.1 DER signature to compact 64 bytes (R || S)
  const derSig = new Uint8Array(assertion.response.signature);
  const compactSig = convertEcdsaSignatureAsnToCompact(derSig);

  return {
    authenticatorData: new Uint8Array(assertion.response.authenticatorData),
    clientDataJSON: new Uint8Array(assertion.response.clientDataJSON),
    signature: compactSig,
    keyIdBase64: Buffer.from(assertion.rawId).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''),
  };
}

// Helper to build the Soroban ScVal for our Rust Custom Account Signature type
export function buildSorobanSignatureScVal(authenticatorData, clientDataJSON, signature) {
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('authenticator_data'),
      val: xdr.ScVal.scvBytes(Buffer.from(authenticatorData)),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('client_data_json'),
      val: xdr.ScVal.scvBytes(Buffer.from(clientDataJSON)),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('signature'),
      val: xdr.ScVal.scvBytes(Buffer.from(signature)),
    }),
  ]);
}

// 3. Loop through transaction auth entries, request passkey signatures, and inject them
export async function signSorobanAuthsWithPasskey(tx, keyIdBase64, walletAddressHex) {
  const auths = [];
  
  if (tx && tx.tx && typeof tx.tx.operations === 'function') {
    const operations = tx.tx.operations();
    for (const op of operations) {
      const opBody = op.body();
      if (opBody && opBody.switch().name === 'invokeHostFunction') {
        const invokeHostFn = opBody.invokeHostFunctionOp();
        if (invokeHostFn && typeof invokeHostFn.auth === 'function') {
          const opAuths = invokeHostFn.auth();
          if (opAuths && Array.isArray(opAuths)) {
            auths.push(...opAuths);
          }
        }
      }
    }
  }

  // Fallback for older versions if they exist
  if (auths.length === 0 && typeof tx.sorobanAuth === 'function') {
    const legacyAuths = tx.sorobanAuth();
    if (legacyAuths && Array.isArray(legacyAuths)) {
      auths.push(...legacyAuths);
    }
  }

  if (auths.length === 0) {
    console.log("[Passkey] No auth entries in transaction requiring signature.");
    return tx;
  }

  console.log(`[Passkey] Signing ${auths.length} auth entries with passkey...`);

  for (let i = 0; i < auths.length; i++) {
    const entry = auths[i];
    const credentials = entry.credentials();
    
    // Only sign address credentials matching our smart wallet address
    if (credentials.switch().name === 'sorobanCredentialsAddress' || credentials.switch().name === 'sorobanCredentialsAddressV2') {
      const addressVal = credentials.switch().name === 'sorobanCredentialsAddress' 
        ? credentials.address().address() 
        : credentials.addressV2().address();
        
      const entryAddr = Address.fromScVal(addressVal).toString();
      if (entryAddr === walletAddressHex) {
        // Generate the 32-byte signature payload hash from the preimage
        // buildAuthorizationEntryPreimage was removed in stellar-sdk v15, we build it manually
        const preimageXdr = buildAuthPreimage(entry, Networks.TESTNET);
        const challengeHash = hash(preimageXdr); // 32-byte SHA-256 Buffer
        
        // Request WebAuthn signature
        const webauthnSig = await signChallenge(challengeHash, keyIdBase64);
        
        // Serialize signature struct as ScVal Map
        const scValSig = buildSorobanSignatureScVal(
          webauthnSig.authenticatorData,
          webauthnSig.clientDataJSON,
          webauthnSig.signature
        );
        
        // Set the signature on the credentials
        if (credentials.switch().name === 'sorobanCredentialsAddress') {
          credentials.address().signature(scValSig);
        } else {
          credentials.addressV2().signature(scValSig);
        }
        
        console.log(`[Passkey] Successfully signed auth entry ${i} for smart wallet ${walletAddressHex}`);
      }
    }
  }

  return tx;
}

// 4. Send transaction to the backend relayer for fee sponsorship and submission
export async function sponsorAndSubmit(txXdr, relayerUrl) {
  const endpoint = relayerUrl || import.meta.env.VITE_SPONSOR_RELAYER_URL || 'http://localhost:3001/api/sponsor-and-submit';
  
  console.log(`[Relayer] Sending transaction to sponsor backend: ${endpoint}`);
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txXdr }),
  });

  const data = await response.json();
  
  if (!response.ok || !data.success) {
    let errorMsg = data.error || "Relayer transaction submission failed.";
    if (data.details) {
      errorMsg += ` | Details: ${typeof data.details === 'string' ? data.details : JSON.stringify(data.details)}`;
    }
    throw new Error(errorMsg);
  }

  return data;
}
