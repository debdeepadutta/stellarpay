import React from 'react';

const RecentLogs = ({ logs, isFetching }) => {
  return (
    <div className="p-6 rounded-3xl glass border border-white/10 card-gradient space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-bold text-lg">Activity Log</h3>
        <div className="p-2 bg-stellar-blue/10 rounded-xl text-stellar-blue">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      </div>

      <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
        {isFetching ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-16 bg-white/5 rounded-2xl w-full"></div>
            ))}
          </div>
        ) : logs.length > 0 ? (
          logs.slice().reverse().map((log, i) => (
            <div key={i} className="relative pl-6 before:absolute before:left-0 before:top-2 before:bottom-0 before:w-[2px] before:bg-stellar-blue/20">
              <div className="absolute left-[-4px] top-2 w-2 h-2 rounded-full bg-stellar-blue shadow-[0_0_8px_rgba(61,133,246,0.5)]"></div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-300">
                    {log.donor.slice(0, 6)}...{log.donor.slice(-4)}
                  </span>
                  <span className="text-xs font-bold text-stellar-blue">+{log.amount} XLM</span>
                </div>
                <p className="text-[10px] text-slate-500 font-medium">
                  {new Date(Number(log.timestamp) * 1000).toLocaleString()}
                </p>
              </div>
            </div>
          ))
        ) : (
          <p className="text-center text-slate-500 text-sm py-8">No activity yet</p>
        )}
      </div>
    </div>
  );
};

export default RecentLogs;
