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

  return (
    <div className={`w-full p-6 rounded-2xl border ${isSuccess ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20'} animate-in fade-in slide-in-from-top-2 duration-300`}>
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${isSuccess ? 'bg-emerald-500/20 text-emerald-500' : 'bg-rose-500/20 text-rose-500'}`}>
          {isSuccess ? (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <h3 className={`font-bold text-lg ${isSuccess ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isSuccess ? 'Transaction Successful' : 'Action Failed'}
          </h3>
          <p className="text-slate-400 text-sm mt-1">
            {message || (isSuccess 
              ? 'Your transfer has been processed and confirmed on the Stellar network.' 
              : 'Something went wrong while processing your transaction.')}
          </p>
          
          {hash && isSuccess && (
            <div className="mt-4 pt-4 border-t border-white/5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-widest">Transaction Hash</p>
                {copied && <span className="text-[10px] bg-emerald-500/20 text-emerald-500 px-2 py-0.5 rounded-full animate-pulse">Copied!</span>}
              </div>
              <div className="bg-black/20 p-3 rounded-lg flex items-center justify-between gap-3 border border-white/5 group">
                <code className="text-xs text-slate-300 truncate font-mono flex-1">{hash}</code>
                <button 
                  onClick={handleCopy}
                  className="text-stellar-blue hover:text-white transition-colors bg-white/5 p-1.5 rounded-md active:scale-90"
                  title="Copy Hash"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TransactionStatus;
