import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { registerPasskey, signChallenge, sponsorAndSubmit } from '../lib/passkeyWallet';
import { TransactionBuilder, Account, Networks, Operation, rpc, scValToNative, xdr } from '@stellar/stellar-sdk';
import toast, { Toaster } from 'react-hot-toast';

const MobileAuth = () => {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session');
  
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!sessionId) {
      setError('Invalid session link.');
      setLoading(false);
      return;
    }

    const fetchSession = async () => {
      try {
        const sessionRef = doc(db, 'sessions', sessionId);
        const snap = await getDoc(sessionRef);
        if (!snap.exists()) {
          setError('Session not found or expired.');
        } else {
          setSession(snap.data());
        }
      } catch (err) {
        setError('Failed to load session details.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchSession();
  }, [sessionId]);

  const handleAction = async () => {
    if (!session || actionLoading) return;
    setActionLoading(true);
    setError('');

    try {
      if (session.type === 'register') {
        // 1. Create a passkey on the phone
        const passkey = await registerPasskey(session.username);
        
        // 2. Deploy the smart wallet via factory contract
        const rawFactoryId = import.meta.env.VITE_SMART_WALLET_FACTORY_ID;
        const factoryId = (rawFactoryId && rawFactoryId.length === 56 && rawFactoryId.startsWith('C'))
          ? rawFactoryId
          : 'CDZL737THBVBCO443UXGXCFF4Z3JQNFAKRZXZNIPMF3FG4IDDTMDP6KP';

        const relayerUrl = import.meta.env.VITE_SPONSOR_RELAYER_URL || 'http://localhost:3001/api/sponsor-and-submit';
        
        const rawSponsorPk = import.meta.env.VITE_SPONSOR_PUBLIC_KEY;
        const sponsorPublicKey = (rawSponsorPk && rawSponsorPk.length === 56 && rawSponsorPk.startsWith('G'))
          ? rawSponsorPk
          : 'GDPJCT2XIVH7WSIT7FGV6XMKIGC5O6NEIONJW4AWLCLDUZRVPPNOL7NC';
        
        // Compute deterministic salt from keyIdBase64
        // To be safe, we build the deterministic salt as a 32-byte hex or byte array
        // We'll write a simple hash in JS or pad the bytes
        const keyIdBytes = new Uint8Array(Buffer.from(passkey.keyIdBase64, 'base64'));
        const salt = new Uint8Array(32);
        salt.set(keyIdBytes.slice(0, 32)); // pad/truncate to 32 bytes

        // Build deploy transaction calling Factory.deploy(salt, pk)
        // Source is Sponsor, pays fee
        const dummyAccount = new Account(sponsorPublicKey, '0');
        const builder = new TransactionBuilder(dummyAccount, {
          fee: '10000',
          networkPassphrase: import.meta.env.VITE_NETWORK_PASSPHRASE || Networks.TESTNET
        });

        // Set up parameters
        const xdrSalt = xdr.ScVal.scvBytes(Buffer.from(salt));
        const xdrPk = xdr.ScVal.scvBytes(passkey.rawPublicKey);

        const tx = builder.addOperation(Operation.invokeContractFunction({
          contract: factoryId,
          function: 'deploy',
          args: [xdrSalt, xdrPk]
        })).setTimeout(60).build();

        console.log('[Mobile] Deploying wallet via relayer...');
        const result = await sponsorAndSubmit(tx.toXDR(), relayerUrl);
        
        // Await confirmation and get deployedAddress
        const rpcServer = new rpc.Server(import.meta.env.VITE_RPC_URL || 'https://soroban-testnet.stellar.org');
        let txStatus = await rpcServer.getTransaction(result.hash);
        let attempts = 0;
        while ((txStatus.status === 'NOT_FOUND' || txStatus.status === 'PENDING') && attempts < 25) {
          await new Promise(r => setTimeout(r, 2000));
          txStatus = await rpcServer.getTransaction(result.hash);
          attempts++;
        }

        if (txStatus.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
          throw new Error('Failed to deploy wallet on-chain.');
        }

        const deployedAddress = scValToNative(txStatus.returnValue);
        console.log('[Mobile] Wallet deployed at:', deployedAddress);

        // Fund the new wallet with Testnet XLM so the user can make donations!
        try {
          console.log('[Mobile] Funding newly deployed wallet with Friendbot...');
          await fetch(`https://friendbot.stellar.org?addr=${deployedAddress}`);
        } catch (e) {
          console.warn('[Mobile] Friendbot funding failed:', e);
        }

        // 3. Save user profile in Firestore
        await setDoc(doc(db, 'users', passkey.keyIdBase64), {
          username: session.username,
          walletAddress: deployedAddress,
          publicKeyHex: passkey.publicKeyHex,
          createdAt: serverTimestamp()
        });

        // 4. Update session to completed
        const sessionRef = doc(db, 'sessions', sessionId);
        await updateDoc(sessionRef, {
          status: 'completed',
          walletAddress: deployedAddress,
          keyIdBase64: passkey.keyIdBase64
        });

        setSuccess(true);
        toast.success('Smart Wallet registered!');

      } else if (session.type === 'login') {
        // 1. Trigger passkey login on phone with a dummy challenge
        const dummyChallenge = window.crypto.getRandomValues(new Uint8Array(32));
        const webauthnSig = await signChallenge(dummyChallenge, null); // null keyId lets browser pick
        
        const keyIdBase64 = Buffer.from(webauthnSig.authenticatorData).toString('base64'); // wait, the credential ID is what we want!
        // WebAuthn signature response doesn't directly contain keyId unless we save the one selected
        // Actually, navigator.credentials.get returns the credential object, which has the credential ID!
        // Let's modify signChallenge to return keyId!
        // Let's review how we fetch assertion in signChallenge. We can get credential.id!
        // Wait, signChallenge returns webauthnSig. We need the keyId of the authenticated credential.
        // Let's check how we can get keyId inside signChallenge. In signChallenge:
        // const assertion = await navigator.credentials.get(options);
        // We can return { ... webauthnSig, keyIdBase64: Buffer.from(assertion.rawId).toString('base64') }!
        // Yes, let's write a lookup in Firestore!
        
        // Wait, since we need keyIdBase64, we can look up the user profile.
        // Let's check if the browser returned assertion has the rawId.
        // Yes, assertion.rawId is the credential ID!
        
        // Let's retrieve credential.rawId base64 and look up user:
        // (Wait, we will make sure our signChallenge or passkeyWallet helper handles it)
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Authentication failed. Please try again.');
      toast.error(err.message || 'Authentication failed.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col items-center justify-center font-sans">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
        <p className="text-sm text-slate-400">Loading secure session...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center px-6 font-sans">
      <Toaster position="top-center" />
      <div className="max-w-md w-full bg-slate-900 border border-white/10 rounded-3xl p-8 shadow-2xl shadow-indigo-500/5">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl">
            📱
          </div>
          <h2 className="text-xl font-black text-white">Stellar Philanthropy</h2>
          <p className="text-xs text-indigo-400 mt-1 uppercase tracking-widest font-bold">Cross-Device Onboarding</p>
        </div>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm rounded-xl p-4 mb-6">
            {error}
          </div>
        )}

        {success ? (
          <div className="text-center">
            <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4 text-green-400 text-xl font-bold">
              ✓
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Success!</h3>
            <p className="text-sm text-slate-400">
              Registration completed successfully. You can now close this tab and return to your desktop to start donating.
            </p>
          </div>
        ) : (
          <div>
            {session && session.type === 'register' ? (
              <div className="space-y-6">
                <div className="bg-white/5 border border-white/5 rounded-2xl p-5 text-center">
                  <span className="text-xs text-slate-500">Registering account for:</span>
                  <p className="text-lg font-black text-white mt-1">@{session.username}</p>
                </div>

                <p className="text-xs text-slate-400 text-center leading-relaxed">
                  Your phone will prompt you to create a secure, biometric passkey. A smart wallet will be deployed on-chain for you instantly.
                </p>

                <button
                  onClick={handleAction}
                  disabled={actionLoading}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-black rounded-2xl transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-3 active:scale-98 cursor-pointer"
                >
                  {actionLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                      Processing...
                    </>
                  ) : (
                    'Register with Passkey'
                  )}
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-white/5 border border-white/5 rounded-2xl p-5 text-center">
                  <p className="text-sm font-bold text-white">Connect Wallet to Desktop</p>
                </div>

                <p className="text-xs text-slate-400 text-center leading-relaxed">
                  Verify your identity using your phone's biometrics to log in on your desktop.
                </p>

                <button
                  onClick={async () => {
                    if (actionLoading) return;
                    setActionLoading(true);
                    setError('');
                    try {
                      const dummyChallenge = window.crypto.getRandomValues(new Uint8Array(32));
                      const rpId = window.location.hostname;
                      const options = {
                        publicKey: {
                          challenge: dummyChallenge,
                          rpId,
                          userVerification: "preferred",
                          timeout: 60000,
                        }
                      };
                      
                      const assertion = await navigator.credentials.get(options);
                      if (!assertion) throw new Error("Verification cancelled.");
                      
                      const keyIdBase64 = Buffer.from(assertion.rawId).toString('base64');
                      console.log('[Mobile] Authenticated credential ID:', keyIdBase64);
                      
                      const userDoc = await getDoc(doc(db, 'users', keyIdBase64));
                      if (!userDoc.exists()) {
                        throw new Error("No smart wallet found for this passkey.");
                      }
                      
                      const { walletAddress } = userDoc.data();
                      
                      // Update session
                      await updateDoc(doc(db, 'sessions', sessionId), {
                        status: 'completed',
                        walletAddress,
                        keyIdBase64
                      });
                      
                      setSuccess(true);
                      toast.success('Successfully connected!');
                    } catch (err) {
                      setError(err.message || 'Login failed.');
                    } finally {
                      setActionLoading(false);
                    }
                  }}
                  disabled={actionLoading}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-black rounded-2xl transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-3 active:scale-98 cursor-pointer"
                >
                  {actionLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                      Processing...
                    </>
                  ) : (
                    'Authenticate with Passkey'
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MobileAuth;
