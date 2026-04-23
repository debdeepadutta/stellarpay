import React from 'react';

const Navbar = ({ isConnected, onConnect, onDisconnect, address }) => {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 glass">
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 bg-stellar-blue rounded-full flex items-center justify-center shadow-lg shadow-stellar-blue/20">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <span className="text-xl font-bold tracking-tight text-white hidden sm:block">Stellar<span className="text-stellar-blue">Pay</span></span>
      </div>

      <div className="flex items-center gap-4">
        {isConnected ? (
          <div className="flex items-center gap-3">
            <div className="hidden md:block text-right">
              <p className="text-xs text-slate-400 font-medium">Connected Address</p>
              <p className="text-sm text-slate-200 font-mono">
                {typeof address === 'string' 
                  ? `${address.slice(0, 6)}...${address.slice(-4)}` 
                  : 'Connected'}
              </p>
            </div>
            <button 
              onClick={onDisconnect}
              className="px-5 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl font-semibold transition-all border border-red-500/20 active:scale-95"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button 
            onClick={onConnect}
            className="px-6 py-2.5 bg-stellar-blue hover:bg-stellar-blue/90 text-white rounded-xl font-semibold transition-all shadow-lg shadow-stellar-blue/20 active:scale-95 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Connect Wallet
          </button>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
