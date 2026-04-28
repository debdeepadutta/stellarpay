import React, { useState, useEffect, useCallback } from 'react';
import { 
  Networks, 
  TransactionBuilder, 
  Operation, 
  Account, 
  rpc, 
  scValToNative 
} from "@stellar/stellar-sdk";

const DUMMY_ACCOUNT = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");

const DonorLeaderboard = ({ contractId, networkPassphrase, connectedWallet }) => {
  const [donors, setDonors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalDonated, setTotalDonated] = useState(0);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const rpcServer = new rpc.Server("https://soroban-testnet.stellar.org");
      
      // 1. Build simulation transaction
      const builder = new TransactionBuilder(DUMMY_ACCOUNT, { 
        fee: "100", 
        networkPassphrase: networkPassphrase || Networks.TESTNET 
      });

      const tx = builder
        .addOperation(Operation.invokeContractFunction({ 
          contract: contractId, 
          function: "get_top_donors" 
        }))
        .setTimeout(30)
        .build();

      const res = await rpcServer.simulateTransaction(tx);
      
      if (rpc.Api.isSimulationSuccess(res)) {
        const rawData = scValToNative(res.result.retval);
        // rawData is likely [[address, bigint], ...]
        const formatted = rawData.map(([address, amount]) => ({
          address,
          amount: Number(amount),
          rawAmount: Number(amount)
        }));

        // Calculate total for percentages
        const total = formatted.reduce((sum, d) => sum + d.rawAmount, 0);
        setTotalDonated(total);
        setDonors(formatted);
        setError(null);
      } else {
        throw new Error("Simulation failed");
      }
    } catch (err) {
      console.error("Leaderboard fetch error:", err);
      setError("Failed to sync with blockchain");
    } finally {
      setLoading(false);
    }
  }, [contractId, networkPassphrase]);

  useEffect(() => {
    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 30000);
    return () => clearInterval(interval);
  }, [fetchLeaderboard]);

  const truncateAddress = (addr) => {
    if (!addr) return "";
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
  };

  const getRankEmoji = (index) => {
    if (index === 0) return "🥇";
    if (index === 1) return "🥈";
    if (index === 2) return "🥉";
    return index + 1;
  };

  if (loading && donors.length === 0) {
    return (
      <div className="w-full max-w-2xl mx-auto bg-slate-900/50 rounded-2xl p-6 border border-slate-800 animate-pulse">
        <div className="h-8 w-48 bg-slate-800 rounded mb-6"></div>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 bg-slate-800/50 rounded-xl w-full"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error && donors.length === 0) {
    return (
      <div className="w-full max-w-2xl mx-auto bg-slate-900 border border-red-900/30 rounded-2xl p-8 text-center">
        <div className="text-red-400 mb-4 font-medium">{error}</div>
        <button 
          onClick={() => { setLoading(true); fetchLeaderboard(); }}
          className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-all"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6 px-2">
        <h2 className="text-2xl font-bold text-white flex items-center gap-3">
          <span className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </span>
          Top Philanthropists
        </h2>
        <span className="text-xs text-slate-500 font-mono flex items-center gap-2">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
          Live Sync
        </span>
      </div>

      <div className="bg-slate-900/40 backdrop-blur-xl border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800/50 text-slate-500 text-xs uppercase tracking-wider">
              <th className="px-6 py-4 font-semibold">Rank</th>
              <th className="px-6 py-4 font-semibold">Philanthropist</th>
              <th className="px-6 py-4 font-semibold text-right">Contribution</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/30">
            {donors.map((donor, index) => {
              const isMe = connectedWallet === donor.address;
              const percentage = totalDonated > 0 ? (donor.rawAmount / totalDonated) * 100 : 0;
              
              return (
                <tr 
                  key={donor.address} 
                  className={`group transition-all hover:bg-slate-800/30 ${isMe ? 'bg-indigo-500/5' : ''}`}
                >
                  <td className="px-6 py-5">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-800/50 text-lg border border-slate-700/50 group-hover:border-indigo-500/30 transition-colors">
                      {getRankEmoji(index)}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex flex-col">
                      <span className={`font-mono font-medium ${isMe ? 'text-indigo-400' : 'text-slate-200'}`}>
                        {truncateAddress(donor.address)}
                        {isMe && <span className="ml-2 text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full uppercase tracking-tighter">You</span>}
                      </span>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full mt-2 overflow-hidden max-w-[120px]">
                        <div 
                          className={`h-full rounded-full transition-all duration-1000 ${index === 0 ? 'bg-amber-400' : index === 1 ? 'bg-slate-300' : index === 2 ? 'bg-amber-600' : 'bg-indigo-500'}`}
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex flex-col items-end">
                      <span className="text-white font-bold text-lg">
                        {donor.rawAmount.toLocaleString()} <span className="text-[10px] text-slate-500 ml-1 uppercase font-normal">XLM</span>
                      </span>
                      <span className="text-[10px] text-indigo-400/80 font-medium">
                        {percentage.toFixed(1)}% weight
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        
        {donors.length === 0 && (
          <div className="p-12 text-center text-slate-500">
            <p className="italic">No donations recorded yet. Be the first!</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DonorLeaderboard;
