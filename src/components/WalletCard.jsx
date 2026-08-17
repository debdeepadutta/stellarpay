import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

const RelativeTime = ({ timestamp }) => {
  const [seconds, setSeconds] = useState(() => Math.floor((Date.now() - timestamp) / 1000));
  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds(Math.floor((Date.now() - timestamp) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [timestamp]);
  return <>{seconds === 0 ? 'Just now' : `${seconds}s ago`}</>;
};

const RELAYER_BASE = import.meta.env.VITE_SPONSOR_RELAYER_URL
  ? import.meta.env.VITE_SPONSOR_RELAYER_URL.replace('/sponsor-and-submit', '')
  : '/api';

const WalletCard = ({ address, balance, isFetching, lastUpdated, onBalanceRefresh }) => {
  const [funding, setFunding] = useState(false);
  const [funded, setFunded] = useState(false);

  const isZeroBalance = !isFetching && (parseFloat(balance) === 0 || balance === '0.00' || !balance);
  const isContract = address && address.startsWith('C');

  const handleFund = async () => {
    if (!address || funding) return;
    setFunding(true);
    const toastId = toast.loading('Requesting testnet funds from relayer…');
    try {
      const res = await fetch(`${RELAYER_BASE}/fund-contract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId: address }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.details || data.error || 'Funding failed');
      }
      toast.success('🎉 1,000 Testnet XLM sent! Refreshing balance…', { id: toastId });
      setFunded(true);
      // Give the chain 4 seconds to confirm then refresh
      setTimeout(() => {
        if (onBalanceRefresh) onBalanceRefresh();
      }, 4000);
    } catch (err) {
      toast.error('Funding failed: ' + err.message, { id: toastId });
    } finally {
      setFunding(false);
    }
  };

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

        <div className="pt-6 border-t border-white/5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-1">XLM Balance</p>
              <div className="flex items-baseline gap-2">
                {isFetching ? (
                  <div className="h-10 sm:h-12 w-24 sm:w-32 bg-white/10 rounded-xl animate-pulse"></div>
                ) : (
                  <span className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tabular-nums">
                    {balance || '0.00'}
                  </span>
                )}
                <span className="text-lg sm:text-xl font-semibold text-stellar-blue">XLM</span>
              </div>
            </div>
            {address && !isFetching && (
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest text-right">
                Last Sync: <RelativeTime timestamp={lastUpdated} />
              </div>
            )}
          </div>

          {/* Fund button — only shown for unfunded Smart Wallet contract addresses */}
          {address && isContract && isZeroBalance && !funded && (
            <button
              id="fund-wallet-btn"
              onClick={handleFund}
              disabled={funding}
              style={{
                background: funding
                  ? 'rgba(99,102,241,0.3)'
                  : 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
                boxShadow: funding ? 'none' : '0 0 24px rgba(99,102,241,0.5)',
              }}
              className="w-full flex items-center justify-center gap-3 py-3.5 px-6 rounded-2xl text-white font-bold text-sm tracking-wide transition-all duration-300 active:scale-95 disabled:cursor-not-allowed"
            >
              {funding ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Sending Testnet XLM…
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  ⚡ Fund Testnet Wallet (1,000 XLM)
                </>
              )}
            </button>
          )}

          {funded && (
            <div className="flex items-center gap-2 text-emerald-400 text-sm font-semibold bg-emerald-400/10 border border-emerald-400/20 rounded-2xl px-4 py-3">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Funded! Balance updating in a few seconds…
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WalletCard;


// fmt