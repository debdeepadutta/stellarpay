import React from 'react';

const TransactionStatus = ({ status, hash, message }) => {
  const [copied, setCopied] = React.useState(false);

  if (!status) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isSuccess = status === 'success';
  const isPending = status === 'pending';
  const isFailure = status === 'failure';

  return (
    <div className={`w-full p-6 rounded-3xl border transition-all duration-500 animate-in fade-in slide-in-from-top-4 ${
      isSuccess ? 'bg-emerald-500/10 border-emerald-500/20 shadow-lg shadow-emerald-500/5' : 
      isPending ? 'bg-stellar-blue/10 border-stellar-blue/20 shadow-lg shadow-stellar-blue/5' :
      'bg-rose-500/10 border-rose-500/20 shadow-lg shadow-rose-500/5'
    }`}>
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 transition-transform ${
          isSuccess ? 'bg-emerald-500/20 text-emerald-500 rotate-0' : 
          isPending ? 'bg-stellar-blue/20 text-stellar-blue' :
          'bg-rose-500/20 text-rose-500'
        }`}>
          {isSuccess && (
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
            </svg>
          )}
          {isPending && (
            <svg className="w-7 h-7 animate-spin" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
          )}
          {isFailure && (
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </div>
        
        <div className="flex-1 min-w-0 pt-0.5">
          <h3 className={`font-bold text-xl tracking-tight transition-colors ${
            isSuccess ? 'text-emerald-400' : 
            isPending ? 'text-stellar-blue' :
            'text-rose-400'
          }`}>
            {isSuccess ? 'Transaction Successful' : 
             isPending ? 'Transaction Pending...' :
             'Action Failed'}
          </h3>
          <p className="text-slate-400 text-sm mt-1 leading-relaxed">
            {message || (isSuccess 
              ? 'Your contribution has been permanently recorded on the Stellar Testnet.' 
              : isPending ? 'Your request is being simulated and submitted to the Soroban network.'
              : 'The smart contract was unable to process your donation. Please check your wallet.')}
          </p>
          
          {hash && (
            <div className="mt-5 pt-4 border-t border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Live Tx Hash</span>
                {copied && <span className="text-[10px] text-emerald-400 font-bold animate-pulse">COPIED TO CLIPBOARD</span>}
              </div>
              <div className="bg-black/40 p-1 rounded-2xl flex items-center gap-2 border border-white/5">
                <code className="text-xs text-slate-400 truncate font-mono flex-1 pl-4">{hash}</code>
                <div className="flex items-center gap-1">
                  <a 
                    href={`https://stellar.expert/explorer/testnet/tx/${hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white p-3 rounded-xl transition-all active:scale-90"
                    title="View on Explorer"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                  <button 
                    onClick={handleCopy}
                    className="bg-white/5 hover:bg-white/10 text-white p-3 rounded-xl transition-all active:scale-90"
                    title="Copy Reference"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TransactionStatus;
