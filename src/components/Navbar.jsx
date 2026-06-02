import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import logo from '../assets/logo.png';


const Navbar = ({ address, isConnected, onDisconnect, walletName, onConnect }) => {
  const location = useLocation();
  const isAdminPath = location.pathname.startsWith('/admin');
  const isDonorPath = location.pathname.startsWith('/donor') || location.pathname.startsWith('/campaign');

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 px-6 py-4">
      <div className="max-w-7xl mx-auto flex items-center justify-between bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-2xl px-6 py-3 shadow-2xl shadow-indigo-500/10">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
             <Link 
              to="/"
              className="p-2 hover:bg-white/5 rounded-xl transition-all group"
              title="Return Home"
             >
                <img src={logo} alt="Logo" className="w-10 h-10 object-contain rounded-full bg-white/5 p-1 group-hover:scale-110 transition-transform" />
             </Link>
             <div className="flex flex-col">
                <span className="text-sm font-black text-white tracking-tighter italic leading-none">Stellar<span className="text-indigo-400">Philanthropy</span></span>
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">
                   {isAdminPath ? '🛡️ Admin Console' : isDonorPath ? '🌍 Donor Marketplace' : '🏠 Home'}
                </span>
             </div>
          </div>
        </div>


        <div className="flex items-center gap-4">
          {isConnected ? (
            <div className="flex items-center gap-3">
              <div className="hidden md:flex flex-col items-end pr-3 border-r border-white/10">
                <span className="text-[9px] text-slate-500 font-black uppercase tracking-tighter">{walletName || 'Active'}</span>
                <span className="text-xs font-mono font-medium text-slate-300">
                  {typeof address === 'string' ? `${address.slice(0, 4)}...${address.slice(-4)}` : 'Connected'}
                </span>
              </div>
              <button 
                onClick={onDisconnect}
                className="p-2 text-slate-400 hover:text-rose-400 transition-colors"
                title="Disconnect"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          ) : (
            <button 
              onClick={onConnect}
              className="px-6 py-2 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-indigo-500/20"
            >
              Connect Wallet
            </button>
          )}
        </div>

      </div>
    </nav>
  );
};


export default Navbar;
