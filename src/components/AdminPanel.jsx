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

      const campaignSymbol = campaignId 
        ? nativeToScVal(campaignId.substring(0, 32), { type: "symbol" }) 
        : null;

      let admin = null;
      if (campaignSymbol) {
        admin = await simulate(contractId, "get_campaign_admin", [campaignSymbol]);
      }
      if (!admin) {
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

      if (connectedWallet && admin && connectedWallet.toString().toUpperCase() === admin.toString().toUpperCase()) {
        if (campaignSymbol) {
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
          const [balance, logs] = await Promise.all([
            simulate(vaultContractId, "get_balance"),
            simulate(vaultContractId, "get_withdrawal_history")
          ]);

          if (balance !== null && balance !== undefined) {
            setVaultBalance(Number(BigInt(balance)) / 10000000);
          }
          if (logs) {
            setHistory(logs.map(log => ({
              ...log,
              amount: Number(BigInt(log.amount || 0)) / 10000000
            })));
          }
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
              Success! <a href={`https://stellar.expert/explorer/testnet/tx/${hash}`} target="_blank" rel="noreferrer" className="underline font-mono">View Hash</a>
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
      <div className="w-full bg-[#0A0D13] border border-steel-horizon/20 rounded-xl p-4 flex items-center justify-center gap-3">
        <div className="w-4 h-4 border-2 border-steel-horizon/20 border-t-parchment-wheat rounded-full animate-spin"></div>
        <span className="text-[10px] font-bold text-steel-horizon uppercase tracking-widest font-mono">Verifying Authority...</span>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between border-b border-steel-horizon/10 pb-4">
        <h2 className="text-xl font-bold text-archival-chalk flex items-center gap-2 font-display uppercase tracking-tight">
          Admin Console
        </h2>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[9px] text-steel-horizon uppercase font-bold tracking-widest flex items-center gap-1 font-mono">
              <span className="w-1 h-1 bg-forest-moss rounded-full animate-pulse"></span>
              {secondsAgo === 0 ? 'Just now' : `${secondsAgo}s ago`}
              <span className="mx-1">|</span>
              Vault Reserve
            </div>
            <div className="text-lg font-bold text-parchment-wheat font-display">{vaultBalance.toLocaleString()} XLM</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {isAdmin ? (
          <div className="bg-carbon-ink border border-red-500/20 rounded-xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-red-400 uppercase tracking-wider font-mono flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>
              Vault Withdrawal
            </h3>
            <p className="text-xs text-steel-horizon leading-relaxed">Transfer funds from the campaign's on-chain escrow to an external wallet.</p>
            
            <div className="space-y-4 text-xs font-mono">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-steel-horizon uppercase font-bold">Amount (XLM)</label>
                  <input 
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-sage-slate border border-steel-horizon/20 rounded-lg p-3 text-archival-chalk focus:outline-none focus:border-red-500 transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-steel-horizon uppercase font-bold">Destination Wallet Address</label>
                  <input 
                    type="text"
                    value={withdrawDest}
                    onChange={(e) => setWithdrawDest(e.target.value)}
                    placeholder="G..."
                    className="w-full bg-sage-slate border border-steel-horizon/20 rounded-lg p-3 text-archival-chalk focus:outline-none focus:border-red-500 transition-colors"
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
                className="w-full bg-red-950 hover:bg-red-900 border border-red-500/20 text-red-300 font-bold py-3 rounded-lg transition-all cursor-pointer uppercase tracking-wider text-[10px]"
              >
                {actionLoading === 'withdraw' ? 'Processing...' : 'Authorize Withdrawal'}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-carbon-ink border border-steel-horizon/20 rounded-xl p-6 text-center space-y-3">
            <span className="text-2xl">🛡️</span>
            <h3 className="text-sm font-bold text-steel-horizon uppercase tracking-wider font-mono">Withdrawal Panel Restricted</h3>
            <p className="text-xs text-steel-horizon max-w-sm mx-auto">
              Only the registered campaign creator is authorized to trigger vault withdrawals.
            </p>
            <div className="text-[9px] text-steel-horizon/80 font-mono select-all truncate bg-sage-slate p-2 rounded">
              AUTHORIZED: {adminAddress}
            </div>
          </div>
        )}
      </div>

      {/* Milestone Status Panel */}
      {milestoneConfig && (
        <div className="bg-carbon-ink border border-steel-horizon/20 rounded-xl overflow-hidden text-xs">
          <div className="p-4 border-b border-steel-horizon/10 flex justify-between items-center bg-sage-slate/20">
            <div>
              <h3 className="font-bold text-archival-chalk font-mono uppercase tracking-wider">
                Milestone Fund Gates
              </h3>
              <p className="text-[10px] text-steel-horizon mt-0.5 font-mono">
                Goal: {milestoneConfig.goal.toLocaleString()} XLM &nbsp;·&nbsp;
                Verifier: <span className="font-mono text-parchment-wheat">{milestoneConfig.verifier?.slice(0,8)}...{milestoneConfig.verifier?.slice(-6)}</span>
              </p>
            </div>
            <span className="text-[8px] font-mono text-forest-moss bg-forest-moss/10 px-2 py-0.5 rounded border border-forest-moss/20">ON-CHAIN GATED</span>
          </div>
          <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono">
            {(milestoneConfig.milestones || []).map((m, i) => {
              const pct = typeof m === 'object' ? m.percentage : m;
              const isApproved = typeof m === 'object' ? m.approved : (milestoneConfig.approved || []).includes(pct);
              const isVerifier = connectedWallet?.toUpperCase() === milestoneConfig.verifier?.toUpperCase();
              const capXlm = typeof m === 'object'
                ? (Number(BigInt(m.cap || 0)) / 10000000).toLocaleString()
                : ((milestoneConfig.goal * pct) / 100).toLocaleString();
              return (
                <div
                  key={i}
                  className={`rounded-lg p-3 text-center space-y-1.5 border ${isApproved ? 'border-forest-moss/30 bg-forest-moss/5' : 'border-steel-horizon/20 bg-sage-slate/20'}`}
                >
                  <div className={`text-xl font-bold font-display ${isApproved ? 'text-forest-moss' : 'text-steel-horizon'}`}>{pct}%</div>
                  <div className="text-[9px] text-steel-horizon">{capXlm} XLM cap</div>
                  <div className={`text-[8px] font-bold uppercase tracking-wider ${isApproved ? 'text-forest-moss' : 'text-steel-horizon/60'}`}>
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
                      className="w-full text-[9px] font-bold bg-forest-moss hover:bg-emerald-800 disabled:opacity-50 text-white rounded py-1 transition-all uppercase tracking-wider font-mono cursor-pointer"
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

      {/* Multi-Sig Panel */}
      {multiSigConfig && (
        <div className="bg-carbon-ink border border-steel-horizon/20 rounded-xl overflow-hidden text-xs">
          <div className="p-4 border-b border-steel-horizon/10 flex justify-between items-center bg-sage-slate/20">
            <div>
              <h3 className="font-bold text-archival-chalk font-mono uppercase tracking-wider">
                Multi-Sig Configurations
              </h3>
              <p className="text-[10px] text-steel-horizon mt-0.5 font-mono">
                Threshold: <span className="text-parchment-wheat font-bold">{multiSigConfig.threshold}-of-{multiSigConfig.signers.length}</span> signatures required
              </p>
            </div>
            <span className="text-[8px] font-mono text-steel-horizon bg-sage-slate border border-steel-horizon/20 px-2 py-0.5 rounded">
              {multiSigConfig.signers.length} Signers
            </span>
          </div>

          <div className="p-4 space-y-4">
            {proposals.filter(p => !p.executed).length === 0 && (
              <p className="text-center text-steel-horizon italic text-xs py-2 font-mono">No pending withdrawal proposals</p>
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
                <div key={proposal.idx} className="bg-sage-slate border border-steel-horizon/20 rounded-lg p-4 space-y-3 font-mono">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-parchment-wheat font-bold text-lg">{proposal.amount.toLocaleString()} XLM</div>
                      <div className="text-[9px] text-steel-horizon mt-1 truncate max-w-[200px]">→ {proposal.to}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-bold text-steel-horizon">{proposal.approvals.length}/{proposal.threshold} Approved</div>
                      <div className="flex gap-1 mt-1 justify-end">
                        {Array.from({length: proposal.threshold}).map((_, i) => (
                          <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < proposal.approvals.length ? 'bg-forest-moss' : 'bg-steel-horizon/30'}`}/>
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
                        className="flex-1 text-[9px] font-bold bg-steel-horizon hover:bg-slate-600 disabled:opacity-50 text-white rounded py-1.5 transition-all cursor-pointer uppercase tracking-wider"
                      >
                        {actionLoading === `sign_${proposal.idx}` ? 'Signing...' : '✍ Sign'}
                      </button>
                    )}
                    {isSigner && hasThreshold && (
                      <button
                        onClick={() => handleAction(`exec_${proposal.idx}`, 'execute_withdrawal', vaultContractId,
                          [sym, Address.fromString(connectedWallet).toScVal(), nativeToScVal(proposal.idx, { type: 'u32' })]
                        )}
                        disabled={!!actionLoading}
                        className="flex-1 text-[9px] font-bold bg-forest-moss hover:bg-emerald-800 disabled:opacity-50 text-white rounded py-1.5 transition-all cursor-pointer uppercase tracking-wider"
                      >
                        {actionLoading === `exec_${proposal.idx}` ? 'Executing...' : '⚡ Execute'}
                      </button>
                    )}
                    {alreadySigned && !hasThreshold && (
                      <span className="text-[9px] text-forest-moss font-bold flex items-center gap-1 font-mono">✓ Signed (Waiting for other signers)</span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Proposal Form */}
            {multiSigConfig.signers.some(s => s.toUpperCase() === connectedWallet?.toUpperCase()) && (
              <div className="border-t border-steel-horizon/10 pt-4 space-y-3 font-mono text-xs">
                <div className="text-[10px] font-bold text-steel-horizon uppercase tracking-wider">Propose New Withdrawal</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[9px] text-steel-horizon uppercase">Amount (XLM)</label>
                    <input
                      type="number"
                      value={withdrawAmount}
                      onChange={e => setWithdrawAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-sage-slate border border-steel-horizon/20 rounded-lg px-3 py-2 text-archival-chalk text-xs focus:outline-none focus:border-steel-horizon"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] text-steel-horizon uppercase">Destination</label>
                    <input
                      type="text"
                      value={withdrawDest}
                      onChange={e => setWithdrawDest(e.target.value)}
                      placeholder="G..."
                      className="w-full bg-sage-slate border border-steel-horizon/20 rounded-lg px-3 py-2 text-archival-chalk text-xs focus:outline-none focus:border-steel-horizon font-mono"
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
                  className="w-full py-2 bg-steel-horizon hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg text-[10px] tracking-wider uppercase font-bold transition-all cursor-pointer"
                >
                  {actionLoading === 'propose' ? 'Proposing...' : 'Submit Proposal'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* History table */}
      <div className="bg-carbon-ink border border-steel-horizon/20 rounded-xl overflow-hidden text-xs">
        <div className="p-4 border-b border-steel-horizon/10 flex justify-between items-center bg-sage-slate/20">
          <h3 className="font-bold text-archival-chalk font-mono uppercase tracking-wider">Withdrawal History</h3>
          <button onClick={fetchData} className="text-[9px] text-parchment-wheat hover:text-white font-mono font-bold uppercase tracking-wider border border-parchment-wheat/30 px-2 py-0.5 rounded bg-carbon-ink/40">Refresh Logs</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse font-mono text-[10px]">
            <thead>
              <tr className="bg-sage-slate/40 text-steel-horizon uppercase font-bold tracking-widest text-[9px] border-b border-steel-horizon/10">
                <th className="px-6 py-3">Destination Address</th>
                <th className="px-6 py-3">Amount</th>
                <th className="px-6 py-3 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-horizon/10 text-steel-horizon">
              {history.map((log, i) => (
                <tr key={i} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-3 font-mono text-xs">
                    {(log.to || '').slice(0, 8)}...{(log.to || '').slice(-8)}
                  </td>
                  <td className="px-6 py-3 text-parchment-wheat font-bold">{log.amount.toLocaleString()} XLM</td>
                  <td className="px-6 py-3 text-right text-[9px]">
                    {new Date(Number(log.timestamp) * 1000).toLocaleString()}
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan="3" className="px-6 py-8 text-center text-steel-horizon/60 italic">No withdrawal records found.</td>
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


// fmt
// fmt