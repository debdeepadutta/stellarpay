import React from 'react';
import { useNavigate } from 'react-router-dom';

const Landing = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center space-y-12 px-6">
      <div className="text-center space-y-4">
        <h1 className="text-5xl md:text-7xl font-black text-white italic tracking-tighter">
          Stellar <span className="text-indigo-500">Philanthropy</span>
        </h1>
        <p className="text-slate-500 max-w-xl mx-auto">
          A decentralized donation ecosystem powered by Soroban smart contracts. 
          Transparent, secure, and globally accessible.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
        {/* Admin Card */}
        <div 
          onClick={() => navigate('/admin')}
          className="group relative p-1 rounded-[40px] bg-gradient-to-br from-indigo-500/20 to-transparent hover:from-indigo-500 transition-all cursor-pointer overflow-hidden shadow-2xl"
        >
          <div className="bg-slate-900 rounded-[39px] p-12 h-full flex flex-col items-center text-center space-y-6">
            <div className="w-20 h-20 bg-indigo-500/10 rounded-3xl flex items-center justify-center text-4xl group-hover:scale-110 transition-transform">
              🏛️
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white mb-2">Campaign Admin</h3>
              <p className="text-slate-500 text-sm">Launch, manage, and monitor your charitable initiatives on-chain.</p>
            </div>
            <div className="pt-4">
              <span className="px-6 py-2 bg-indigo-500/10 text-indigo-400 rounded-full text-xs font-bold uppercase tracking-widest group-hover:bg-indigo-500 group-hover:text-white transition-all">
                Enter Terminal
              </span>
            </div>
          </div>
        </div>

        {/* Donor Card */}
        <div 
          onClick={() => navigate('/donor')}
          className="group relative p-1 rounded-[40px] bg-gradient-to-br from-emerald-500/20 to-transparent hover:from-emerald-500 transition-all cursor-pointer overflow-hidden shadow-2xl"
        >
          <div className="bg-slate-900 rounded-[39px] p-12 h-full flex flex-col items-center text-center space-y-6">
            <div className="w-20 h-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center text-4xl group-hover:scale-110 transition-transform">
              💙
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white mb-2">Philanthropist</h3>
              <p className="text-slate-500 text-sm">Discover verified causes and contribute directly via Stellar.</p>
            </div>
            <div className="pt-4">
              <span className="px-6 py-2 bg-emerald-500/10 text-emerald-400 rounded-full text-xs font-bold uppercase tracking-widest group-hover:bg-emerald-500 group-hover:text-white transition-all">
                View Marketplace
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Landing;
