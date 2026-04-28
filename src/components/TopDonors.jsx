import React from 'react';

const TopDonors = ({ donors, isFetching }) => {
  return (
    <div className="p-6 rounded-3xl glass border border-white/10 card-gradient space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-bold text-lg">Top Donors</h3>
        <div className="p-2 bg-amber-500/10 rounded-xl text-amber-500">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </div>
      </div>

      {isFetching ? (
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 bg-white/5 rounded-2xl w-full"></div>
          ))}
        </div>
      ) : donors.length > 0 ? (
        <div className="space-y-3">
          {donors.map((d, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5 group hover:border-stellar-blue/30 transition-all">
              <div className="flex items-center gap-3">
                <span className={`w-6 h-6 flex items-center justify-center rounded-lg text-[10px] font-bold ${i === 0 ? 'bg-amber-500/20 text-amber-500' : 'bg-slate-800 text-slate-400'}`}>
                  {i + 1}
                </span>
                <span className="text-xs text-slate-300 font-mono">
                  {d.donor.slice(0, 6)}...{d.donor.slice(-4)}
                </span>
              </div>
              <span className="text-sm font-bold text-white">{d.amount} <span className="text-[10px] text-slate-500">XLM</span></span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-center text-slate-500 text-sm py-4">No donors yet</p>
      )}
    </div>
  );
};

export default TopDonors;
