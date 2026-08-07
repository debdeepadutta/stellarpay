import React, { useState, useEffect, useCallback } from 'react';
import {
  Networks,
  TransactionBuilder,
  Operation,
  Account,
  rpc,
  scValToNative,
} from '@stellar/stellar-sdk';

const RPC_URL = 'https://soroban-testnet.stellar.org';

async function simulateRead(contractId, fn, args) {
  if (!contractId) return null;
  try {
    const rpcServer = new rpc.Server(RPC_URL);
    const builder = new TransactionBuilder(
      new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '0'),
      { fee: '100', networkPassphrase: Networks.TESTNET }
    );
    const tx = builder
      .addOperation(Operation.invokeContractFunction({ contract: contractId, function: fn, args }))
      .setTimeout(30)
      .build();
    const res = await rpcServer.simulateTransaction(tx);
    if (rpc.Api.isSimulationSuccess(res)) return scValToNative(res.result.retval);
    return null;
  } catch {
    return null;
  }
}

/**
 * ComplianceBanner — queries the logger contract to check if a campaign is flagged for fraud.
 * Displays a prominent warning if flags exist.
 */
export default function ComplianceBanner({ loggerContractId, campaignId }) {
  const [isFlagged, setIsFlagged] = useState(false);
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchFlagStatus = useCallback(async () => {
    if (!loggerContractId || !campaignId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { nativeToScVal } = await import('@stellar/stellar-sdk');
      const campaignSym = nativeToScVal(campaignId, { type: 'symbol' });
      
      const flagged = await simulateRead(loggerContractId, 'is_flagged', [campaignSym]);
      setIsFlagged(!!flagged);

      if (flagged) {
        const flagList = await simulateRead(loggerContractId, 'get_campaign_flags', [campaignSym]);
        if (flagList) {
          // Filter unresolved flags
          setFlags(flagList.filter(f => !f.resolved));
        }
      }
    } catch (e) {
      console.warn('Flag fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [loggerContractId, campaignId]);

  useEffect(() => {
    fetchFlagStatus();
  }, [fetchFlagStatus]);

  if (loading || !isFlagged) return null;

  return (
    <div className="relative overflow-hidden rounded-xl border border-red-500/50 bg-red-950/40 p-4 mb-6">
      <div className="absolute inset-0 bg-red-500/10 pointer-events-none animate-pulse" />
      <div className="relative flex items-start gap-4">
        <div className="mt-1">
          <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div>
          <h3 className="text-red-400 font-bold text-lg mb-1">Compliance Warning</h3>
          <p className="text-red-300/80 text-sm mb-2">
            This campaign has been flagged by our automated compliance system or moderators. 
            Proceed with caution.
          </p>
          {flags.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-red-400/70 space-y-1">
              {flags.map((flag, idx) => (
                <li key={idx}>Reason: {flag.reason}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}


// fmt
// fmt