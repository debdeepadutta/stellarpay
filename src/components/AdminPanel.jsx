import React, { useState, useEffect, useCallback } from 'react';
import { 
  Networks, 
  TransactionBuilder, 
  Operation, 
  Account, 
  rpc, 
  scValToNative,
  nativeToScVal,
  Address,
  Transaction
} from "@stellar/stellar-sdk";
import toast from 'react-hot-toast';

const DUMMY_ACCOUNT = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");

const AdminPanel = ({ contractId, vaultContractId, connectedWallet, networkPassphrase, kit, initialAdmin, onActionComplete }) => {
  const [adminAddress, setAdminAddress] = useState(initialAdmin || "");
  const [vaultBalance, setVaultBalance] = useState(0);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null); // 'cap' or 'withdraw'
  const [lastUpdated, setLastUpdated] = useState(Date.now());

  
  const [newCap, setNewCap] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawDest, setWithdrawDest] = useState("");

  const isAdmin = connectedWallet?.toString().trim().toUpperCase() === adminAddress?.toString().trim().toUpperCase();

  const fetchData = useCallback(async () => {
    if (!contractId || contractId.length < 10) return;
    try {
      const rpcServer = new rpc.Server("https://soroban-testnet.stellar.org");
      
      const simulate = async (cid, fn, args = []) => {
        try {
          const builder = new TransactionBuilder(DUMMY_ACCOUNT, { 
            fee: "100", 
            networkPassphrase: networkPassphrase || Networks.TESTNET 
          });
          const tx = builder
            .addOperation(Operation.invokeContractFunction({ contract: cid, function: fn, args }))
            .setTimeout(30)
            .build();
          const res = await rpcServer.simulateTransaction(tx);
          return rpc.Api.isSimulationSuccess(res) ? scValToNative(res.result.retval) : null;
        } catch (e) {
          console.error(`Simulation failed for ${fn}:`, e);
          return null;
        }
      };

      // Always fetch admin first
      let admin = await simulate(contractId, "get_admin");
      
      if (admin) {
        setAdminAddress(admin.toString());
      } else if (initialAdmin) {
        console.warn(`Blockchain admin fetch failed for ${contractId}. Using database fallback: ${initialAdmin}`);
        setAdminAddress(initialAdmin);
      } else {
        console.error(`Could not fetch admin from blockchain or database for contract: ${contractId}`);
      }

      // Only fetch restricted data if connected wallet is admin
      if (connectedWallet && admin && connectedWallet.toString().toUpperCase() === admin.toString().toUpperCase()) {
        const [balance, logs] = await Promise.all([
          simulate(vaultContractId, "get_balance"),
          simulate(vaultContractId, "get_withdrawal_history")
        ]);

        if (balance !== null) setVaultBalance(Number(BigInt(balance)));
        if (logs !== null) setHistory(logs.map(log => ({
          ...log,
          amount: Number(BigInt(log.amount))
        })));
        setLastUpdated(Date.now());
      }
    } catch (err) {
      console.error("Admin fetch error:", err);
    }

  }, [connectedWallet, contractId, vaultContractId, networkPassphrase]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Update "seconds ago" every second
  const [secondsAgo, setSecondsAgo] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdated) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [lastUpdated]);


  const handleAction = async (type, fn, cid, args) => {
    setActionLoading(type);
    try {
      const rpcServer = new rpc.Server("https://soroban-testnet.stellar.org");
      const horizonServer = new rpc.Server("https://soroban-testnet.stellar.org"); // Use RPC for Soroban
      
      const account = await rpcServer.getLatestLedger(); // Simple check
      // For real submission, we need the actual account sequence
      // In this setup, we'll assume the App's handleDonate logic style
      
      // Since we don't have the full 'server' (Horizon) here, we'll use a simplified version
      // or assume the user will provide 'kit' and 'rpcServer' as props if needed.
      // For now, I'll use the pattern from App.jsx but localized.
      
      const fullServer = new rpc.Server("https://soroban-testnet.stellar.org");
      
      // Construct transaction
      const builder = new TransactionBuilder(new Account(connectedWallet, "0"), { 
        fee: "1000", 
        networkPassphrase: networkPassphrase || Networks.TESTNET 
      });

      const tx = builder
        .addOperation(Operation.invokeContractFunction({
          contract: cid,
          function: fn,
          args
        }))
        .setTimeout(60)
        .build();

      const sim = await rpcServer.simulateTransaction(tx);
      if (rpc.Api.isSimulationError(sim)) {
        console.error("Full Simulation Error:", sim);
        const errorDetail = sim.error || "Unknown simulation error";
        throw new Error(`Simulation failed: ${errorDetail}`);
      }

      const prepared = rpc.assembleTransaction(tx, sim).build();
      const { signedTxXdr } = await kit.signTransaction(prepared.toXDR(), { networkPassphrase: networkPassphrase || Networks.TESTNET });
      
      const send = await rpcServer.sendTransaction(new Transaction(signedTxXdr, networkPassphrase || Networks.TESTNET));
      
      toast.promise(
        (async () => {
          let res = await rpcServer.getTransaction(send.hash);
          while (res.status === "NOT_FOUND" || res.status === "PENDING") {
            await new Promise(r => setTimeout(r, 2000));
            res = await rpcServer.getTransaction(send.hash);
          }
          if (res.status !== rpc.Api.GetTransactionStatus.SUCCESS) throw new Error("Transaction failed");
          fetchData();
          if (onActionComplete) onActionComplete();
          return send.hash;

        })(),
        {
          loading: 'Processing transaction...',
          success: (hash) => (
            <span>
              Success! <a href={`https://stellar.expert/explorer/testnet/tx/${hash}`} target="_blank" rel="noreferrer" className="underline">View Hash</a>
            </span>
          ),
          error: 'Transaction failed',
        }
      );

    } catch (err) {
      toast.error(err.message || "Action failed");
    } finally {
      setActionLoading(null);
    }
  };

  if (!connectedWallet) return null;

  if (adminAddress === "") {
    return (
      <div className="w-full bg-slate-950/20 border border-slate-800/50 rounded-2xl p-4 flex items-center justify-center gap-3">
        <div className="w-4 h-4 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Verifying Authority...</span>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="w-full max-w-2xl mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center">
        <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
        <p className="text-slate-500 mb-8 text-sm">This terminal is restricted to administrative personnel only.</p>
        
        <div className="space-y-4 max-w-md mx-auto">
          <div className="text-left">
            <div className="text-[10px] text-slate-600 uppercase font-black tracking-widest mb-1">Your Identity ({connectedWallet?.length})</div>
            <div className="font-mono text-xs text-indigo-400 bg-indigo-500/5 py-3 px-4 rounded-xl border border-indigo-500/10 break-all leading-relaxed shadow-inner">
              {connectedWallet}
            </div>
          </div>
          
          <div className="flex items-center justify-center py-2">
            <div className="h-[1px] w-8 bg-slate-800"></div>
            <div className="px-3 text-[10px] text-slate-700 font-bold">VS</div>
            <div className="h-[1px] w-8 bg-slate-800"></div>
          </div>

          <div className="text-left">
            <div className="text-[10px] text-slate-600 uppercase font-black tracking-widest mb-1">Required Authority ({adminAddress?.length || 0})</div>
            <div className="font-mono text-xs text-rose-500/60 bg-rose-500/5 py-3 px-4 rounded-xl border border-rose-500/10 break-all leading-relaxed">
              {adminAddress || "Fetching..."}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-black text-white flex items-center gap-3 italic tracking-tighter">
          <span className="p-2 bg-red-500 rounded-lg shadow-lg shadow-red-500/20">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </span>
          Admin Console
        </h2>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest flex items-center gap-2">
              <span className="w-1 h-1 bg-green-500 rounded-full animate-pulse"></span>
              {secondsAgo === 0 ? 'Just now' : `${secondsAgo}s ago`}
              <span className="mx-1">|</span>
              Vault Reserve
            </div>
            <div className="text-xl font-black text-emerald-400">{vaultBalance.toLocaleString()} XLM</div>
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Donation Cap Management */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>
            Policy Configuration
          </h3>
          <p className="text-sm text-slate-500">Set the maximum allowed donation per wallet address.</p>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter">New Donation Cap (XLM)</label>
              <input 
                type="number"
                value={newCap}
                onChange={(e) => setNewCap(e.target.value)}
                placeholder="e.g. 5000"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <button 
              onClick={() => handleAction('cap', 'set_donation_cap', contractId, [Address.fromString(connectedWallet).toScVal(), nativeToScVal(BigInt(Math.floor(parseFloat(newCap) * 10000000)), { type: 'i128' })])}
              disabled={actionLoading === 'cap' || !newCap}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-indigo-600/20"
            >
              {actionLoading === 'cap' ? 'Updating...' : 'Apply New Cap'}
            </button>
          </div>
        </div>

        {/* Withdrawal - Danger Zone */}
        <div className="bg-slate-900 border-2 border-red-900/20 rounded-3xl p-8 space-y-6">
          <h3 className="text-lg font-bold text-red-500 flex items-center gap-2">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
            Vault Withdrawal
          </h3>
          <p className="text-sm text-slate-500">Transfer funds from the secure vault to an external destination.</p>
          
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Amount (XLM)</label>
                <input 
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500 transition-colors"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Destination Address</label>
                <input 
                  type="text"
                  value={withdrawDest}
                  onChange={(e) => setWithdrawDest(e.target.value)}
                  placeholder="G..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500 transition-colors"
                />
              </div>
            </div>
            <button 
              onClick={() => handleAction('withdraw', 'withdraw', vaultContractId, [Address.fromString(connectedWallet).toScVal(), nativeToScVal(BigInt(Math.floor(parseFloat(withdrawAmount) * 10000000)), { type: 'i128' }), Address.fromString(withdrawDest).toScVal()])}
              disabled={actionLoading === 'withdraw' || !withdrawAmount || !withdrawDest}
              className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-red-600/20"
            >
              {actionLoading === 'withdraw' ? 'Processing...' : 'Authorize Withdrawal'}
            </button>
          </div>
        </div>
      </div>

      {/* Withdrawal History */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
          <h3 className="font-bold text-white">Withdrawal History</h3>
          <button onClick={fetchData} className="text-xs text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-widest">Refresh Logs</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950 text-slate-500 text-[10px] uppercase font-bold tracking-widest">
                <th className="px-6 py-4">Destination</th>
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {history.map((log, i) => (
                <tr key={i} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4 font-mono text-xs text-slate-300">
                    {log.to.slice(0, 8)}...{log.to.slice(-8)}
                  </td>
                  <td className="px-6 py-4 text-emerald-400 font-bold">{log.amount.toLocaleString()} XLM</td>
                  <td className="px-6 py-4 text-right text-slate-500 text-xs">
                    {new Date(Number(log.timestamp) * 1000).toLocaleString()}
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan="3" className="px-6 py-12 text-center text-slate-600 italic">No withdrawal records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
