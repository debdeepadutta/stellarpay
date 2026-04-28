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
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  updateDoc, 
  doc, 
  serverTimestamp,
  orderBy
} from 'firebase/firestore';


// Constants
const toI128 = (n) => nativeToScVal(BigInt(Math.floor(parseFloat(n))), { type: "i128" });
const fromI128 = (v) => {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'number') return v;
  try { return Number(BigInt(v)); } catch(e) { return 0; }
};

const CONTRACT_ID = "CCYNUO7LFWI3IT2IZMFEFU4CQUYGI7JPOODXEHJ7UQEP5JKSBPY2SLCG";
const VAULT_CONTRACT_ID = "CCQL3IUGJXIWY34SKKRO4ZZO44R6VVY3WWO33VSF2K5LDSQUGV6VC2FD";
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
  if (str.includes("insufficient balance")) return "Insufficient balance!";
  if (str.includes("user rejected")) return "Transaction was cancelled.";
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

  // On-Chain Data
  const [totalDonations, setTotalDonations] = useState(0); 
  const [vaultStats, setVaultStats] = useState({ total_deposited: '0', total_withdrawn: '0', current_balance: '0', deposit_count: 0 });
  
  const [isFetchingData, setIsFetchingData] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [txStatus, setTxStatus] = useState(null);
  const [txHash, setTxHash] = useState('');
  const [lastDonationAt, setLastDonationAt] = useState(null);
  const [lastUpdated, setLastUpdated] = useState({ wallet: Date.now(), vault: Date.now(), marketplace: Date.now() });

  // Admin Form State - Default to empty for a fresh start
  const [newCampaign, setNewCampaign] = useState({ 
    name: '', 
    description: '', 
    goal: '', 
    cap: '', 
    contractId: '', 
    vaultContractId: '' 
  });

  // Real-time listener for All Active Campaigns
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
      setLastUpdated(prev => ({ ...prev, marketplace: Date.now() }));
    }, (error) => {
      console.error("Firestore Error (Marketplace):", error);
    });
    return () => unsubscribe();
  }, []);

  // Real-time listener for Admin's Campaigns
  useEffect(() => {
    if (address) {
      const q = query(
        collection(db, "campaigns"), 
        where("adminWallet", "==", address)
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Sort locally
        data.sort((a, b) => {
          const timeA = a.createdAt?.toMillis() || 0;
          const timeB = b.createdAt?.toMillis() || 0;
          return timeB - timeA; // desc
        });
        setCampaigns(data);
      }, (error) => {
         console.error("Firestore Error (Admin):", error);
      });
      return () => unsubscribe();
    }
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

      const simulate = async (cid, fn, args = []) => {
        if (!cid || cid.length < 56) return null;
        const builder = new TransactionBuilder(DUMMY_ACCOUNT, { fee: "100", networkPassphrase: Networks.TESTNET });
        const tx = builder.addOperation(Operation.invokeContractFunction({ contract: cid, function: fn, args })).setTimeout(30).build();
        const res = await rpcServer.simulateTransaction(tx);
        return rpc.Api.isSimulationSuccess(res) ? scValToNative(res.result.retval) : null;
      };

      // We still fetch the vault balance for the UI, but we don't let it override the global sum if it's stale
      const stats = await simulate(VAULT_CONTRACT_ID, "get_stats", []);
      if (stats !== null) setVaultStats({
        total_deposited: fromI128(stats.total_deposited).toLocaleString(),
        total_withdrawn: fromI128(stats.total_withdrawn).toLocaleString(),
        current_balance: fromI128(stats.current_balance).toLocaleString(),
        deposit_count: Number(stats.deposit_count)
      });
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




  const handleDonate = async (targetContractId, amount) => {
    if (!address) {
      await connectWallet();
      return;
    }
    console.log("--- STARTING DONATION PROCESS ---");
    console.log("Contract:", targetContractId);
    console.log("Amount:", amount);
    
    setIsSending(true);
    setTxStatus('sending');
    try {
      console.log("Step 1: Building Transaction...");
      const builder = new TransactionBuilder(new Account(address, "0"), { fee: "1000", networkPassphrase: Networks.TESTNET });
      const tx = builder.addOperation(Operation.invokeContractFunction({
        contract: targetContractId,
        function: "donate",
        args: [Address.fromString(address).toScVal(), toI128(amount)]
      })).setTimeout(60).build();

      console.log("Step 2: Simulating on Soroban...");
      const sim = await rpcServer.simulateTransaction(tx);
      if (rpc.Api.isSimulationError(sim)) {
        console.error("Simulation failed details:", sim.error);
        throw new Error("Simulation failed: The contract rejected this donation (check if you reached the cap).");
      }
      
      console.log("Step 3: Signing with Wallet...");
      const prepared = rpc.assembleTransaction(tx, sim).build();
      const { signedTxXdr } = await kit.signTransaction(prepared.toXDR());
      
      console.log("Step 4: Submitting to Network...");
      const send = await rpcServer.sendTransaction(new Transaction(signedTxXdr, Networks.TESTNET));
      console.log("Transaction Hash:", send.hash);
      
      console.log("Step 5: Waiting for confirmation (polling)...");
      let res = await rpcServer.getTransaction(send.hash);
      let attempts = 0;
      while ((res.status === "NOT_FOUND" || res.status === "PENDING") && attempts < 20) {
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
    setIsSending(true);
    try {
      await addDoc(collection(db, "campaigns"), {
        ...newCampaign,
        adminWallet: address,
        goal: parseFloat(newCampaign.goal),
        cap: parseFloat(newCampaign.cap),
        isActive: true,
        createdAt: serverTimestamp(),
        donationContractId: newCampaign.contractId,
        vaultContractId: newCampaign.vaultContractId
      });
      toast.success("Campaign launched!");
      setNewCampaign({ name: '', description: '', goal: '', cap: '', contractId: CONTRACT_ID, vaultContractId: VAULT_CONTRACT_ID });
      navigate('/admin');
    } catch (e) {
      console.error("Firebase Create Error:", e);
      toast.error("Failed to save campaign: " + e.message);
    } finally {
      setIsSending(false);
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
        onDisconnect={() => setAddress('')} 
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
              isSending={isSending}
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
            />
          } />
          <Route path="/donor" element={<DonorMarketplace campaigns={allCampaigns} />} />
          <Route path="/campaign/:id" element={
            <CampaignDetails 
              address={address}
              balance={balance}
              isFetchingData={isFetchingData}
              handleDonate={handleDonate}
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
