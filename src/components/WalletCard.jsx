import React from 'react';

const WalletCard = ({ address, balance, isFetching, lastUpdated }) => {
  return (
    <div className="w-full p-6 sm:p-8 rounded-3xl glass card-gradient relative overflow-hidden">
      <div className="absolute -right-12 -top-12 w-64 h-64 bg-stellar-blue/10 rounded-full blur-3xl animate-pulse-slow"></div>
      
      <div className="relative z-10 space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-1">Your Wallet Address</p>
            <h3 className="text-lg sm:text-xl md:text-2xl font-mono text-white break-all">{address || '---'}</h3>
          </div>
          <div className="p-3 bg-white/5 rounded-2xl border border-white/10">
            <svg className="w-6 h-6 text-stellar-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </div>
        </div>

        <div className="pt-6 border-t border-white/5 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-1">XLM Balance</p>
            <div className="flex items-baseline gap-2">
              {isFetching ? (
                <div className="h-10 sm:h-12 w-24 sm:w-32 bg-white/10 rounded-xl animate-pulse"></div>
              ) : (
                <span className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tabular-nums">{balance || '0.00'}</span>
              )}
              <span className="text-lg sm:text-xl font-semibold text-stellar-blue">XLM</span>
            </div>
          </div>
          {address && !isFetching && (
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest text-right">
              Last Sync: {Math.floor((Date.now() - lastUpdated) / 1000) === 0 ? 'Just now' : `${Math.floor((Date.now() - lastUpdated) / 1000)}s ago`}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default WalletCard;
