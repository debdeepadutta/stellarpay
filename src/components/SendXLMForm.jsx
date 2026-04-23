import React, { useState } from 'react';

const SendXLMForm = ({ onSend, isSending }) => {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSend(recipient, amount);
  };

  return (
    <div className="w-full p-8 rounded-3xl glass border border-white/5 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 bg-stellar-blue/10 rounded-xl flex items-center justify-center text-stellar-blue">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white">Send XLM</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-2 ml-1">Recipient Address</label>
          <input 
            type="text" 
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            placeholder="G..." 
            disabled={isSending}
            required
            className="w-full px-5 py-4 bg-slate-900/50 border border-white/10 rounded-2xl focus:ring-2 focus:ring-stellar-blue/50 focus:border-stellar-blue outline-none transition-all text-white placeholder:text-slate-600 disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-400 mb-2 ml-1">Amount (XLM)</label>
          <div className="relative">
            <input 
              type="number" 
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00" 
              disabled={isSending}
              required
              className="w-full px-5 py-4 bg-slate-900/50 border border-white/10 rounded-2xl focus:ring-2 focus:ring-stellar-blue/50 focus:border-stellar-blue outline-none transition-all text-white placeholder:text-slate-600 pr-16 disabled:opacity-50"
            />
            <div className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">XLM</div>
          </div>
        </div>

        <button 
          type="submit"
          disabled={isSending || !recipient || !amount}
          className="w-full py-4 bg-stellar-blue hover:bg-stellar-blue/90 text-white rounded-2xl font-bold text-lg shadow-lg shadow-stellar-blue/20 transition-all active:scale-[0.98] mt-4 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isSending && (
            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
          {isSending ? 'Sending...' : 'Transfer Funds'}
        </button>
      </form>
    </div>
  );
};

export default SendXLMForm;
