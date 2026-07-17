import React, { useState, useEffect, useCallback } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Buffer } from 'buffer';

import { 
  Networks, 
  Transaction, 
  Account, 
  rpc, 
  nativeToScVal, 
  scValToNative, 
  Horizon, 
  Address,
  TransactionBuilder, 
  Operation,
  xdr
} from "@stellar/stellar-sdk";
import { 
  StellarWalletsKit, 
  WalletNetwork, 
  FreighterModule,
  xBullModule,
  AlbedoModule,
  HanaModule,
  LobstrModule,
  RabetModule
} from "@creit.tech/stellar-wallets-kit";
import {
  registerPasskey,
  signChallenge,
  signSorobanAuthsWithPasskey,
  sponsorAndSubmit
} from './lib/passkeyWallet';

// Components
import Navbar from './components/Navbar';

// Pages
import Landing from './pages/Landing';
import AdminPortal from './pages/AdminPortal';
import DonorMarketplace from './pages/DonorMarketplace';
import CampaignDetails from './pages/CampaignDetails';
import MobileAuth from './pages/MobileAuth';

// Firebase
import { db } from './firebase';
import { 
  collection, 
  setDoc, 
  query, 
  where, 
  onSnapshot, 
  updateDoc, 
  doc, 
  getDoc,
  serverTimestamp
} from 'firebase/firestore';


// Constants
const toI128 = (n) => nativeToScVal(BigInt(Math.floor(parseFloat(n) * 10000000)), { type: "i128" });

const validateContractId = (val, fallback) => {
  return (val && val.length === 56 && val.startsWith('C')) ? val : fallback;
};

const validatePublicKey = (val, fallback) => {
  return (val && val.length === 56 && val.startsWith('G')) ? val : fallback;
};

const CONTRACT_ID = "CBGFHRSQ275OQRZGOZXLO7JABDVTI5UIZLD7ETSAGJVI5WMIWGBC2TK4";
const VAULT_CONTRACT_ID = "CB7O4AJFIBTGQODDCOPQICCSHRA35WFTIA2ZZ5O6OUMKWV4ROZIE3BZD";
const DUMMY_ACCOUNT = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");
const server = new Horizon.Server(import.meta.env.VITE_HORIZON_URL || "https://horizon-testnet.stellar.org");
const rpcServer = new rpc.Server(import.meta.env.VITE_RPC_URL || "https://soroban-testnet.stellar.org");

const NETWORK_PASSPHRASE = import.meta.env.VITE_NETWORK_PASSPHRASE || Networks.TESTNET;
const SPONSOR_PUBLIC_KEY = validatePublicKey(import.meta.env.VITE_SPONSOR_PUBLIC_KEY, "GDPJCT2XIVH7WSIT7FGV6XMKIGC5O6NEIONJW4AWLCLDUZRVPPNOL7NC");
const RELAYER_URL = import.meta.env.VITE_SPONSOR_RELAYER_URL || "http://localhost:3001/api/sponsor-and-submit";
const FACTORY_CONTRACT_ID = validateContractId(import.meta.env.VITE_SMART_WALLET_FACTORY_ID, "CDZL737THBVBCO443UXGXCFF4Z3JQNFAKRZXZNIPMF3FG4IDDTMDP6KP");

const kit = new StellarWalletsKit({
  network: WalletNetwork.TESTNET,
  modules: [
    new FreighterModule(),
    new xBullModule(),
    new AlbedoModule(),
    new HanaModule(),
    new LobstrModule(),
    new RabetModule(),
  ],
});

const parseStellarError = (err) => {
  const msg = err.message || "Unknown error";
  const str = msg.toLowerCase();
  if (str.includes("insufficient balance") || str.includes("op_underfunded") || str.includes("underfunded")) {
    return "Insufficient balance! Please fund your Testnet wallet or verify your balance.";
  }
  if (str.includes("user rejected") || str.includes("declined") || str.includes("cancelled")) {
    return "Transaction was cancelled.";
  }
  if (str.includes("tx_bad_seq")) {
    return "Sequence number mismatch. Please try again.";
  }
  if (str.includes("not exist") || str.includes("404")) {
    return "Your account does not exist on Testnet. Please fund it using Friendbot first.";
  }
  return msg;
};

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();

  // Wallet State
  const [address, setAddress] = useState(() => localStorage.getItem('smart_wallet_address') || '');
  const [walletName, setWalletName] = useState(() => localStorage.getItem('smart_wallet_address') ? 'Smart Wallet' : '');
  const [balance, setBalance] = useState('0.00');

  // Passkey Smart Wallet State
  const [isPasskeyWallet, setIsPasskeyWallet] = useState(() => !!localStorage.getItem('smart_wallet_address'));
  const [passkeyKeyId, setPasskeyKeyId] = useState(() => localStorage.getItem('smart_wallet_key_id') || '');

  // Modals & Guided Walkthrough State
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [showQuickStartModal, setShowQuickStartModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrSessionId, setQrSessionId] = useState('');
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [walkthroughStep, setWalkthroughStep] = useState(1);
  const [quickStartUsername, setQuickStartUsername] = useState('');
  const [isRegistering, setIsRegistering] = useState(true);
  const [showConnectedConfirm, setShowConnectedConfirm] = useState(false);
  const [registeredAddress, setRegisteredAddress] = useState('');
  const [copied, setCopied] = useState(false);

  // Device Environment Detection
  const [deviceEnv] = useState(() => {
    const isMobile = typeof navigator !== 'undefined' ? /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) : false;
    const hasExtension = typeof window !== 'undefined' ? !!(window.freighter || window.xbull || window.albedo) : false;
    const primaryPath = (isMobile || !hasExtension) ? 'quickstart' : 'connect';
    return { isMobile, hasExtension, primaryPath };
  });

  // Campaign Data State
  const [campaigns, setCampaigns] = useState([]);
  const [allCampaigns, setAllCampaigns] = useState([]);
  const [firestoreError, setFirestoreError] = useState(null);

  // On-Chain Data
  const [totalDonations, setTotalDonations] = useState(0); 
  const [vaultStats] = useState({ total_deposited: '0', total_withdrawn: '0', current_balance: '0', deposit_count: 0 });
  
  const [isFetchingData, setIsFetchingData] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false);
  const [txStatus, setTxStatus] = useState(null);
  const [txHash, setTxHash] = useState('');
  const [lastDonationAt, setLastDonationAt] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(() => ({ wallet: Date.now(), vault: Date.now(), marketplace: Date.now() }));

  const [newCampaign, setNewCampaign] = useState({ 
    name: '', 
    description: '', 
    goal: '', 
    contractId: CONTRACT_ID, 
    vaultContractId: VAULT_CONTRACT_ID 
  });

  // Restoring smart wallet address and detecting device env is now done in lazy state initializers above.

  // Real-time listener for All Active Campaigns (no wallet needed)
  useEffect(() => {
    const q = query(
      collection(db, "campaigns"), 
      where("isActive", "==", true)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort locally to avoid Firebase composite index requirement
      data.sort((a, b) => {
        const timeA = a.createdAt?.toMillis() || 0;
        const timeB = b.createdAt?.toMillis() || 0;
        return timeB - timeA; // desc
      });
      setAllCampaigns(data);
      setFirestoreError(null);
      setLastUpdated(prev => ({ ...prev, marketplace: Date.now() }));
    }, (error) => {
      console.error("Firestore Error (Marketplace):", error);
      setFirestoreError(error.message || "Failed to load campaigns from database.");
      toast.error("Database error: " + (error.message || "Could not load campaigns."), { duration: 6000 });
    });
    return () => unsubscribe();
  }, []);

  // Real-time listener for Admin's Campaigns — resets when wallet changes/disconnects
  useEffect(() => {
    if (!address) {
      Promise.resolve().then(() => setCampaigns(prev => prev.length > 0 ? [] : prev)); // Clear stale campaigns when wallet disconnects
      return;
    }
    const q = query(
      collection(db, "campaigns"), 
      where("adminWallet", "==", address)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort locally — newest first
      data.sort((a, b) => {
        const timeA = a.createdAt?.toMillis() || 0;
        const timeB = b.createdAt?.toMillis() || 0;
        return timeB - timeA;
      });
      setCampaigns(data);
    }, (error) => {
      console.error("Firestore Error (Admin):", error);
      toast.error("Could not load your campaigns: " + (error.message || "Database error."), { duration: 6000 });
    });
    return () => unsubscribe();
  }, [address]);


  const fetchData = useCallback(async () => {
    if (!address) return;
    setIsFetchingData(true);
    try {
      if (address.startsWith('C')) {
        const NATIVE_CONTRACT = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
        const tx = new TransactionBuilder(DUMMY_ACCOUNT, { fee: '100', networkPassphrase: NETWORK_PASSPHRASE })
          .addOperation(Operation.invokeContractFunction({
            contract: NATIVE_CONTRACT,
            function: 'balance',
            args: [new Address(address).toScVal()]
          })).setTimeout(30).build();
        
        const sim = await rpcServer.simulateTransaction(tx);
        if (sim.result && sim.result.retval) {
          const val = scValToNative(sim.result.retval);
          setBalance((Number(val) / 10000000).toFixed(2));
        } else {
          setBalance('0.00');
        }
      } else {
        const account = await server.loadAccount(address);
        const native = account.balances.find(b => b.asset_type === 'native');
        setBalance(native ? parseFloat(native.balance).toFixed(2) : '0.00');
      }

      // Only aggregate stats from campaigns currently in YOUR Firestore
      const campaignTotals = allCampaigns.map(c => parseFloat(c.totalDonated || 0));
      const totalSum = campaignTotals.reduce((a, b) => a + b, 0);
      setTotalDonations(totalSum);

      setLastUpdated(prev => ({ ...prev, wallet: Date.now(), vault: Date.now() }));
    } catch (e) {
      console.error("Fetch failed", e);
    } finally {
      setIsFetchingData(false);
    }
  }, [address, allCampaigns]);

  useEffect(() => {
    if (address) {
      Promise.resolve().then(() => fetchData());
      const timer = setInterval(fetchData, 15000);
      return () => clearInterval(timer);
    }
  }, [address, fetchData]);

  const connectWallet = async () => {
    console.log("Connect Wallet triggered -> opening onboarding choices");
    setShowOnboardingModal(true);
  };

  const connectExtensionWallet = async () => {
    console.log("Connect Extension Wallet triggered");
    try {
      await kit.openModal({
        onWalletSelected: async (walletOption) => {
          console.log("Wallet selected:", walletOption);
          try {
            const idToSet = typeof walletOption === 'string' ? walletOption : walletOption.id;
            const nameToSet = typeof walletOption === 'string' ? walletOption : (walletOption.name || walletOption.id);
            
            kit.setWallet(idToSet);
            
            let walletAddress;
            try {
              const result = await kit.getAddress();
              walletAddress = result.address;
            } catch (addrErr) {
              // xBull and some wallets throw raw objects on rejection
              const reason = typeof addrErr === 'string' ? addrErr 
                : addrErr?.message 
                ? addrErr.message 
                : JSON.stringify(addrErr, null, 2);
              console.error("getAddress failed:", reason);
              toast.error("Wallet rejected: " + reason);
              return;
            }
            
            if (walletAddress) {
              setAddress(walletAddress);
              const displayName = nameToSet.charAt(0).toUpperCase() + nameToSet.slice(1);
              setWalletName(displayName);
              setIsPasskeyWallet(false);
              setPasskeyKeyId('');
              localStorage.removeItem("smart_wallet_address");
              localStorage.removeItem("smart_wallet_key_id");
              toast.success("Wallet Connected!");
              fetchData();
            }
          } catch (err) {
            console.error("Connection Error:", err);
            const errorMsg = typeof err === 'string' ? err 
              : err?.message ? err.message 
              : JSON.stringify(err, null, 2);
            toast.error("Failed to connect: " + errorMsg);
          }
        },
      });
    } catch (e) {
      console.error("Modal Error:", e);
      const msg = typeof e === 'string' ? e : e?.message ? e.message : JSON.stringify(e, null, 2);
      toast.error("Modal error: " + msg);
    }
  };




  const handleRegisterPasskey = async (username) => {
    if (!username.trim()) return toast.error("Username is required");
    try {
      toast.loading("Creating passkey...", { id: "passkey_deploy" });
      const passkey = await registerPasskey(username);
      
      const keyIdBytes = new Uint8Array(Buffer.from(passkey.keyIdBase64, 'base64'));
      const salt = new Uint8Array(32);
      salt.set(keyIdBytes.slice(0, 32));

      // Build deployment transaction (Sponsor pays fee)
      const dummyAccount = new Account(SPONSOR_PUBLIC_KEY, '0');
      const builder = new TransactionBuilder(dummyAccount, {
        fee: '10000',
        networkPassphrase: NETWORK_PASSPHRASE
      });

      const xdrSalt = xdr.ScVal.scvBytes(Buffer.from(salt));
      const xdrPk = xdr.ScVal.scvBytes(passkey.rawPublicKey);

      const tx = builder.addOperation(Operation.invokeContractFunction({
        contract: FACTORY_CONTRACT_ID,
        function: 'deploy',
        args: [xdrSalt, xdrPk]
      })).setTimeout(60).build();

      console.log("[Client] Deploying smart wallet through Relayer...");
      toast.loading("Deploying wallet contract on-chain...", { id: "passkey_deploy" });
      
      const result = await sponsorAndSubmit(tx.toXDR(), RELAYER_URL);
      
      // Wait for confirmation
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
      console.log("[Client] Wallet deployed at:", deployedAddress);

      // Fund the new wallet with Testnet XLM so the user can make donations!
      try {
        console.log("[Client] Funding newly deployed wallet from Relayer...");
        await fetch(`${RELAYER_URL.replace('/sponsor-and-submit', '/fund-contract')}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contractId: deployedAddress })
        });
      } catch (e) {
        console.warn("[Client] Relayer funding failed:", e);
      }

      // Save user profile in Firestore
      await setDoc(doc(db, 'users', passkey.keyIdBase64), {
        username,
        walletAddress: deployedAddress,
        publicKeyHex: passkey.publicKeyHex,
        createdAt: serverTimestamp()
      });

      setAddress(deployedAddress);
      setPasskeyKeyId(passkey.keyIdBase64);
      setIsPasskeyWallet(true);
      setWalletName("Smart Wallet (Passkey)");
      
      localStorage.setItem("smart_wallet_address", deployedAddress);
      localStorage.setItem("smart_wallet_key_id", passkey.keyIdBase64);

      toast.dismiss("passkey_deploy");
      setRegisteredAddress(deployedAddress);
      setShowConnectedConfirm(true);
      setShowQuickStartModal(false);
      setShowOnboardingModal(false);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.dismiss("passkey_deploy");
      toast.error("Registration failed: " + (err.message || err));
    }
  };

  const handleLoginPasskey = async () => {
    try {
      toast.loading("Authenticating via Passkey...", { id: "passkey_login" });
      const dummyChallenge = window.crypto.getRandomValues(new Uint8Array(32));
      const webauthnSig = await signChallenge(dummyChallenge, null);

      const keyIdBase64 = webauthnSig.keyIdBase64;
      const userDoc = await getDoc(doc(db, 'users', keyIdBase64));
      if (!userDoc.exists()) {
        throw new Error("No smart wallet found associated with this passkey. Please register first.");
      }

      const { walletAddress } = userDoc.data();
      
      setAddress(walletAddress);
      setPasskeyKeyId(keyIdBase64);
      setIsPasskeyWallet(true);
      setWalletName("Smart Wallet (Passkey)");
      
      localStorage.setItem("smart_wallet_address", walletAddress);
      localStorage.setItem("smart_wallet_key_id", keyIdBase64);

      toast.dismiss("passkey_login");
      toast.success("Welcome back!");
      setShowQuickStartModal(false);
      setShowOnboardingModal(false);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.dismiss("passkey_login");
      toast.error("Login failed: " + (err.message || err));
    }
  };

  const handleMobileAuthStart = async () => {
    try {
      const sessionId = doc(collection(db, "sessions")).id;
      await setDoc(doc(db, "sessions", sessionId), {
        status: "pending",
        type: isRegistering ? "register" : "login",
        username: isRegistering ? quickStartUsername : "",
        createdAt: serverTimestamp()
      });
      
      setQrSessionId(sessionId);
      setShowQRModal(true);
      
      const unsubscribe = onSnapshot(doc(db, "sessions", sessionId), (snapshot) => {
        const data = snapshot.data();
        if (data && data.status === "completed") {
          setAddress(data.walletAddress);
          setPasskeyKeyId(data.keyIdBase64);
          setIsPasskeyWallet(true);
          setWalletName("Smart Wallet (Passkey)");
          
          localStorage.setItem("smart_wallet_address", data.walletAddress);
          localStorage.setItem("smart_wallet_key_id", data.keyIdBase64);
          
          if (data.type === "register") {
            setRegisteredAddress(data.walletAddress);
            setShowConnectedConfirm(true);
          } else {
            toast.success("Connected via Mobile Passkey!");
          }
          
          setShowQRModal(false);
          setShowQuickStartModal(false);
          setShowOnboardingModal(false);
          unsubscribe();
        }
      });
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate cross-device session.");
    }
  };

  const handleCopyAddress = () => {
    if (!registeredAddress) return;
    navigator.clipboard.writeText(registeredAddress);
    setCopied(true);
    toast.success("Address copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDonate = async (campaignId, targetContractId, amount) => {
    if (!address) {
      await connectWallet();
      return;
    }
    console.log("--- STARTING DONATION PROCESS ---");
    console.log("Campaign ID:", campaignId);
    console.log("Contract:", targetContractId);
    console.log("Amount:", amount);
    
    setIsSending(true);
    setTxStatus('sending');
    try {
      if (isPasskeyWallet) {
        // Passkey relayer sponsored transaction path
        const dummyAccount = new Account(SPONSOR_PUBLIC_KEY, '0');
        const builder = new TransactionBuilder(dummyAccount, {
          fee: '10000',
          networkPassphrase: NETWORK_PASSPHRASE
        });

        const campaignSymbol = nativeToScVal(campaignId.substring(0, 32), { type: "symbol" });
        const tx = builder.addOperation(Operation.invokeContractFunction({
          contract: targetContractId,
          function: "donate",
          args: [campaignSymbol, Address.fromString(address).toScVal(), toI128(amount)]
        })).setTimeout(60).build();

        console.log("Simulating on Soroban...");
        const sim = await rpcServer.simulateTransaction(tx);
        if (rpc.Api.isSimulationError(sim)) {
          console.error("Simulation failed:", sim.error);
          throw new Error("Simulation failed: The contract rejected this donation (check your balance or contract status).");
        }

        console.log("Assembling and signing with Passkey...");
        let prepared = rpc.assembleTransaction(tx, sim).build();
        prepared = await signSorobanAuthsWithPasskey(prepared, passkeyKeyId, address, sim.latestLedger);

        console.log("Submitting to Sponsor Relayer...");
        const result = await sponsorAndSubmit(prepared.toXDR(), RELAYER_URL);
        console.log("Transaction Hash:", result.hash);

        // Poll for confirmation
        let res = await rpcServer.getTransaction(result.hash);
        let attempts = 0;
        while ((res.status === "NOT_FOUND" || res.status === "PENDING") && attempts < 25) {
          await new Promise(r => setTimeout(r, 2000));
          res = await rpcServer.getTransaction(result.hash);
          attempts++;
        }

        if (res.status === rpc.Api.GetTransactionStatus.SUCCESS) {
          setTxStatus('success');
          setTxHash(result.hash);
          setLastDonationAt(Date.now());
          toast.success("Donation successful!");

          if (campaignId) {
            const campaignRef = doc(db, "campaigns", campaignId);
            getDoc(campaignRef).then((campaignSnap) => {
              if (campaignSnap.exists()) {
                const currentDonated = parseFloat(campaignSnap.data().totalDonated || 0);
                updateDoc(campaignRef, {
                  totalDonated: currentDonated + parseFloat(amount)
                }).catch(err => console.error("updateDoc error:", err));
              }
            });
          }

          fetchData();
          setTimeout(() => setTxStatus(null), 5000);
        } else {
          throw new Error("Transaction failed on-chain");
        }
      } else {
        // Standard Freighter path
        console.log("Step 1: Building Transaction...");
        let account;
        try {
          account = await server.loadAccount(address);
        } catch (err) {
          if (err?.response?.status === 404) {
            throw new Error("Your account does not exist on Testnet. Please fund it using Friendbot first.", { cause: err });
          }
          console.warn("Could not load account from Horizon, using fallback:", err);
          account = new Account(address, "0");
        }

        const builder = new TransactionBuilder(account, { fee: "10000", networkPassphrase: NETWORK_PASSPHRASE });
        const campaignSymbol = nativeToScVal(campaignId.substring(0, 32), { type: "symbol" });
        const tx = builder.addOperation(Operation.invokeContractFunction({
          contract: targetContractId,
          function: "donate",
          args: [campaignSymbol, Address.fromString(address).toScVal(), toI128(amount)]
        })).setTimeout(60).build();

        console.log("Step 2: Simulating on Soroban...");
        const sim = await rpcServer.simulateTransaction(tx);
        if (rpc.Api.isSimulationError(sim)) {
          console.error("Simulation failed details:", sim.error);
          throw new Error("Simulation failed: The contract rejected this donation (check your balance or contract status).");
        }
        
        console.log("Step 3: Signing with Wallet...");
        const prepared = rpc.assembleTransaction(tx, sim).build();
        const { signedTxXdr } = await kit.signTransaction(prepared.toXDR(), { networkPassphrase: NETWORK_PASSPHRASE });
        
        console.log("Step 4: Submitting to Network...");
        const send = await rpcServer.sendTransaction(TransactionBuilder.fromXDR(signedTxXdr, NETWORK_PASSPHRASE));
        console.log("Transaction Hash:", send.hash, "Status:", send.status);
        
        if (send.status === "ERROR") {
          throw new Error(`Transaction rejected by network: ${send.errorResultXdr || send.errorResult || "Unknown"}`);
        }
        
        console.log("Step 5: Waiting for confirmation (polling)...");
        let res = await rpcServer.getTransaction(send.hash);
        let attempts = 0;
        while ((res.status === "NOT_FOUND" || res.status === "PENDING") && attempts < 25) {
          await new Promise(r => setTimeout(r, 2000));
          res = await rpcServer.getTransaction(send.hash);
          attempts++;
        }

        if (res.status === rpc.Api.GetTransactionStatus.SUCCESS) {
          setTxStatus('success');
          setTxHash(send.hash);
          setLastDonationAt(Date.now());
          toast.success("Donation successful!");

          if (campaignId) {
            const campaignRef = doc(db, "campaigns", campaignId);
            getDoc(campaignRef).then((campaignSnap) => {
              if (campaignSnap.exists()) {
                const currentDonated = parseFloat(campaignSnap.data().totalDonated || 0);
                updateDoc(campaignRef, {
                  totalDonated: currentDonated + parseFloat(amount)
                }).catch(err => console.error("updateDoc error:", err));
              }
            });
          }

          fetchData();
          setTimeout(() => setTxStatus(null), 5000);
        } else {
          throw new Error("Transaction failed");
        }
      }
    } catch (e) {
      console.error("!!! DONATION FAILED !!!", e);
      toast.error(parseStellarError(e));
      setTxStatus('failure');
      setTimeout(() => setTxStatus(null), 3000);
    } finally {
      setIsSending(false);
    }
  };

  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    if (!address) return toast.error("Connect wallet first");
    if (!newCampaign.name.trim()) return toast.error("Campaign name is required");
    if (!newCampaign.goal || parseFloat(newCampaign.goal) <= 0) return toast.error("Please enter a valid goal");

    setIsCreatingCampaign(true);
    try {
      const campaignsRef = collection(db, "campaigns");
      const docRef = doc(campaignsRef);
      const campaignId = docRef.id;

      const targetContractId = newCampaign.contractId || CONTRACT_ID;
      const campaignSymbol = nativeToScVal(campaignId.substring(0, 32), { type: "symbol" });
      const goalInStroops = toI128(newCampaign.goal);

      let sendHash;
      if (isPasskeyWallet) {
        // Build sponsored transaction
        const dummyAccount = new Account(SPONSOR_PUBLIC_KEY, '0');
        const builder = new TransactionBuilder(dummyAccount, {
          fee: '10000',
          networkPassphrase: NETWORK_PASSPHRASE
        });

        const tx = builder.addOperation(Operation.invokeContractFunction({
          contract: targetContractId,
          function: "create_campaign",
          args: [campaignSymbol, Address.fromString(address).toScVal(), goalInStroops]
        })).setTimeout(60).build();

        const sim = await rpcServer.simulateTransaction(tx);
        if (rpc.Api.isSimulationError(sim)) {
          throw new Error("Failed to simulate on-chain: " + (sim.error || "Unknown error"));
        }

        let prepared = rpc.assembleTransaction(tx, sim).build();
        prepared = await signSorobanAuthsWithPasskey(prepared, passkeyKeyId, address, sim.latestLedger);

        const result = await sponsorAndSubmit(prepared.toXDR(), RELAYER_URL);
        sendHash = result.hash;
      } else {
        let account;
        try {
          account = await server.loadAccount(address);
        } catch {
          account = new Account(address, "0");
        }
        const builder = new TransactionBuilder(account, { fee: "10000", networkPassphrase: NETWORK_PASSPHRASE });
        const tx = builder.addOperation(Operation.invokeContractFunction({
          contract: targetContractId,
          function: "create_campaign",
          args: [campaignSymbol, Address.fromString(address).toScVal(), goalInStroops]
        })).setTimeout(60).build();

        const sim = await rpcServer.simulateTransaction(tx);
        if (rpc.Api.isSimulationError(sim)) {
          throw new Error("Failed to simulate on-chain: " + (sim.error || "Unknown error"));
        }

        const prepared = rpc.assembleTransaction(tx, sim).build();
        const { signedTxXdr } = await kit.signTransaction(prepared.toXDR(), { networkPassphrase: NETWORK_PASSPHRASE });
        const send = await rpcServer.sendTransaction(TransactionBuilder.fromXDR(signedTxXdr, NETWORK_PASSPHRASE));
        if (send.status === "ERROR") {
          throw new Error(`Transaction rejected: ${send.errorResultXdr || "Unknown"}`);
        }
        sendHash = send.hash;
      }

      await setDoc(docRef, {
        name: newCampaign.name.trim(),
        description: newCampaign.description.trim(),
        goal: parseFloat(newCampaign.goal),
        adminWallet: address,
        totalDonated: 0,
        isActive: true,
        isOnChain: false,
        createdAt: serverTimestamp(),
        donationContractId: newCampaign.contractId || CONTRACT_ID,
        vaultContractId: newCampaign.vaultContractId || VAULT_CONTRACT_ID,
        txHash: sendHash
      });

      toast.success("Campaign created! Confirming on blockchain in background...", { duration: 5000 });
      setNewCampaign({ name: '', description: '', goal: '', contractId: CONTRACT_ID, vaultContractId: VAULT_CONTRACT_ID });
      navigate('/admin');

      (async () => {
        try {
          let res = await rpcServer.getTransaction(sendHash);
          let attempts = 0;
          while ((res.status === "NOT_FOUND" || res.status === "PENDING") && attempts < 30) {
            await new Promise(r => setTimeout(r, 2000));
            res = await rpcServer.getTransaction(sendHash);
            attempts++;
          }
          if (res.status === rpc.Api.GetTransactionStatus.SUCCESS) {
            await updateDoc(docRef, { isOnChain: true });
            toast.success("✅ Campaign successfully registered on Stellar!", { duration: 6000 });
          }
        } catch (bgErr) {
          console.warn("Background confirmation polling failed:", bgErr);
        }
      })();

    } catch (err) {
      console.error("Campaign Create Error:", err);
      toast.error("Failed to save campaign: " + (err.message || err));
    } finally {
      setIsCreatingCampaign(false);
    }
  };

  const handleRegisterOnChain = async (campaignId, targetContractId, goal) => {
    if (!address) {
      await connectWallet();
      return false;
    }
    console.log("--- STARTING ON-CHAIN REGISTRATION ---");
    try {
      const campaignSymbol = nativeToScVal(campaignId.substring(0, 32), { type: "symbol" });
      const goalInStroops = toI128(goal);

      let sendHash;
      if (isPasskeyWallet) {
        // Build sponsored transaction
        const dummyAccount = new Account(SPONSOR_PUBLIC_KEY, '0');
        const builder = new TransactionBuilder(dummyAccount, {
          fee: '10000',
          networkPassphrase: NETWORK_PASSPHRASE
        });

        const tx = builder.addOperation(Operation.invokeContractFunction({
          contract: targetContractId,
          function: "create_campaign",
          args: [campaignSymbol, Address.fromString(address).toScVal(), goalInStroops]
        })).setTimeout(60).build();

        const sim = await rpcServer.simulateTransaction(tx);
        if (rpc.Api.isSimulationError(sim)) {
          throw new Error("Failed to simulate on-chain: " + (sim.error || "Unknown error"));
        }

        let prepared = rpc.assembleTransaction(tx, sim).build();
        prepared = await signSorobanAuthsWithPasskey(prepared, passkeyKeyId, address);

        const result = await sponsorAndSubmit(prepared.toXDR(), RELAYER_URL);
        sendHash = result.hash;
      } else {
        let account;
        try {
          account = await server.loadAccount(address);
        } catch {
          account = new Account(address, "0");
        }

        const builder = new TransactionBuilder(account, { fee: "10000", networkPassphrase: NETWORK_PASSPHRASE });
        const tx = builder.addOperation(Operation.invokeContractFunction({
          contract: targetContractId,
          function: "create_campaign",
          args: [campaignSymbol, Address.fromString(address).toScVal(), goalInStroops]
        })).setTimeout(60).build();

        const sim = await rpcServer.simulateTransaction(tx);
        if (rpc.Api.isSimulationError(sim)) {
          throw new Error("Failed to register campaign on-chain: " + (sim.error || "Unknown error"));
        }

        const prepared = rpc.assembleTransaction(tx, sim).build();
        const { signedTxXdr } = await kit.signTransaction(prepared.toXDR(), { networkPassphrase: NETWORK_PASSPHRASE });
        const send = await rpcServer.sendTransaction(new Transaction(signedTxXdr, NETWORK_PASSPHRASE));
        if (send.status === "ERROR") {
          throw new Error(`On-chain campaign creation rejected: ${send.errorResultXdr || "Unknown"}`);
        }
        sendHash = send.hash;
      }

      let res = await rpcServer.getTransaction(sendHash);
      let attempts = 0;
      while ((res.status === "NOT_FOUND" || res.status === "PENDING") && attempts < 25) {
        await new Promise(r => setTimeout(r, 2000));
        res = await rpcServer.getTransaction(sendHash);
        attempts++;
      }

      if (res.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        toast.success("Campaign launched on-chain!");
        await updateDoc(doc(db, "campaigns", campaignId), { isOnChain: true });
        fetchData();
        return true;
      } else {
        throw new Error("Transaction failed on-chain");
      }
    } catch (e) {
      console.error("On-chain registration failed:", e);
      toast.error("Failed to register campaign: " + parseStellarError(e));
      return false;
    }
  };

  const deleteCampaign = async (id) => {
    try {
      await updateDoc(doc(db, "campaigns", id), { isActive: false });
      toast.success("Campaign deactivated");
    } catch {
      toast.error("Failed to deactivate");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-indigo-500/30 font-sans">
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-marketplace-card {
          animation: fadeIn 0.5s ease-out forwards;
        }
      `}</style>
      <Toaster position="bottom-right" />
      
      <Navbar 
        address={address} 
        isConnected={!!address} 
        onDisconnect={() => { setAddress(''); setWalletName(''); setBalance('0.00'); setCampaigns([]); }} 
        walletName={walletName}
        onConnect={connectWallet}
      />
      
      <div className="pt-24 pb-12">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/admin" element={
            <AdminPortal 
              address={address}
              campaigns={campaigns}
              isSending={isCreatingCampaign}
              newCampaign={newCampaign}
              setNewCampaign={setNewCampaign}
              handleCreateCampaign={handleCreateCampaign}
              deleteCampaign={deleteCampaign}
              totalDonations={totalDonations}
              vaultStats={vaultStats}
              lastUpdated={lastUpdated}
              fetchData={fetchData}
              CONTRACT_ID={CONTRACT_ID}
              VAULT_CONTRACT_ID={VAULT_CONTRACT_ID}
              kit={kit}
            />
          } />
          <Route path="/donor" element={<DonorMarketplace campaigns={allCampaigns} firestoreError={firestoreError} />} />
          <Route path="/campaign/:id" element={
            <CampaignDetails 
              address={address}
              balance={balance}
              isFetchingData={isFetchingData}
              handleDonate={handleDonate}
              handleRegisterOnChain={handleRegisterOnChain}
              isSending={isSending}
              txStatus={txStatus}
              txHash={txHash}
              lastDonationAt={lastDonationAt}
              lastUpdated={lastUpdated}
              fetchData={fetchData}
            />
          } />
          <Route path="/mobile-auth" element={<MobileAuth />} />
        </Routes>
      </div>

      {!address && location.pathname !== '/' && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
          <button 
            onClick={connectWallet}
            className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl transition-all shadow-2xl shadow-indigo-600/40 flex items-center gap-3 active:scale-95"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Connect Wallet to Interact
          </button>
        </div>
      )}

      {/* Onboarding Choices Modal */}
      {showOnboardingModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-slate-900 border border-white/10 w-full max-w-2xl rounded-3xl p-8 shadow-2xl relative">
            <button 
              onClick={() => setShowOnboardingModal(false)}
              className="absolute top-6 right-6 text-slate-400 hover:text-white text-xl cursor-pointer"
            >
              ✕
            </button>
            <h3 className="text-2xl font-black text-white mb-2 text-center">Join Stellar Philanthropy</h3>
            <p className="text-sm text-slate-400 text-center mb-8 font-medium">Choose the onboarding option that fits you best.</p>
            
            <div className="grid md:grid-cols-2 gap-6">
              {/* Quick Start Passkey */}
              <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 hover:border-indigo-500/50 transition-all rounded-2xl p-6 flex flex-col justify-between">
                <div>
                  <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 rounded-xl flex items-center justify-center text-xl mb-4">
                    ⚡
                  </div>
                  <h4 className="text-lg font-bold text-white mb-2">Quick Start</h4>
                  <p className="text-xs text-slate-400 leading-relaxed mb-6 font-medium">
                    Create a smart wallet using your device's biometrics (Face ID, Touch ID, or Windows Hello). No installation or setup required.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowOnboardingModal(false);
                    setIsRegistering(true);
                    setShowQuickStartModal(true);
                  }}
                  className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/30 cursor-pointer active:scale-98"
                >
                  Get Started
                </button>
              </div>

              {/* Standard Extension */}
              <div className="bg-white/5 border border-white/5 hover:border-white/20 transition-all rounded-2xl p-6 flex flex-col justify-between">
                <div>
                  <div className="w-12 h-12 bg-white/5 text-slate-300 rounded-xl flex items-center justify-center text-xl mb-4">
                    🔌
                  </div>
                  <h4 className="text-lg font-bold text-white mb-2">Extension Wallet</h4>
                  <p className="text-xs text-slate-400 leading-relaxed mb-6 font-medium">
                    Connect via Freighter, xBull, Albedo, or Lobstr. Best for power users who already have a Stellar wallet.
                  </p>
                </div>
                <div className="space-y-3">
                  <button
                    onClick={() => {
                      setShowOnboardingModal(false);
                      connectExtensionWallet();
                    }}
                    className="w-full py-3.5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl transition-all cursor-pointer active:scale-98"
                  >
                    Connect Wallet
                  </button>
                  
                  {!deviceEnv.hasExtension && (
                    <button
                      onClick={() => {
                        setShowOnboardingModal(false);
                        setWalkthroughStep(1);
                        setShowWalkthrough(true);
                      }}
                      className="w-full text-center text-xs text-indigo-400 hover:underline cursor-pointer font-bold block"
                    >
                      Don't have a wallet? Install Freighter
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Start Passkey Modal */}
      {showQuickStartModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-white/10 w-full max-w-md rounded-3xl p-8 shadow-2xl relative">
            <button 
              onClick={() => setShowQuickStartModal(false)}
              className="absolute top-6 right-6 text-slate-400 hover:text-white text-xl cursor-pointer"
            >
              ✕
            </button>
            <div className="text-center mb-6">
              <span className="text-xs font-black text-indigo-400 tracking-wider uppercase">Passkey Smart Wallet</span>
              <h3 className="text-xl font-black text-white mt-1">
                {isRegistering ? 'Create Your Account' : 'Welcome Back'}
              </h3>
            </div>

            {isRegistering ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-2">Username / Alias</label>
                  <input
                    type="text"
                    value={quickStartUsername}
                    onChange={(e) => setQuickStartUsername(e.target.value)}
                    placeholder="e.g. alice"
                    className="w-full px-4 py-3 bg-slate-950 border border-white/10 rounded-xl focus:border-indigo-500 focus:outline-none text-white text-sm"
                  />
                </div>
                <button
                  onClick={() => handleRegisterPasskey(quickStartUsername)}
                  className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/30 cursor-pointer active:scale-98"
                >
                  Create Passkey & Wallet
                </button>
                <div className="text-center">
                  <span className="text-xs text-slate-500 font-bold">or</span>
                </div>
                <button
                  onClick={handleMobileAuthStart}
                  className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 text-white font-bold rounded-xl transition-all text-sm cursor-pointer"
                >
                  📱 Register with Mobile Phone
                </button>
                <div className="text-center pt-2">
                  <button 
                    onClick={() => setIsRegistering(false)}
                    className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                  >
                    Already have a passkey? Sign in
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <button
                  onClick={handleLoginPasskey}
                  className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                >
                  🔑 Sign in with Passkey
                </button>
                <div className="text-center">
                  <span className="text-xs text-slate-500 font-bold">or</span>
                </div>
                <button
                  onClick={handleMobileAuthStart}
                  className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 text-white font-bold rounded-xl transition-all text-sm cursor-pointer"
                >
                  📱 Sign in with Mobile Phone
                </button>
                <div className="text-center pt-2">
                  <button 
                    onClick={() => setIsRegistering(true)}
                    className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                  >
                    Need a new account? Register
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* QR Code Cross-device Modal */}
      {showQRModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-white/10 w-full max-w-md rounded-3xl p-8 shadow-2xl relative text-center">
            <button 
              onClick={() => setShowQRModal(false)}
              className="absolute top-6 right-6 text-slate-400 hover:text-white text-xl cursor-pointer"
            >
              ✕
            </button>
            <h3 className="text-xl font-black text-white mb-2">Scan with Phone</h3>
            <p className="text-xs text-slate-400 mb-6 font-medium leading-relaxed">
              Scan this QR code with your mobile phone's camera to complete biometrics authentication.
            </p>
            
            <div className="bg-white p-4 rounded-2xl inline-block mb-6 shadow-inner">
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                  window.location.origin + "/mobile-auth?session=" + qrSessionId
                )}`}
                alt="Authentication QR Code" 
                className="w-48 h-48 mx-auto"
              />
            </div>
            
            <div className="flex items-center justify-center gap-2 text-indigo-400 text-xs font-bold animate-pulse">
              <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>
              Waiting for phone authentication...
            </div>
          </div>
        </div>
      )}

      {/* Freighter Wallet Setup Walkthrough */}
      {showWalkthrough && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-white/10 w-full max-w-md rounded-3xl p-8 shadow-2xl relative animate-[fadeIn_0.2s_ease-out]">
            <button 
              onClick={() => setShowWalkthrough(false)}
              className="absolute top-6 right-6 text-slate-400 hover:text-white text-xl cursor-pointer"
            >
              ✕
            </button>
            
            <div className="text-center mb-6">
              <span className="text-xs font-black text-indigo-400 tracking-wider uppercase">Guided Setup</span>
              <h3 className="text-xl font-black text-white mt-1">Get Freighter Wallet</h3>
            </div>

            <div className="space-y-6">
              {walkthroughStep === 1 && (
                <div className="space-y-4">
                  <div className="bg-white/5 border border-white/5 rounded-2xl p-5 text-center">
                    <span className="text-2xl">📥</span>
                    <h4 className="font-bold text-white mt-2">Step 1: Install Extension</h4>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed font-medium">
                      Freighter is a secure browser extension designed for interacting with Soroban smart contracts. Click below to install it.
                    </p>
                  </div>
                  <a
                    href="https://www.freighter.app/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-center transition-all shadow-lg shadow-indigo-600/30 text-sm"
                  >
                    Download Freighter
                  </a>
                </div>
              )}

              {walkthroughStep === 2 && (
                <div className="space-y-4">
                  <div className="bg-white/5 border border-white/5 rounded-2xl p-5 text-center">
                    <span className="text-2xl">🔑</span>
                    <h4 className="font-bold text-white mt-2">Step 2: Create Account</h4>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed font-medium">
                      Open the Freighter extension, choose "Create Wallet", and write down your 12-word seed phrase safely.
                    </p>
                  </div>
                </div>
              )}

              {walkthroughStep === 3 && (
                <div className="space-y-4">
                  <div className="bg-white/5 border border-white/5 rounded-2xl p-5 text-center">
                    <span className="text-2xl">🔌</span>
                    <h4 className="font-bold text-white mt-2">Step 3: Connect to Platform</h4>
                    <p className="text-xs text-slate-400 mt-2 leading-relaxed font-medium">
                      Now, click the button below to initialize the wallet connection and link it to our philanthropy platform.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowWalkthrough(false);
                      connectExtensionWallet();
                    }}
                    className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all shadow-lg text-sm cursor-pointer"
                  >
                    Connect Extension Now
                  </button>
                </div>
              )}

              <div className="flex justify-between items-center pt-4 border-t border-white/5">
                <button
                  onClick={() => walkthroughStep > 1 && setWalkthroughStep(walkthroughStep - 1)}
                  disabled={walkthroughStep === 1}
                  className="text-xs text-slate-400 hover:text-white disabled:opacity-30 cursor-pointer font-bold"
                >
                  ← Back
                </button>
                <div className="flex gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${walkthroughStep === 1 ? 'bg-indigo-500' : 'bg-slate-700'}`}></span>
                  <span className={`w-2 h-2 rounded-full ${walkthroughStep === 2 ? 'bg-indigo-500' : 'bg-slate-700'}`}></span>
                  <span className={`w-2 h-2 rounded-full ${walkthroughStep === 3 ? 'bg-indigo-500' : 'bg-slate-700'}`}></span>
                </div>
                {walkthroughStep < 3 ? (
                  <button
                    onClick={() => setWalkthroughStep(walkthroughStep + 1)}
                    className="text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer font-bold"
                  >
                    Next →
                  </button>
                ) : (
                  <button
                    onClick={() => setShowWalkthrough(false)}
                    className="text-xs text-slate-400 hover:text-white cursor-pointer font-bold"
                  >
                    Done
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Wallet Connected Confirmation Modal */}
      {showConnectedConfirm && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-slate-900 border border-white/10 w-full max-w-md rounded-3xl p-8 shadow-2xl relative text-center">
            <button 
              onClick={() => setShowConnectedConfirm(false)}
              className="absolute top-6 right-6 text-slate-400 hover:text-white text-xl cursor-pointer"
            >
              ✕
            </button>
            <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">
              🎉
            </div>
            <h3 className="text-xl font-black text-white mb-2">Smart Wallet Created!</h3>
            <p className="text-xs text-slate-400 mb-6 leading-relaxed font-medium">
              Your passkey-secured smart wallet is active on Stellar Testnet. You can now sponsor fee-free donations on the platform.
            </p>

            <div className="bg-slate-950 border border-white/5 rounded-2xl p-4 mb-6 flex flex-col items-center gap-2">
              <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">Smart Wallet Address</span>
              <div className="flex items-center gap-3 w-full justify-between">
                <span 
                  className="font-mono text-xs text-slate-300 select-all truncate flex-1 text-center" 
                  title={registeredAddress}
                >
                  {registeredAddress ? `${registeredAddress.slice(0, 8)}...${registeredAddress.slice(-8)}` : 'Loading...'}
                </span>
                <button 
                  onClick={handleCopyAddress}
                  className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl transition-all text-slate-400 hover:text-white cursor-pointer active:scale-95 flex items-center justify-center"
                  title="Copy Address"
                >
                  {copied ? (
                    <span className="text-[10px] font-bold text-green-400 px-1 animate-pulse">Copied!</span>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              onClick={() => setShowConnectedConfirm(false)}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-600/30 cursor-pointer active:scale-98 text-sm font-black uppercase tracking-widest"
            >
              Continue to Platform
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <AppContent />
  );
}


export default App;
