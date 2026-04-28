import React, { useState, useEffect } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { 
  Networks, 
  Transaction, 
  Account, 
  rpc, 
  xdr, 
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
import WalletCard from './components/WalletCard';
import DonateXLMForm from './components/SendXLMForm';
import TransactionStatus from './components/TransactionStatus';
import DonorLeaderboard from './components/DonorLeaderboard';
import VaultStats from './components/VaultStats';
import RecentLogs from './components/RecentLogs';
import LiveDonationFeed from './components/LiveDonationFeed';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import AdminPanel from './components/AdminPanel';

// Constants
const CONTRACT_ID = "CCYNUO7LFWI3IT2IZMFEFU4CQUYGI7JPOODXEHJ7UQEP5JKSBPY2SLCG";
const VAULT_CONTRACT_ID = "CCQL3IUGJXIWY34SKKRO4ZZO44R6VVY3WWO33VSF2K5LDSQUGV6VC2FD";
const CAMPAIGN_GOAL = 10000;
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

const toI128 = (value) => {
  const b = BigInt(value);
  return xdr.ScVal.scvI128(
    new xdr.Int128Parts({
      lo: xdr.Uint64.fromString((b & 0xFFFFFFFFFFFFFFFFn).toString()),
      hi: xdr.Int64.fromString((b >> 64n).toString()),
    })
  );
};

const parseStellarError = (err) => {
  const msg = err.message || "Unknown error";
  const str = msg.toLowerCase();
  if (str.includes("insufficient balance")) return "Insufficient balance!";
  if (str.includes("user rejected")) return "Transaction was cancelled.";
  return msg;
};

function App() {
  const [address, setAddress] = useState('');
  const [walletName, setWalletName] = useState('');
  const [balance, setBalance] = useState('0.00');
  const [totalDonations, setTotalDonations] = useState(0); 
  const [vaultStats, setVaultStats] = useState({ total_deposited: '0', total_withdrawn: '0', current_balance: '0', deposit_count: 0 });
  const [recentLogs, setRecentLogs] = useState([]);
  
  const [activeTab, setActiveTab] = useState('home');
  const [isFetchingData, setIsFetchingData] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [txStatus, setTxStatus] = useState(null);
  const [txHash, setTxHash] = useState('');
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setIsFetchingData(true);
    try {
      if (address) {
        const account = await server.loadAccount(address);
        const native = account.balances.find(b => b.asset_type === 'native');
        setBalance(native ? parseFloat(native.balance).toFixed(2) : '0.00');
      }

      const simulate = async (cid, fn, args = []) => {
        const builder = new TransactionBuilder(DUMMY_ACCOUNT, { 
          fee: "100", 
          networkPassphrase: Networks.TESTNET 
        });
        const tx = builder
          .addOperation(Operation.invokeContractFunction({ contract: cid, function: fn, args }))
          .setTimeout(30)
          .build();
        const res = await rpcServer.simulateTransaction(tx);
        return rpc.Api.isSimulationSuccess(res) ? scValToNative(res.result.retval) : null;
      };

      const [total, stats, logs] = await Promise.all([
        simulate(CONTRACT_ID, "get_total"),
        simulate(CONTRACT_ID, "get_vault_stats"),
        simulate(CONTRACT_ID, "get_recent_logs", [nativeToScVal(5, { type: "u32" })])
      ]);

      if (total !== null) setTotalDonations(Number(total));
      if (stats !== null) setVaultStats({
        total_deposited: stats.total_deposited.toString(),
        total_withdrawn: stats.total_withdrawn.toString(),
        current_balance: stats.current_balance.toString(),
        deposit_count: stats.deposit_count
      });
      if (logs !== null) setRecentLogs(logs.map(l => ({ donor: l.donor, amount: l.amount.toString(), timestamp: l.timestamp.toString() })));

      setError(null);
    } catch (e) {
      console.error("Fetch failed", e);
      setError("Network Sync Issue");
    } finally {
      setIsFetchingData(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [address]);

  const handleConnect = async () => {
    await kit.openModal({
      onWalletSelected: async (option) => {
        kit.setWallet(option.id);
        const { address } = await kit.getAddress();
        setAddress(address);
        setWalletName(option.name);
        toast.success(`Connected to ${option.name}`);
      }
    });
  };

  const handleDonate = async (recipient, amount) => {
    setIsSending(true);
    setTxStatus('pending');
    try {
      const account = await server.loadAccount(address);
      const tx = new TransactionBuilder(account, { fee: "1000", networkPassphrase: Networks.TESTNET })
        .addOperation(Operation.invokeContractFunction({
          contract: CONTRACT_ID,
          function: "donate",
          args: [
            Address.fromString(address).toScVal(),
            toI128(Math.floor(parseFloat(amount)))
          ]
        }))
        .setTimeout(60)
        .build();

      const sim = await rpcServer.simulateTransaction(tx);
      if (rpc.Api.isSimulationError(sim)) throw new Error("Simulation failed");
      
      const prepared = rpc.assembleTransaction(tx, sim).build();
      const { signedTxXdr } = await kit.signTransaction(prepared.toXDR(), { networkPassphrase: Networks.TESTNET });
      
      const send = await rpcServer.sendTransaction(new Transaction(signedTxXdr, Networks.TESTNET));
      let res = await rpcServer.getTransaction(send.hash);
      while (res.status === "NOT_FOUND" || res.status === "PENDING") {
        await new Promise(r => setTimeout(r, 2000));
        res = await rpcServer.getTransaction(send.hash);
      }

      if (res.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        setTxStatus('success');
        setTxHash(send.hash);
        toast.success("Donation successful!");
        fetchData();
      } else throw new Error("Transaction failed");

    } catch (e) {
      toast.error(parseStellarError(e));
      setTxStatus('failure');
    } finally {
      setIsSending(false);
    }
  };

  const campaignProgress = Math.min((totalDonations / CAMPAIGN_GOAL) * 100, 100);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-indigo-500/30 overflow-x-hidden font-sans">
      <Toaster position="bottom-right" />
      
      {/* Connection Status Banner */}
      <div className={`w-full py-1.5 px-4 text-[10px] uppercase font-black tracking-[0.2em] text-center transition-colors duration-500 ${error ? 'bg-red-600 text-white' : isFetchingData ? 'bg-amber-500 text-slate-900' : 'bg-emerald-500 text-slate-900'}`}>
        {error ? 'Connection lost — retrying' : isFetchingData ? 'Syncing with Stellar Network...' : 'Connected to Stellar Testnet — Live'}
      </div>

      <Navbar isConnected={!!address} address={address} walletName={walletName} onConnect={handleConnect} onDisconnect={() => setAddress('')} />

      <main className="max-w-6xl mx-auto px-4 pt-16 pb-24">
        
        {/* Header & Campaign Progress */}
        <div className="mb-12 space-y-6">
          <div className="space-y-2 text-center md:text-left">
            <h1 className="text-4xl md:text-6xl font-black text-white tracking-tighter">
              STELLAR <span className="text-indigo-500">PHILANTHROPY</span>
            </h1>
            <p className="text-slate-400 text-lg font-medium">Decentralized Vault Ecosystem on Soroban</p>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
            <div className="flex justify-between items-end">
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Campaign Goal</span>
                <div className="text-2xl font-black text-white">{totalDonations.toLocaleString()} <span className="text-slate-600 text-sm font-normal">/ {CAMPAIGN_GOAL.toLocaleString()} XLM</span></div>
              </div>
              <div className="text-right">
                <span className="text-3xl font-black text-indigo-400">{campaignProgress.toFixed(1)}%</span>
              </div>
            </div>
            <div className="w-full h-4 bg-slate-800 rounded-full overflow-hidden p-1 border border-slate-700">
              <div 
                className="h-full bg-gradient-to-r from-indigo-600 to-purple-500 rounded-full transition-all duration-1000 ease-out shadow-[0_0_20px_rgba(79,70,229,0.4)]"
                style={{ width: `${campaignProgress}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-12 bg-slate-900/30 p-1.5 rounded-2xl border border-slate-800 w-fit mx-auto md:mx-0">
          {[
            { id: 'home', label: 'Home', icon: '🏠' },
            { id: 'leaderboard', label: 'Leaderboard', icon: '🏆' },
            { id: 'live', label: 'Live Feed', icon: '📡' },
            { id: 'analytics', label: 'Analytics', icon: '📊' },
            { id: 'admin', label: 'Admin', icon: '⚙️' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
            >
              <span>{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="transition-all duration-500 animate-in fade-in slide-in-from-bottom-4">
          {activeTab === 'home' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-7 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <WalletCard address={address} balance={balance} isFetching={isFetchingData} />
                  <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
                    <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">Global Reserve</span>
                    <h3 className="text-4xl font-black text-white mt-4">{totalDonations.toLocaleString()} <span className="text-sm font-normal text-slate-500 uppercase tracking-tighter">XLM</span></h3>
                    <p className="text-xs text-indigo-400 font-bold mt-1 uppercase tracking-widest">Live Pool Balance</p>
                  </div>
                </div>
                <RecentLogs logs={recentLogs} isFetching={isFetchingData} />
              </div>
              <div className="lg:col-span-5 space-y-8">
                {address ? (
                  <DonateXLMForm onSend={handleDonate} isSending={isSending} balance={balance} />
                ) : (
                  <div className="p-12 rounded-3xl bg-slate-900 border-2 border-dashed border-slate-800 text-center space-y-6">
                    <p className="text-slate-500">Connect your wallet to begin contributing to the ecosystem.</p>
                    <button onClick={handleConnect} className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-500 transition-all shadow-xl shadow-indigo-600/20">
                      Connect Wallet
                    </button>
                  </div>
                )}
                <VaultStats stats={vaultStats} isFetching={isFetchingData} />
              </div>
            </div>
          )}

          {activeTab === 'leaderboard' && (
            <DonorLeaderboard contractId={CONTRACT_ID} connectedWallet={address} networkPassphrase={Networks.TESTNET} />
          )}

          {activeTab === 'live' && (
            <div className="max-w-3xl mx-auto space-y-6 text-center">
              <div className="space-y-2">
                <h2 className="text-3xl font-black text-white">Live Network Stream</h2>
                <p className="text-slate-500">Monitoring real-time Soroban operations on the Stellar Testnet.</p>
              </div>
              <LiveDonationFeed contractId={CONTRACT_ID} />
            </div>
          )}

          {activeTab === 'analytics' && (
            <AnalyticsDashboard contractId={CONTRACT_ID} rpcUrl="https://soroban-testnet.stellar.org" />
          )}

          {activeTab === 'admin' && (
            <AdminPanel 
              contractId={CONTRACT_ID}
              vaultContractId={VAULT_CONTRACT_ID}
              connectedWallet={address}
              networkPassphrase={Networks.TESTNET}
              kit={kit}
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
