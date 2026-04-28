import React from 'react';

const VaultStats = ({ stats, isFetching }) => {
  return (
    <div className="p-6 rounded-3xl glass border border-white/10 card-gradient space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-bold text-lg">Vault Overview</h3>
        <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-500">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Total Held</p>
          <p className="text-xl font-bold text-white">{isFetching ? '...' : stats.current_balance} <span className="text-[10px]">XLM</span></p>
        </div>
        <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Donations</p>
          <p className="text-xl font-bold text-white">{isFetching ? '...' : stats.deposit_count}</p>
        </div>
        <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Deposited</p>
          <p className="text-sm font-bold text-emerald-400">+{isFetching ? '...' : stats.total_deposited}</p>
        </div>
        <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Withdrawn</p>
          <p className="text-sm font-bold text-rose-400">-{isFetching ? '...' : stats.total_withdrawn}</p>
        </div>
      </div>
    </div>
  );
};

export default VaultStats;
