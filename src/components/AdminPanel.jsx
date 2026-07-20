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
  Transaction,
  Horizon
} from "@stellar/stellar-sdk";
import toast from 'react-hot-toast';

const DUMMY_ACCOUNT = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");
const toI128 = (n) => nativeToScVal(BigInt(Math.floor(parseFloat(n) * 10000000)), { type: "i128" });

const AdminPanel = ({ contractId, vaultContractId, connectedWallet, networkPassphrase, kit, initialAdmin, onActionComplete, campaignId }) => {
  const [adminAddress, setAdminAddress] = useState(initialAdmin || "");
  const [vaultBalance, setVaultBalance] = useState(0);
  const [history, setHistory] = useState([]);
  const [actionLoading, setActionLoading] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(() => Date.now());
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawDest, setWithdrawDest] = useState("");
  const [milestoneConfig, setMilestoneConfig] = useState(null);
  const [multiSigConfig, setMultiSigConfig] = useState(null);
  const [proposals, setProposals] = useState([]);

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

      // Build campaign Symbol for on-chain queries
      const campaignSymbol = campaignId 
        ? nativeToScVal(campaignId.substring(0, 32), { type: "symbol" }) 
        : null;

      // Fetch campaign admin from on-chain registry
      let admin = null;
      if (campaignSymbol) {
        admin = await simulate(contractId, "get_campaign_admin", [campaignSymbol]);
      }
      if (!admin) {
        // Fallback: try legacy get_admin
        admin = await simulate(contractId, "get_admin");
      }
      
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
        if (campaignSymbol) {
          // Multi-campaign: use campaign-specific vault queries
          const [stats, logs, config, msConfig] = await Promise.all([
            simulate(vaultContractId, "get_campaign_stats", [campaignSymbol]),
            simulate(vaultContractId, "get_campaign_withdrawal_history", [campaignSymbol]),
            simulate(vaultContractId, "get_campaign_config", [campaignSymbol]),
            simulate(vaultContractId, "get_multisig_config", [campaignSymbol])
          ]);

          if (stats) {
            const balance = Number(BigInt(stats.current_balance || 0)) / 10000000;
            setVaultBalance(balance);
          }
          if (logs) setHistory(logs.map(log => ({
            ...log,
            amount: Number(BigInt(log.amount)) / 10000000
          })));
          if (config) {
            setMilestoneConfig({
              goal: Number(BigInt(config.goal || 0)) / 10000000,
              milestones: config.milestones || [],
              verifier: config.verifier?.toString() || '',
              approved: config.approved || []
            });
          }
          if (msConfig) {
            setMultiSigConfig({
              signers: (msConfig.signers || []).map(s => s.toString()),
              threshold: msConfig.threshold
            });
            // Fetch pending proposals
            const countRaw = await simulate(vaultContractId, "get_proposal_count", [campaignSymbol]);
            const count = Number(countRaw || 0);
            const proposalFetches = [];
            for (let i = 0; i < count; i++) {
              proposalFetches.push(simulate(vaultContractId, "get_proposal", [campaignSymbol, nativeToScVal(i, { type: 'u32' })]));
            }
            const rawProposals = await Promise.all(proposalFetches);
            setProposals(rawProposals.filter(Boolean).map((p, i) => ({
              idx: i,
              amount: Number(BigInt(p.amount || 0)) / 10000000,
              to: p.to?.toString() || '',
              approvals: (p.approvals || []).map(a => a.toString()),
              threshold: p.threshold,
              executed: p.executed
            })));
          }
        } else {
          // Legacy fallback for old campaigns
          const [balance, logs] = await Promise.all([
            simulate(vaultContractId, "get_balance"),
            simulate(vaultContractId, "get_withdrawal_history")
          ]);

          if (balance !== null) setVaultBalance(Number(BigInt(balance)) / 10000000);
          if (logs !== null) setHistory(logs.map(log => ({
            ...log,
            amount: Number(BigInt(log.amount)) / 10000000
          })));
        }
        setLastUpdated(Date.now());
      }
    } catch (err) {
      console.error("Admin fetch error:", err);
    }

  }, [connectedWallet, contractId, vaultContractId, networkPassphrase, campaignId, initialAdmin]);

  useEffect(() => {
    Promise.resolve().then(() => fetchData());
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
      
      // Construct transaction
      let account;
      try {
        const horizonServer = new Horizon.Server("https://horizon-testnet.stellar.org");
        account = await horizonServer.loadAccount(connectedWallet);
        } catch (err) {
          if (err?.response?.status === 404) {
            throw new Error("Your account does not exist on Testnet. Please fund it using Friendbot first.", { cause: err });
          }
        console.warn("Could not load account from Horizon, using fallback:", err);
        account = new Account(connectedWallet, "0");
      }

      const builder = new TransactionBuilder(account, { 
        fee: "10000", 
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
      console.log("Transaction Hash:", send.hash, "Status:", send.status);
      
      if (send.status === "ERROR") {
        console.error("sendTransaction error details:", send.errorResultXdr || send.errorResult);
        const errVal = send.errorResultXdr || send.errorResult || "Unknown transaction rejection";
        throw new Error(`Transaction rejected by network: ${errVal}`);
      }
      
      toast.promise(
        (async () => {
          let res = await rpcServer.getTransaction(send.hash);
          let attempts = 0;
          while ((res.status === "NOT_FOUND" || res.status === "PENDING") && attempts < 25) {
            await new Promise(r => setTimeout(r, 2000));
            res = await rpcServer.getTransaction(send.hash);
            attempts++;
          }
          if (res.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
            throw new Error("Transaction failed on-chain or timed out.");
          }
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

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-black text-white flex items-center gap-3 italic tracking-tighter uppercase">
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

      <div className="grid grid-cols-1 gap-8">
        {isAdmin ? (
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
                onClick={() => {
                  const campaignSymbol = campaignId 
                    ? nativeToScVal(campaignId.substring(0, 32), { type: "symbol" }) 
                    : null;
                  const args = campaignSymbol 
                    ? [campaignSymbol, Address.fromString(connectedWallet).toScVal(), toI128(withdrawAmount), Address.fromString(withdrawDest).toScVal()]
                    : [Address.fromString(connectedWallet).toScVal(), nativeToScVal(BigInt(Math.floor(parseFloat(withdrawAmount) * 10000000)), { type: 'i128' }), Address.fromString(withdrawDest).toScVal()];
                  handleAction('withdraw', 'withdraw', vaultContractId, args);
                }}
                disabled={actionLoading === 'withdraw' || !withdrawAmount || !withdrawDest}
                className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-red-600/20"
              >
                {actionLoading === 'withdraw' ? 'Processing...' : 'Authorize Withdrawal'}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-4">
            <span className="text-4xl">🛡️</span>
            <h3 className="text-lg font-bold text-slate-400">Withdrawal Panel Restricted</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              Only the campaign creator (Admin) holds the authority to withdraw funds from the vault.
            </p>
            <div className="text-xs text-slate-600 font-mono select-all">
              Authorized Admin: {adminAddress}
            </div>
          </div>
        )}
      </div>

      {/* Milestone Status Panel */}
      {milestoneConfig && (
        <div className="bg-slate-900 border border-emerald-900/30 rounded-3xl overflow-hidden">
          <div className="p-6 border-b border-slate-800 flex justify-between items-center">
            <div>
              <h3 className="font-bold text-white flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                Milestone Fund Gates
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Goal: {milestoneConfig.goal.toLocaleString()} XLM &nbsp;·&nbsp;
                Verifier: <span className="font-mono text-emerald-400">{milestoneConfig.verifier?.slice(0,8)}...{milestoneConfig.verifier?.slice(-6)}</span>
              </p>
            </div>
            <span className="text-[10px] font-mono text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-full">On-Chain Enforced</span>
          </div>
          <div className="p-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {(milestoneConfig.milestones || []).map((pct, i) => {
              const isApproved = (milestoneConfig.approved || []).includes(pct);
              const isVerifier = connectedWallet?.toUpperCase() === milestoneConfig.verifier?.toUpperCase();
              const capXlm = ((milestoneConfig.goal * pct) / 100).toLocaleString();
              return (
                <div
                  key={i}
                  className={`rounded-2xl p-4 text-center space-y-2 border ${isApproved ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-slate-700 bg-slate-800/50'}`}
                >
                  <div className={`text-2xl font-black ${isApproved ? 'text-emerald-400' : 'text-slate-500'}`}>{pct}%</div>
                  <div className="text-[10px] text-slate-500">{capXlm} XLM cap</div>
                  <div className={`text-[10px] font-bold uppercase tracking-widest ${isApproved ? 'text-emerald-500' : 'text-slate-600'}`}>
                    {isApproved ? '✓ Approved' : 'Pending'}
                  </div>
                  {!isApproved && isVerifier && (
                    <button
                      onClick={() => {
                        const sym = nativeToScVal(campaignId.substring(0, 32), { type: "symbol" });
                        const pctVal = nativeToScVal(pct, { type: 'u32' });
                        handleAction(`approve_${pct}`, 'approve_milestone', vaultContractId, [sym, Address.fromString(connectedWallet).toScVal(), pctVal]);
                      }}
                      disabled={!!actionLoading}
                      className="w-full text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-1 transition-all"
                    >
                      {actionLoading === `approve_${pct}` ? '...' : 'Approve'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Multi-Sig Withdrawal Panel */}
      {multiSigConfig && (
        <div className="bg-slate-900 border border-indigo-900/30 rounded-3xl overflow-hidden">
          <div className="p-6 border-b border-slate-800 flex justify-between items-center">
            <div>
              <h3 className="font-bold text-white flex items-center gap-2">
                <span className="text-indigo-400">🔐</span>
                Multi-Sig Withdrawals
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Threshold: <span className="text-indigo-400 font-bold">{multiSigConfig.threshold}-of-{multiSigConfig.signers.length}</span> signatures required
              </p>
            </div>
            <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded-full">
              {multiSigConfig.signers.length} Signers
            </span>
          </div>

          {/* Pending Proposals */}
          <div className="p-6 space-y-4">
            {proposals.filter(p => !p.executed).length === 0 && (
              <p className="text-center text-slate-600 italic text-sm py-4">No pending proposals</p>
            )}
            {proposals.filter(p => !p.executed).map((proposal) => {
              const isSigner = multiSigConfig.signers.some(
                s => s.toUpperCase() === connectedWallet?.toUpperCase()
              );
              const alreadySigned = proposal.approvals.some(
                a => a.toUpperCase() === connectedWallet?.toUpperCase()
              );
              const hasThreshold = proposal.approvals.length >= proposal.threshold;
              const sym = nativeToScVal(campaignId.substring(0, 32), { type: "symbol" });
              return (
                <div key={proposal.idx} className="bg-slate-800/60 border border-slate-700 rounded-2xl p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-emerald-400 font-black text-xl">{proposal.amount.toLocaleString()} XLM</div>
                      <div className="text-xs text-slate-500 font-mono mt-1">→ {proposal.to.slice(0,8)}...{proposal.to.slice(-6)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-indigo-400">{proposal.approvals.length}/{proposal.threshold} Signatures</div>
                      <div className="flex gap-1 mt-1 justify-end">
                        {Array.from({length: proposal.threshold}).map((_, i) => (
                          <div key={i} className={`w-2 h-2 rounded-full ${i < proposal.approvals.length ? 'bg-emerald-500' : 'bg-slate-600'}`}/>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {isSigner && !alreadySigned && !hasThreshold && (
                      <button
                        onClick={() => handleAction(`sign_${proposal.idx}`, 'sign_withdrawal', vaultContractId,
                          [sym, Address.fromString(connectedWallet).toScVal(), nativeToScVal(proposal.idx, { type: 'u32' })]
                        )}
                        disabled={!!actionLoading}
                        className="flex-1 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl py-2 transition-all"
                      >
                        {actionLoading === `sign_${proposal.idx}` ? '...' : '✍ Sign'}
                      </button>
                    )}
                    {isSigner && hasThreshold && (
                      <button
                        onClick={() => handleAction(`exec_${proposal.idx}`, 'execute_withdrawal', vaultContractId,
                          [sym, Address.fromString(connectedWallet).toScVal(), nativeToScVal(proposal.idx, { type: 'u32' })]
                        )}
                        disabled={!!actionLoading}
                        className="flex-1 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl py-2 transition-all"
                      >
                        {actionLoading === `exec_${proposal.idx}` ? '...' : '⚡ Execute'}
                      </button>
                    )}
                    {alreadySigned && !hasThreshold && (
                      <span className="text-xs text-emerald-500 font-bold flex items-center gap-1">✓ Signed — waiting for others</span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* New Proposal Form — only for registered signers */}
            {multiSigConfig.signers.some(s => s.toUpperCase() === connectedWallet?.toUpperCase()) && (
              <div className="border-t border-slate-800 pt-4 space-y-3">
                <div className="text-xs font-black text-slate-500 uppercase tracking-widest">Propose New Withdrawal</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 uppercase">Amount (XLM)</label>
                    <input
                      type="number"
                      value={withdrawAmount}
                      onChange={e => setWithdrawAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 uppercase">Destination</label>
                    <input
                      type="text"
                      value={withdrawDest}
                      onChange={e => setWithdrawDest(e.target.value)}
                      placeholder="G..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                </div>
                <button
                  onClick={() => {
                    const sym = nativeToScVal(campaignId.substring(0, 32), { type: "symbol" });
                    handleAction('propose', 'propose_withdrawal', vaultContractId,
                      [sym, Address.fromString(connectedWallet).toScVal(), toI128(withdrawAmount), Address.fromString(withdrawDest).toScVal()]
                    );
                  }}
                  disabled={!!actionLoading || !withdrawAmount || !withdrawDest}
                  className="w-full py-2 text-sm font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl transition-all"
                >
                  {actionLoading === 'propose' ? 'Processing...' : 'Create Proposal'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

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
