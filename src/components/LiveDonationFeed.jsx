import React, { useState, useEffect, useRef } from 'react';

const LiveDonationFeed = ({ contractId }) => {
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState('Disconnected');
  const [retryCount, setRetryCount] = useState(0);
  const scrollRef = useRef(null);

  useEffect(() => {
    let eventSource = null;
    let timeoutId = null;

    const connect = () => {
      setStatus('Connecting...');
      // Horizon SSE URL for account operations
      const url = `https://horizon-testnet.stellar.org/accounts/${contractId}/operations?cursor=now&limit=10`;
      
      eventSource = new EventSource(url);

      eventSource.onopen = () => {
        setStatus('Connected');
        setRetryCount(0);
      };

      eventSource.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          
          // Process the operation
          // We look for 'invoke_host_function' (Soroban) or 'payment' (Classic)
          let amount = "---";
          let from = "Unknown";
          
          if (data.type === 'invoke_host_function') {
            // Parsing Soroban XDR is complex in a feed, so we show it's an invocation
            amount = "Contract Call";
            from = data.source_account;
          } else if (data.type === 'payment') {
            amount = `${data.amount} ${data.asset_code || 'XLM'}`;
            from = data.from;
          }

          const newEvent = {
            id: data.id,
            from: from,
            amount: amount,
            time: new Date().toLocaleTimeString(),
            timestamp: Date.now(),
            type: data.type
          };

          setEvents(prev => [newEvent, ...prev].slice(0, 20));
        } catch (err) {
          console.error("Error parsing event data:", err);
        }
      };

      eventSource.onerror = () => {
        setStatus('Disconnected');
        eventSource.close();
        
        // Exponential backoff for reconnection
        const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
        setRetryCount(prev => prev + 1);
        setStatus(`Reconnecting in ${delay/1000}s...`);
        timeoutId = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      if (eventSource) eventSource.close();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [contractId, retryCount]);

  const truncate = (str) => `${str.slice(0, 4)}...${str.slice(-4)}`;

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
            Horizon Terminal V1.0
          </span>
        </div>
        <div className="flex items-center gap-4 text-[10px]">
          <span className={`${status === 'Connected' ? 'text-green-500' : 'text-amber-500'} font-bold`}>
            {status}
          </span>
          <span className="text-slate-600">TESTNET</span>
        </div>
      </div>

      {/* Feed Area */}
      <div 
        ref={scrollRef}
        className="h-[400px] overflow-y-auto bg-[#0a0a0a] p-2 space-y-1 scrollbar-hide"
      >
        {events.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-700 italic">
            Waiting for network operations...
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
                  <span className="text-[9px] text-slate-700 uppercase">{ev.type.replace(/_/g, ' ')}</span>
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
          <span>TX_STREAM: ACTIVE</span>
          <span>BUFFER_SIZE: {events.length}/20</span>
        </div>
        <div className="flex gap-2">
          <span>CONTRACT: {truncate(contractId)}</span>
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
