import React from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

const DonorMarketplace = ({ campaigns }) => {
  const navigate = useNavigate();

  const copyLink = (e, id) => {
    e.stopPropagation();
    const url = `${window.location.origin}/campaign/${id}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied! Share to get more donors", {
        icon: '🔗',
        style: {
          borderRadius: '10px',
          background: '#1e293b',
          color: '#fff',
          border: '1px solid #334155'
        },
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 space-y-12">
      <div className="text-center space-y-4">
        <h1 className="text-5xl md:text-6xl font-black text-white italic tracking-tighter uppercase">Campaign <span className="text-indigo-500">Marketplace</span></h1>
        <p className="text-slate-500 max-w-2xl mx-auto">Discover and support decentralized initiatives on the Stellar network.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {campaigns.map(c => (
          <div 
            key={c.id} 
            onClick={() => navigate(`/campaign/${c.id}`)}
            className="group bg-slate-900 border border-slate-800 p-8 rounded-[40px] hover:border-indigo-500/50 transition-all cursor-pointer shadow-xl transform hover:-translate-y-2 animate-marketplace-card relative overflow-hidden"
          >
            <div className="flex justify-between items-start mb-6">
              <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-2xl">💙</div>
              <button 
                onClick={(e) => copyLink(e, c.id)}
                className="p-2 bg-white/5 rounded-xl text-slate-500 hover:text-indigo-400 transition-colors"
                title="Copy Share Link"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
              </button>
            </div>
            
            <h3 className="text-2xl font-bold text-white mb-3 group-hover:text-indigo-400 transition-colors">{c.name}</h3>
            <p className="text-slate-500 text-sm mb-8 line-clamp-3 leading-relaxed">{c.description}</p>
            
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <div className="text-xs font-bold text-slate-600 uppercase tracking-widest">Goal</div>
                <div className="text-lg font-bold text-white">{c.goal} <span className="text-[10px] text-slate-500">XLM</span></div>
              </div>
              <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 w-[15%] transition-all duration-1000"></div>
              </div>
              <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                <span>0.00 Donated</span>
                <span className="text-indigo-500">View Details →</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {campaigns.length === 0 && (
        <div className="text-center py-24 bg-slate-900/40 border border-slate-800 border-dashed rounded-[50px]">
          <p className="text-slate-500 italic">The marketplace is quiet... be the first to launch a campaign!</p>
        </div>
      )}
    </div>
  );
};

export default DonorMarketplace;
