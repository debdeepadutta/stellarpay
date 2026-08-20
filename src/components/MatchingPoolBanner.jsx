import React, { useState, useEffect, useCallback } from 'react';
import {
  Networks,
  TransactionBuilder,
  Operation,
  Account,
  rpc,
  scValToNative,
  Address,
} from '@stellar/stellar-sdk';

const RPC_URL = 'https://soroban-testnet.stellar.org';

async function simulateRead(vaultId, fn, args) {
  if (!vaultId) return null;
  try {
    const rpcServer = new rpc.Server(RPC_URL);
    const builder = new TransactionBuilder(
      new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '0'),
      { fee: '100', networkPassphrase: Networks.TESTNET }
    );
    const tx = builder
      .addOperation(Operation.invokeContractFunction({ contract: vaultId, function: fn, args }))
      .setTimeout(30)
      .build();
    const res = await rpcServer.simulateTransaction(tx);
    if (rpc.Api.isSimulationSuccess(res)) return scValToNative(res.result.retval);
    return null;
  } catch {
    return null;
  }
}

/**
 * MatchingPoolBanner — displays matching pool status for a campaign.
 * Shows "2x MATCHING ACTIVE" if a pool is live, and remaining capacity.
 */
export default function MatchingPoolBanner({ vaultContractId, campaignId, lastDonationAt }) {
  const [pool, setPool] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchPool = useCallback(async () => {
    if (!vaultContractId || !campaignId) return;
    setLoading(true);
    try {
      const { nativeToScVal, Symbol: SSymbol } = await import('@stellar/stellar-sdk');
      const campaignSym = nativeToScVal(campaignId, { type: 'symbol' });
      const val = await simulateRead(vaultContractId, 'get_matching_pool', [campaignSym]);
      setPool(val || null);
    } catch (e) {
      console.warn('Pool fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [vaultContractId, campaignId]);

  useEffect(() => {
    fetchPool();
  }, [fetchPool, lastDonationAt]);

  if (loading || !pool) return null;

  const total = Number(BigInt(pool.total || 0)) / 10_000_000;
  const used = Number(BigInt(pool.used || 0)) / 10_000_000;
  const remaining = total - used;
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const isActive = pool.active && remaining > 0;

  if (!isActive && remaining <= 0) {
    return (
      <div className="bg-slate-900/60 border border-slate-700/40 rounded-2xl px-5 py-4 flex items-center gap-3 text-slate-500 text-sm">
        <span className="text-lg">🤝</span>
        <span>Matching pool exhausted — <span className="text-emerald-500 font-bold">{total.toLocaleString(undefined, { maximumFractionDigits: 2 })} XLM</span> was matched in total.</span>
      </div>
    );
  }

  if (!pool.active) return null;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/80 via-slate-900/80 to-slate-900/80 p-6 space-y-4">
      {/* Animated glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none" />

      <div className="flex items-start justify-between gap-4 relative">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xl animate-pulse">🤝</span>
            <span className="text-xs font-black uppercase tracking-widest text-emerald-400">Matching Active</span>
          </div>
          <p className="text-white font-bold text-sm leading-relaxed">
            Your donation is being <span className="text-emerald-400">matched 1:1</span>! Every XLM you give doubles its impact.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-2xl font-black text-emerald-400">{remaining.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-widest">XLM Left to Match</div>
        </div>
      </div>

      {/* Pool progress */}
      <div className="space-y-1.5 relative">
        <div className="flex justify-between text-[10px] text-slate-500 uppercase tracking-widest font-bold">
          <span>Pool Used: {used.toLocaleString(undefined, { maximumFractionDigits: 2 })} XLM</span>
          <span>Total: {total.toLocaleString(undefined, { maximumFractionDigits: 2 })} XLM</span>
        </div>
        <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-white/5">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

