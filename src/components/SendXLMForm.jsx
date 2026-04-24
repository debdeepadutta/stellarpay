import React, { useState } from 'react';

const DonateXLMForm = ({ onSend, isSending }) => {
  const [amount, setAmount] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!amount) return;
    onSend(null, amount); // Send null for recipient as it's not used by contract
  };

  const quickAmounts = ['10', '50', '100'];

  return (
    <div className="p-8 rounded-3xl glass border border-white/10 space-y-6 card-gradient group hover:border-stellar-blue/30 transition-all duration-500">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 bg-stellar-blue/10 rounded-2xl flex items-center justify-center text-stellar-blue group-hover:scale-110 transition-transform">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Donate to Pool</h2>
          <p className="text-slate-400 text-sm">Powered by Soroban</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between ml-1">
            <label className="text-sm font-medium text-slate-300">Amount (XLM)</label>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Testnet XLM</span>
          </div>
          <div className="relative">
            <input 
              type="number" 
              step="0.1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00" 
              className="w-full bg-slate-900/50 border border-white/5 rounded-2xl px-6 py-5 text-2xl font-bold text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue/50 transition-all placeholder:text-slate-700"
            />
            <span className="absolute right-6 top-1/2 -translate-y-1/2 text-stellar-blue font-black text-sm tracking-tighter">XLM</span>
          </div>

          <div className="flex gap-2">
            {quickAmounts.map(val => (
              <button
                key={val}
                type="button"
                onClick={() => setAmount(val)}
                className="flex-1 py-2 rounded-xl bg-white/5 border border-white/5 text-slate-400 text-xs font-bold hover:bg-stellar-blue/10 hover:text-stellar-blue hover:border-stellar-blue/20 transition-all active:scale-95"
              >
                {val} XLM
              </button>
            ))}
          </div>
        </div>

        <button 
          type="submit"
          disabled={isSending || !amount}
          className={`w-full py-5 bg-stellar-blue hover:bg-stellar-blue/90 text-white rounded-2xl font-bold transition-all shadow-xl shadow-stellar-blue/20 active:scale-95 flex items-center justify-center gap-3 overflow-hidden relative ${isSending ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {isSending ? (
            <div className="flex items-center gap-3 animate-pulse">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              <span className="tracking-wide">PROCESSING...</span>
            </div>
          ) : (
            <>
              <span className="text-lg">Send Donation</span>
              <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </>
          )}
        </button>
      </form>
    </div>
  );
};

export default DonateXLMForm;
