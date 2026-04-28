import React, { useState, useEffect, useRef } from 'react';
import { rpc, scValToNative, xdr, Horizon } from "@stellar/stellar-sdk";


const LiveDonationFeed = ({ contractId }) => {
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState('Disconnected');
  const lastLedgerRef = useRef(null);
  const rpcServer = new rpc.Server("https://soroban-testnet.stellar.org");

  const [lastUpdated, setLastUpdated] = useState(Date.now());
  const [backoff, setBackoff] = useState(1000);
  const server = new Horizon.Server("https://horizon-testnet.stellar.org");

  useEffect(() => {
    let closeStream = null;
    let timeoutId = null;

    const connectStream = () => {
      setStatus('🟡 Reconnecting');
      
      try {
        closeStream = server.operations()
          .forAccount(contractId)
          .cursor('now')
          .stream({
            onmessage: (op) => {
              setEvents(prev => {
                const newEvent = {
                  id: op.id,
                  from: op.source_account,
                  amount: op.type === 'invoke_contract' ? 'Contract Call' : (op.amount ? `${op.amount} XLM` : 'Activity'),
                  time: new Date().toLocaleTimeString(),
                  type: op.type.replace(/_/g, ' ')
                };
                // Keep last 50
                return [newEvent, ...prev].slice(0, 50);
              });
              setLastUpdated(Date.now());
              setStatus('🟢 Live');
              setBackoff(1000); // Reset backoff on success
            },
            onerror: (err) => {
              console.error("Stream error:", err);
              setStatus('🔴 Disconnected');
              if (closeStream) closeStream();
              
              // Exponential backoff
              const nextBackoff = Math.min(backoff * 2, 30000);
              setBackoff(nextBackoff);
              timeoutId = setTimeout(connectStream, backoff);
            }
          });
          
        setStatus('🟢 Live');
      } catch (e) {
        setStatus('🔴 Disconnected');
        timeoutId = setTimeout(connectStream, backoff);
      }
    };

    connectStream();

    return () => {
      if (closeStream) closeStream();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [contractId, backoff]);

  // Update "seconds ago" every second
  const [secondsAgo, setSecondsAgo] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdated) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [lastUpdated]);


  const truncate = (str) => {
    if (!str || str.length < 10) return str;
    return `${str.slice(0, 4)}...${str.slice(-4)}`;
  };

  return (
    <div className="w-full bg-black border border-slate-800 rounded-xl overflow-hidden font-mono text-sm shadow-2xl">
      {/* Bloomberg Header */}
      <div className="bg-slate-900 px-4 py-2 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-red-600 rounded-full animate-ping"></span>
            <span className="text-red-500 font-bold tracking-tighter text-xs">LIVE</span>
          </div>
          <span className="text-slate-500 text-[10px] uppercase font-bold tracking-widest border-l border-slate-700 pl-3">
            Soroban Event Stream
          </span>
        </div>
        <div className="flex items-center gap-4 text-[10px]">
          <span className="text-slate-600 uppercase font-bold tracking-tighter">
            {secondsAgo === 0 ? 'Just now' : `${secondsAgo}s ago`}
          </span>
          <span className={`${status.includes('Live') ? 'text-green-500' : 'text-amber-500'} font-bold`}>
            {status}
          </span>
          <span className="text-slate-600">TESTNET</span>
        </div>

      </div>

      {/* Feed Area */}
      <div className="h-[400px] overflow-y-auto bg-[#0a0a0a] p-2 space-y-1 scrollbar-hide">
        {events.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-700 italic text-center px-8">
            {status === 'Connected' ? 'No recent events detected for this contract.' : 'Scanning network history...'}
          </div>
        ) : (
          events.map((ev) => (
            <div 
              key={ev.id}
              className="flex items-center justify-between p-2 hover:bg-slate-900/50 group border-b border-slate-900/30 animate-in slide-in-from-left duration-500"
            >
              <div className="flex items-center gap-4">
                <span className="text-slate-600 text-[10px] w-16">{ev.time}</span>
                <div className="flex flex-col">
                  <span className="text-cyan-400 group-hover:text-cyan-300 transition-colors">
                    {truncate(ev.from)}
                  </span>
                  <span className="text-[9px] text-slate-700 uppercase">{ev.type}</span>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <span className="text-green-500 font-bold">
                  {ev.amount}
                </span>
                <span className="w-1.5 h-1.5 bg-green-500/50 rounded-full group-hover:bg-green-400 animate-pulse transition-colors"></span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer Info */}
      <div className="bg-slate-900/50 px-4 py-1.5 flex items-center justify-between text-[9px] text-slate-600 border-t border-slate-800">
        <div className="flex gap-4">
          <span>SOROBAN_RPC: ACTIVE</span>
          <span>BUFFER: {events.length}/50</span>
        </div>
        <div className="flex gap-2 text-indigo-400 font-bold">
          {truncate(contractId)}
        </div>
      </div>

      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
};

export default LiveDonationFeed;
