import React, { useState, useEffect } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
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
  Operation 
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

// Components
import Navbar from './components/Navbar';

// Pages
import Landing from './pages/Landing';
import AdminPortal from './pages/AdminPortal';
import DonorMarketplace from './pages/DonorMarketplace';
import CampaignDetails from './pages/CampaignDetails';

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
  deleteDoc,
  serverTimestamp,
  orderBy
} from 'firebase/firestore';


// Constants
const toI128 = (n) => nativeToScVal(BigInt(Math.floor(parseFloat(n) * 10000000)), { type: "i128" });
const fromI128 = (v) => {
  if (v === null || v === undefined) return 0;
  let val;
  if (typeof v === 'bigint') val = v;
  else if (typeof v === 'number') val = BigInt(v);
  else {
    try { val = BigInt(v); } catch(e) { return 0; }
  }
  return Number(val) / 10000000;
};

const CONTRACT_ID = "CBGFHRSQ275OQRZGOZXLO7JABDVTI5UIZLD7ETSAGJVI5WMIWGBC2TK4";
const VAULT_CONTRACT_ID = "CB7O4AJFIBTGQODDCOPQICCSHRA35WFTIA2ZZ5O6OUMKWV4ROZIE3BZD";
const DUMMY_ACCOUNT = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");
const server = new Horizon.Server("https://horizon-testnet.stellar.org");
const rpcServer = new rpc.Server("https://soroban-testnet.stellar.org");

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
  const [address, setAddress] = useState('');
  const [walletName, setWalletName] = useState('');
  const [balance, setBalance] = useState('0.00');

  // Campaign Data State
  const [campaigns, setCampaigns] = useState([]);
  const [allCampaigns, setAllCampaigns] = useState([]);
  const [firestoreError, setFirestoreError] = useState(null);

  // On-Chain Data
  const [totalDonations, setTotalDonations] = useState(0); 
  const [vaultStats, setVaultStats] = useState({ total_deposited: '0', total_withdrawn: '0', current_balance: '0', deposit_count: 0 });
  
  const [isFetchingData, setIsFetchingData] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false);
  const [txStatus, setTxStatus] = useState(null);
  const [txHash, setTxHash] = useState('');
  const [lastDonationAt, setLastDonationAt] = useState(null);
  const [lastUpdated, setLastUpdated] = useState({ wallet: Date.now(), vault: Date.now(), marketplace: Date.now() });

  const [newCampaign, setNewCampaign] = useState({ 
    name: '', 
    description: '', 
    goal: '', 
    contractId: CONTRACT_ID, 
    vaultContractId: VAULT_CONTRACT_ID 
  });

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
      setCampaigns([]); // Clear stale campaigns when wallet disconnects
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


  const fetchData = async () => {
    if (!address) return;
    setIsFetchingData(true);
    try {
      const account = await server.loadAccount(address);
      const native = account.balances.find(b => b.asset_type === 'native');
      setBalance(native ? parseFloat(native.balance).toFixed(2) : '0.00');

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
  };

  useEffect(() => {
    if (address) {
      fetchData();
      const timer = setInterval(fetchData, 15000);
      return () => clearInterval(timer);
    }
  }, [address]);

  const connectWallet = async () => {
    console.log("Connect Wallet triggered");
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
      console.log("Step 1: Building Transaction...");
      let account;
      try {
        account = await server.loadAccount(address);
      } catch (err) {
        if (err?.response?.status === 404) {
          throw new Error("Your account does not exist on Testnet. Please fund it using Friendbot first.");
        }
        console.warn("Could not load account from Horizon, using fallback:", err);
        account = new Account(address, "0");
      }

      const builder = new TransactionBuilder(account, { fee: "10000", networkPassphrase: Networks.TESTNET });
      
      // Build campaign_id Symbol for on-chain identification
      // Use the Firestore document ID (truncated to 32 chars max for Soroban Symbol)
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
      const { signedTxXdr } = await kit.signTransaction(prepared.toXDR(), { networkPassphrase: Networks.TESTNET });
      
      console.log("Step 4: Submitting to Network...");
      const send = await rpcServer.sendTransaction(new Transaction(signedTxXdr, Networks.TESTNET));
      console.log("Transaction Hash:", send.hash, "Status:", send.status);
      
      if (send.status === "ERROR") {
        console.error("sendTransaction error details:", send.errorResultXdr || send.errorResult);
        const errVal = send.errorResultXdr || send.errorResult || "Unknown transaction rejection";
        throw new Error(`Transaction rejected by network: ${errVal}`);
      }
      
      console.log("Step 5: Waiting for confirmation (polling)...");
      let res = await rpcServer.getTransaction(send.hash);
      let attempts = 0;
      while ((res.status === "NOT_FOUND" || res.status === "PENDING") && attempts < 25) {
        await new Promise(r => setTimeout(r, 2000));
        res = await rpcServer.getTransaction(send.hash);
        attempts++;
        console.log(`Poll attempt ${attempts}: ${res.status}`);
        if (attempts === 5) {
          console.log(`STILL WAITING? Check here: https://stellar.expert/explorer/testnet/tx/${send.hash}`);
        }
      }

      if (res.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        console.log("Step 6: SUCCESS!");
        setTxStatus('success');
        setTxHash(send.hash);
        setLastDonationAt(Date.now());
        toast.success("Donation successful!");

        // Update database totalDonated in Firestore in background without blocking
        if (campaignId) {
          const campaignRef = doc(db, "campaigns", campaignId);
          getDoc(campaignRef).then((campaignSnap) => {
            if (campaignSnap.exists()) {
              const currentDonated = parseFloat(campaignSnap.data().totalDonated || 0);
              updateDoc(campaignRef, {
                totalDonated: currentDonated + parseFloat(amount)
              }).catch(err => console.error("updateDoc error:", err));
            }
          }).catch(dbErr => {
            console.error("Failed to update database totalDonated:", dbErr);
          });
        }

        fetchData();
        
        // Auto-reset status after 5 seconds so button returns to normal
        setTimeout(() => setTxStatus(null), 5000);
      } else {
        console.error("Final status:", res.status);
        throw new Error(attempts >= 20 ? "Transaction taking too long. Check explorer." : "Transaction failed");
      }
    } catch (e) {
      console.error("!!! DONATION FAILED !!!", e);
      toast.error(parseStellarError(e));
      setTxStatus('failure');
      // Reset status after 3 seconds so button is clickable again
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

      let account;
      try {
        account = await server.loadAccount(address);
      } catch (err) {
        if (err?.response?.status === 404) {
          throw new Error("Your account does not exist on Testnet. Please fund it using Friendbot first.");
        }
        account = new Account(address, "0");
      }

      // Step 1: Build, simulate and sign the transaction (Popup wallet)
      const builder = new TransactionBuilder(account, { fee: "10000", networkPassphrase: Networks.TESTNET });
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
      const { signedTxXdr } = await kit.signTransaction(prepared.toXDR(), { networkPassphrase: Networks.TESTNET });
      const send = await rpcServer.sendTransaction(new Transaction(signedTxXdr, Networks.TESTNET));

      if (send.status === "ERROR") {
        throw new Error(`Transaction rejected: ${send.errorResultXdr || "Unknown"}`);
      }

      // Step 2: Save to Firestore instantly with isOnChain: false
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
        txHash: send.hash
      });

      // Step 3: Redirect user instantly
      toast.success("Campaign created! Confirming on blockchain in background...", { duration: 5000 });
      setNewCampaign({ name: '', description: '', goal: '', contractId: CONTRACT_ID, vaultContractId: VAULT_CONTRACT_ID });
      navigate('/admin');

      // Step 4: Background polling to set isOnChain: true
      (async () => {
        try {
          let res = await rpcServer.getTransaction(send.hash);
          let attempts = 0;
          while ((res.status === "NOT_FOUND" || res.status === "PENDING") && attempts < 30) {
            await new Promise(r => setTimeout(r, 2000));
            res = await rpcServer.getTransaction(send.hash);
            attempts++;
          }
          if (res.status === rpc.Api.GetTransactionStatus.SUCCESS) {
            await updateDoc(docRef, { isOnChain: true });
            toast.success("✅ Campaign successfully registered on Stellar!", { duration: 6000 });
          } else {
             console.warn("Tx failed or timed out:", res.status);
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

      let account;
      try {
        account = await server.loadAccount(address);
      } catch (err) {
        if (err?.response?.status === 404) {
          throw new Error("Your account does not exist on Testnet. Please fund it using Friendbot first.");
        }
        account = new Account(address, "0");
      }

      const builder = new TransactionBuilder(account, { fee: "10000", networkPassphrase: Networks.TESTNET });
      const tx = builder.addOperation(Operation.invokeContractFunction({
        contract: targetContractId,
        function: "create_campaign",
        args: [campaignSymbol, Address.fromString(address).toScVal(), goalInStroops]
      })).setTimeout(60).build();

      const sim = await rpcServer.simulateTransaction(tx);
      if (rpc.Api.isSimulationError(sim)) {
        console.error("create_campaign simulation failed:", sim.error);
        throw new Error("Failed to register campaign on-chain: " + (sim.error || "Unknown error"));
      }

      const prepared = rpc.assembleTransaction(tx, sim).build();
      const { signedTxXdr } = await kit.signTransaction(prepared.toXDR(), { networkPassphrase: Networks.TESTNET });
      const send = await rpcServer.sendTransaction(new Transaction(signedTxXdr, Networks.TESTNET));
      
      if (send.status === "ERROR") {
        throw new Error(`On-chain campaign creation rejected: ${send.errorResultXdr || send.errorResult || "Unknown"}`);
      }

      let res = await rpcServer.getTransaction(send.hash);
      let attempts = 0;
      while ((res.status === "NOT_FOUND" || res.status === "PENDING") && attempts < 25) {
        await new Promise(r => setTimeout(r, 2000));
        res = await rpcServer.getTransaction(send.hash);
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
    } catch (e) {
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
            />
          } />
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
    </div>
  );
}

function App() {
  return (
    <AppContent />
  );
}


export default App;
