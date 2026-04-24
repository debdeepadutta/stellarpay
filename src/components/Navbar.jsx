import React from 'react';

const Navbar = ({ isConnected, onConnect, onDisconnect, address, walletName }) => {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 glass">
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 bg-stellar-blue rounded-full flex items-center justify-center shadow-lg shadow-stellar-blue/20">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </div>
        <span className="text-lg sm:text-xl font-bold tracking-tight text-white hidden xs:block">Stellar<span className="text-stellar-blue">Philanthropy</span></span>
      </div>

      <div className="flex items-center gap-4">
        {isConnected ? (
          <div className="flex items-center gap-3">
            <div className="hidden md:block text-right border-r border-white/10 pr-3 mr-1">
              <p className="text-[10px] text-stellar-blue font-bold uppercase tracking-widest">{walletName || 'Connected'}</p>
              <p className="text-sm text-slate-200 font-mono">
                {typeof address === 'string' 
                  ? `${address.slice(0, 4)}...${address.slice(-4)}` 
                  : 'Active'}
              </p>
            </div>
            <button 
              onClick={onConnect}
              className="px-3 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-xs font-semibold transition-all"
            >
              Switch
            </button>
            <button 
              onClick={onDisconnect}
              className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg text-xs font-bold transition-all border border-red-500/20"
            >
              Exit
            </button>
          </div>
        ) : (
          <button 
            onClick={onConnect}
            className="px-4 sm:px-6 py-2 sm:py-2.5 bg-stellar-blue hover:bg-stellar-blue/90 text-white rounded-xl font-semibold transition-all shadow-lg shadow-stellar-blue/20 active:scale-95 flex items-center gap-2 text-sm sm:text-base"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="hidden xs:inline">Connect Wallet</span>
            <span className="xs:hidden">Connect</span>
          </button>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
