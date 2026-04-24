import React, { useState, useEffect } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { 
  Networks, 
  StrKey,
  Transaction,
  Account,
  rpc,
  xdr,
  nativeToScVal,
  scValToNative,
  Horizon,
  Asset,
  Address
} from "@stellar/stellar-sdk";
import { TransactionBuilder, Operation } from "@stellar/stellar-sdk";
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

import Navbar from './components/Navbar';
import WalletCard from './components/WalletCard';
import DonateXLMForm from './components/SendXLMForm';
import TransactionStatus from './components/TransactionStatus';

const server = new Horizon.Server("https://horizon-testnet.stellar.org");
const rpcServer = new rpc.Server("https://soroban-testnet.stellar.org");
const CONTRACT_ID = "CA2UK75IFINHQYCMBYT7TXRMMHEP4FHYCFZOEHKGZOFTJBMI2AUT27LY"; // Deployed contract ID with Logger support

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

// Helper to force i128 ScVal for Soroban
const toI128 = (value) => {
  const b = BigInt(value);
  return xdr.ScVal.scvI128(
    new xdr.Int128Parts({
      lo: xdr.Uint64.fromString((b & 0xFFFFFFFFFFFFFFFFn).toString()),
      hi: xdr.Int64.fromString((b >> 64n).toString()),
    })
  );
};

// Dummy account for read-only simulations (doesn't need to be funded)
const DUMMY_ACCOUNT = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");

// Production Error Parser
const parseStellarError = (err) => {
  const msg = err.message || "Unknown error";
  const str = msg.toLowerCase();
  
  if (str.includes("insufficient balance") || str.includes("op_underfunded")) {
    return "Insufficient balance! Please fund your wallet with more XLM.";
  }
  if (str.includes("tx_bad_auth") || str.includes("authentication failed")) {
    return "Authentication failed. Please check if your wallet is on Testnet.";
  }
  if (str.includes("simulatecontract") || str.includes("simulation failed")) {
    return "Smart contract simulation failed. The pool might be temporarily locked or inputs are invalid.";
  }
  if (str.includes("user rejected") || str.includes("rejected by the user")) {
    return "Transaction was cancelled in your wallet.";
  }
  if (str.includes("timeout") || str.includes("deadline")) {
    return "Network timeout. Your transaction might still be pending; check your balance in a moment.";
  }
  return msg;
};

function App() {
  // UI and Wallet States
  const [address, setAddress] = useState('');
  const [walletName, setWalletName] = useState('');
  const [balance, setBalance] = useState('0.00');
  const [totalDonations, setTotalDonations] = useState(localStorage.getItem('stellar_total_donations') || '0.00'); 
  const [isFetchingBalance, setIsFetchingBalance] = useState(false);
  const [isFetchingTotal, setIsFetchingTotal] = useState(false);
  const [error, setError] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [txStatus, setTxStatus] = useState(null);
  const [txHash, setTxHash] = useState('');
  const [txCount, setTxCount] = useState(0);
  const [isStale, setIsStale] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date().toLocaleTimeString());
  
  const connected = !!address;

  // Unified Fetch Logic (Balance + Contract State)
  const fetchData = async (pubKey) => {
    const activeAddress = pubKey || address;
    if (!activeAddress) return;

    setIsFetchingBalance(true);
    try {
      // 1. Fetch XLM Balance
      const account = await server.loadAccount(activeAddress);
      const native = account.balances.find(b => b.asset_type === 'native');
      setBalance(native ? parseFloat(native.balance).toFixed(4) : '0.00');

      // 2. Fetch Total Donations from Soroban
      await fetchTotalDonations();
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      if (e.response?.status === 404) {
        setBalance('0.00');
        setError('Account not funded. Please use Friendbot to add test XLM.');
      }
    } finally {
      setIsFetchingBalance(false);
    }
  };

  const fetchTotalDonations = async () => {
    setIsFetchingTotal(true);
    try {
      const simTx = new TransactionBuilder(DUMMY_ACCOUNT, {
        fee: "100",
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(Operation.invokeContractFunction({
          contract: CONTRACT_ID,
          function: "get_total",
          args: []
        }))
        .setTimeout(30)
        .build();

      const result = await rpcServer.simulateTransaction(simTx);
      if (rpc.Api.isSimulationSuccess(result)) {
        const total = scValToNative(result.result.retval).toString();
        setTotalDonations(total);
        setIsStale(false);
        localStorage.setItem('stellar_total_donations', total);
      } else {
        throw new Error("Simulation failed");
      }
    } catch (sorobanErr) {
      console.warn("Soroban sync failed, using cached data");
      setIsStale(true);
    } finally {
      setIsFetchingTotal(false);
    }
  };

  useEffect(() => {
    fetchTotalDonations();
  }, []);

  useEffect(() => {
    if (address) {
      fetchData(address);

      // Real-time background sync every 5 seconds
      const pollInterval = setInterval(() => {
        fetchData(address);
      }, 5000);

      return () => clearInterval(pollInterval);
    }
  }, [address, txCount]);

  // Handlers
  const handleConnect = async () => {
    setError(null);
    setIsConnecting(true);
    
    try {
      await kit.openModal({
        onClosed: () => setIsConnecting(false),
        onWalletSelected: async (option) => {
          try {
            kit.setWallet(option.id);
            const { address } = await kit.getAddress();
            setAddress(address);
            setWalletName(option.name);
            toast.success(`${option.name} connected!`);
          } catch (e) {
            console.error("Connection failed:", e);
            let msg = 'Failed to connect.';
            const errStr = e.message?.toLowerCase() || '';
            if (errStr.includes('not installed') || errStr.includes('not found') || errStr.includes('install')) {
              msg = `${option.name} wallet is not installed or not found.`;
            } else if (errStr.includes('reject') || errStr.includes('cancel')) {
              msg = 'Connection request was rejected by the user.';
            } else {
              msg = e.message || msg;
            }
            toast.error(msg);
            setError(msg);
          } finally {
            setIsConnecting(false);
          }
        }
      });
    } catch (e) {
      setIsConnecting(false);
      toast.error("Failed to open wallet selector.");
    }
  };

  const handleDisconnect = async () => {
    await kit.disconnect();
    setAddress('');
    setWalletName('');
    setBalance('0.00');
    setError(null);
    setTxStatus(null);
    toast.success('Wallet disconnected');
  };

  const handleDonate = async (recipient, amount) => {
    setIsSending(true);
    setError(null);
    setTxStatus('pending');
    setTxHash('');

    const txToast = toast.loading('Initiating donation...');

    try {
      // 1. Insufficient Balance Check
      // We also account for a small buffer for the transaction fee
      if (parseFloat(amount) + 0.01 > parseFloat(balance)) {
        throw new Error("Insufficient balance! You need more XLM to cover the donation and network fees.");
      }

      // 2. Build Invocation
      toast.loading('Simulating Contract Call...', { id: txToast });
      const account = await server.loadAccount(address);
      
      const tx = new TransactionBuilder(account, {
        fee: "1000",
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(Operation.invokeContractFunction({
          contract: CONTRACT_ID,
          function: "donate",
          args: [
            Address.fromString(address).toScVal(),
            Address.fromString("CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC").toScVal(),
            toI128(Math.floor(parseFloat(amount)))
          ]
        }))
        .setTimeout(60)
        .build();

      // 3. Simulation
      let simulated;
      try {
        simulated = await rpcServer.simulateTransaction(tx);
      } catch (e) {
        throw new Error("Network error during simulation. Please try again.");
      }

      if (rpc.Api.isSimulationError(simulated)) {
        console.error("Simulation Error Details:", simulated.error);
        throw new Error(`Contract simulation failed: ${simulated.error || "The pool might be temporarily locked."}`);
      }

      const preparedTx = rpc.assembleTransaction(tx, simulated).build();

      // 4. Sign (Handle Rejection)
      toast.loading(`Awaiting ${walletName} signature...`, { id: txToast });
      let signedXdr;
      try {
        const result = await kit.signTransaction(preparedTx.toXDR(), {
          networkPassphrase: Networks.TESTNET,
        });
        signedXdr = result.signedTxXdr;
      } catch (e) {
        if (e.message?.toLowerCase().includes('reject') || e.message?.toLowerCase().includes('cancel')) {
          throw new Error("Transaction was rejected by the user.");
        }
        throw e;
      }

      if (!signedXdr) throw new Error("Wallet failed to return signed transaction.");

      // 5. Submit and Poll
      toast.loading('Confirming on Ledger...', { id: txToast });
      const sendResponse = await rpcServer.sendTransaction(new Transaction(signedXdr, Networks.TESTNET));
      
      if (sendResponse.status !== "PENDING") {
        throw new Error(`RPC Error: ${sendResponse.status}`);
      }

      let getResult = await rpcServer.getTransaction(sendResponse.hash);
      while (getResult.status === "NOT_FOUND" || getResult.status === "PENDING") {
        await new Promise(r => setTimeout(r, 2000));
        getResult = await rpcServer.getTransaction(sendResponse.hash);
      }

      if (getResult.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        setTxStatus('success');
        setTxHash(sendResponse.hash);
        setTxCount(prev => prev + 1);
        toast.success('Donation successful and logged!', { id: txToast });
      } else {
        throw new Error("Transaction execution failed on-chain.");
      }
      
      setTimeout(() => fetchData(address), 2000);
    } catch (e) {
      console.error("Donation Error:", e);
      const msg = parseStellarError(e);
      toast.error(msg, { id: txToast, duration: 6000 });
      setError(msg);
      setTxStatus('failure');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-stellar-blue/30 overflow-x-hidden">
      <Toaster 
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#1e293b',
            color: '#f8fafc',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '16px',
            padding: '12px 20px',
          },
        }}
      />
      
      <Navbar 
        isConnected={connected} 
        address={address} 
        walletName={walletName}
        onConnect={handleConnect} 
        onDisconnect={handleDisconnect} 
      />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-24 sm:pt-32 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
          
          {/* Left Column */}
          <div className="lg:col-span-7 space-y-8 animate-in fade-in slide-in-from-left duration-700">
            <div className="space-y-2">
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight">
                Stellar <span className="text-stellar-blue">Philanthropy</span>
              </h1>
              <p className="text-slate-400 text-base sm:text-lg md:text-xl">Support the ecosystem through Soroban smart contracts.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <WalletCard 
                address={address} 
                balance={balance} 
                isFetching={isFetchingBalance} 
                lastUpdated={lastUpdated}
              />
              
              <div className="p-6 rounded-3xl glass border border-white/10 card-gradient flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-sm font-medium">Total Donations</span>
                  <div className="p-2 bg-stellar-blue/10 rounded-xl text-stellar-blue">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                    </svg>
                  </div>
                </div>
                <div>
                  {isFetchingTotal ? (
                    <div className="flex items-center gap-2 mt-4 animate-pulse">
                      <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center">
                        <svg className="w-4 h-4 animate-spin text-stellar-blue" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                        </svg>
                      </div>
                      <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">Syncing</span>
                    </div>
                  ) : (
                    <div className="space-y-1 mt-4">
                      <h3 className="text-3xl font-bold text-white">{totalDonations} <span className="text-sm font-normal text-slate-500">XLM</span></h3>
                      {isStale && <p className="text-[10px] text-rose-500/80 font-bold uppercase tracking-tighter">⚠️ Sync Offline (Cached)</p>}
                    </div>
                  )}
                  <p className="text-xs text-stellar-blue font-medium mt-1 uppercase tracking-wider">Pool Snapshot</p>
                </div>
              </div>
            </div>
            
            {(error || txStatus) && (
              <TransactionStatus 
                status={error ? 'failure' : txStatus} 
                hash={txHash}
                message={error} 
              />
            )}
          </div>

          {/* Right Column */}
          <div className="lg:col-span-5 animate-in fade-in slide-in-from-right duration-700 delay-200">
            {connected ? (
              <DonateXLMForm 
                key={txCount} 
                onSend={handleDonate} 
                isSending={isSending} 
                balance={balance}
              />
            ) : (
              <div className="p-8 rounded-3xl glass border border-dashed border-white/10 flex flex-col items-center justify-center text-center space-y-6 py-20 group hover:border-stellar-blue/30 transition-colors">
                <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center text-slate-500 group-hover:scale-110 transition-transform duration-500">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div className="space-y-2">
                  <h3 className="text-white font-bold text-xl">Join the Cause</h3>
                  <p className="text-slate-400 text-sm max-w-[200px] mx-auto">Connect your wallet to start making an impact.</p>
                </div>
                <button 
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className={`px-10 py-4 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-bold transition-all flex items-center gap-3 active:scale-95 shadow-xl ${isConnecting ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isConnecting ? (
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                    </svg>
                  ) : <span className="text-lg">Connect Wallet</span>}
                </button>
              </div>
            )}
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto px-6 py-8 border-t border-white/5 text-center">
        <p className="text-slate-500 text-sm">
          Built for Stellar Testnet • Powered by Freighter Wallet
        </p>
      </footer>
    </div>
  );
}

export default App;
