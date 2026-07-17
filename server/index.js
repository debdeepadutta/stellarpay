import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Transaction, Keypair, Networks, Operation, rpc, TransactionBuilder, Horizon, xdr } from '@stellar/stellar-sdk';

// Load environment variables from parent directory if present, otherwise local
dotenv.config({ path: '../.env' });
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const RPC_URL = process.env.VITE_RPC_URL || 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE = process.env.VITE_NETWORK_PASSPHRASE || Networks.TESTNET;
const SPONSOR_SECRET_KEY = process.env.SPONSOR_SECRET_KEY;

if (!SPONSOR_SECRET_KEY) {
  console.warn("WARNING: SPONSOR_SECRET_KEY is not defined in the environment variables!");
}

const rpcServer = new rpc.Server(RPC_URL);

// Relayer endpoint to sponsor transactions
app.post('/api/sponsor-and-submit', async (req, res) => {
  const { txXdr } = req.body;
  
  if (!txXdr) {
    return res.status(400).json({ error: 'Missing txXdr in request body' });
  }

  try {
    if (!SPONSOR_SECRET_KEY) {
      throw new Error('Sponsor secret key is not configured on the server.');
    }

    // 1. Restore the transaction envelope from XDR
    // NOTE: We do NOT check the fee here — the fee in the incoming XDR is just a
    // client-side placeholder (e.g. 10000 stroops). The REAL fee is computed by
    // rpc.assembleTransaction below, after simulation adds the Soroban resource fees.
    // Soroban donation transactions can legitimately require 20M+ stroops.

    // 2. Fetch latest sequence number for sponsor account
    const sponsorKeypair = Keypair.fromSecret(SPONSOR_SECRET_KEY);
    const horizonUrl = process.env.VITE_HORIZON_URL || 'https://horizon-testnet.stellar.org';
    const server = new Horizon.Server(horizonUrl);
    
    let sponsorAccount;
    try {
      sponsorAccount = await server.loadAccount(sponsorKeypair.publicKey());
    } catch (e) {
      throw new Error(`Failed to load sponsor account from network: ${e.message}`);
    }

    // 3. Rebuild transaction with correct sequence number using XDR mutation
    // We parse the raw XDR envelope to bypass the immutable Transaction wrapper
    const envelope = xdr.TransactionEnvelope.fromXDR(txXdr, 'base64');
    const txXdrObj = envelope.v1().tx();
    
    // Override sequence number (MUST increment by 1 for new transactions)
    sponsorAccount.incrementSequenceNumber();
    txXdrObj.seqNum(xdr.SequenceNumber.fromString(sponsorAccount.sequenceNumber()));
    
    // Override timebounds (add 5 minutes from relayer's local time) to prevent txTooLate errors
    const currentUnix = Math.floor(Date.now() / 1000);
    txXdrObj.cond(xdr.Preconditions.precondTime(new xdr.TimeBounds({
      minTime: new xdr.TimePoint(0),
      maxTime: new xdr.TimePoint(currentUnix + 300)
    })));
    
    const newEnvelope = new xdr.TransactionEnvelope.envelopeTypeTx(
      new xdr.TransactionV1Envelope({
        tx: txXdrObj,
        signatures: [] // Clear any existing signatures since we modified the tx
      })
    );

    // 4. Simulate the transaction to populate Soroban data (resource footprints)
    let mutableTx = new Transaction(newEnvelope.toXDR('base64'), NETWORK_PASSPHRASE);
    
    console.log(`[Sponsor] Simulating transaction to fetch Soroban Data footprints...`);
    const simResult = await rpcServer.simulateTransaction(mutableTx);
    
    if (rpc.Api.isSimulationError(simResult)) {
      throw new Error(`Transaction simulation failed: ${simResult.error}`);
    }
    
    // 5. Assemble the final transaction with the simulated data and required fees.
    // assembleTransaction calculates the real Soroban resource fee automatically.
    // For testnet we allow up to 100 XLM (100,000,000 stroops) as a safety ceiling.
    const MAX_SPONSOR_FEE = 100_000_000; // 100 XLM in stroops
    mutableTx = rpc.assembleTransaction(mutableTx, simResult).build();
    
    const assembledFee = parseInt(mutableTx.fee, 10);
    console.log(`[Sponsor] Assembled transaction fee: ${assembledFee} stroops`);
    if (assembledFee > MAX_SPONSOR_FEE) {
      return res.status(400).json({
        error: `Assembled transaction fee (${assembledFee} stroops) exceeds safety limit of ${MAX_SPONSOR_FEE} stroops. Contact support.`
      });
    }

    // 6. Sign the rebuilt transaction
    mutableTx.sign(sponsorKeypair);

    const signedXdr = mutableTx.toXDR();
    console.log(`[Sponsor] Sponsoring transaction with source ${sponsorKeypair.publicKey()}, seq ${sponsorAccount.sequenceNumber()}`);

    // 7. Submit to Soroban RPC
    console.log(`[Sponsor] Submitting to RPC: ${RPC_URL}`);
    const response = await rpcServer.sendTransaction(mutableTx);
    
    if (response.status === 'ERROR') {
      console.error('[Sponsor] Submission failed:', response.errorResultXdr || response);
      return res.status(400).json({ 
        error: 'Stellar RPC rejected transaction', 
        details: response.errorResultXdr || response
      });
    }

    console.log(`[Sponsor] Transaction submitted successfully. Hash: ${response.hash}`);
    return res.json({
      success: true,
      hash: response.hash,
      status: response.status,
      errorResultXdr: response.errorResultXdr
    });

  } catch (error) {
    console.error('[Sponsor] Error processing transaction:', error);
    return res.status(500).json({ 
      error: 'Internal server error while sponsoring transaction', 
      details: error.message || error 
    });
  }
});

// Relayer endpoint to fund new smart wallets with Testnet XLM
app.post('/api/fund-contract', async (req, res) => {
  const { contractId } = req.body;
  
  if (!contractId || contractId.length !== 56 || !contractId.startsWith('C')) {
    return res.status(400).json({ error: 'Invalid Contract ID' });
  }

  try {
    if (!SPONSOR_SECRET_KEY) {
      throw new Error('Sponsor secret key is not configured.');
    }

    const sponsorKeypair = Keypair.fromSecret(SPONSOR_SECRET_KEY);
    const horizonUrl = process.env.VITE_HORIZON_URL || 'https://horizon-testnet.stellar.org';
    const server = new Horizon.Server(horizonUrl);
    
    let sponsorAccount;
    try {
      sponsorAccount = await server.loadAccount(sponsorKeypair.publicKey());
    } catch (e) {
      throw new Error(`Failed to load sponsor account: ${e.message}`);
    }

    // Check if sponsor account needs more XLM (Testnet only)
    const nativeBal = sponsorAccount.balances.find(b => b.asset_type === 'native');
    if (nativeBal && parseFloat(nativeBal.balance) < 2000) {
      console.log('[Sponsor] Relayer balance low, hitting Friendbot...');
      try {
        await fetch(`https://friendbot.stellar.org?addr=${sponsorKeypair.publicKey()}`);
        sponsorAccount = await server.loadAccount(sponsorKeypair.publicKey());
      } catch (fbErr) {
        console.warn('[Sponsor] Friendbot refill failed:', fbErr);
      }
    }

    // Build the transfer transaction
    const builder = new TransactionBuilder(sponsorAccount, { fee: '10000', networkPassphrase: NETWORK_PASSPHRASE });
    const NATIVE_CONTRACT = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
    
    const sdk = await import('@stellar/stellar-sdk');
    const { Address, nativeToScVal } = sdk;
    
    const from = new Address(sponsorKeypair.publicKey()).toScVal();
    const to = new Address(contractId).toScVal();
    const amount = nativeToScVal(10000000000, { type: 'i128' }); // 1000 XLM

    builder.addOperation(Operation.invokeContractFunction({
      contract: NATIVE_CONTRACT,
      function: 'transfer',
      args: [from, to, amount]
    })).setTimeout(120);

    let tx = builder.build();

    console.log(`[Fund] Simulating funding for ${contractId}...`);
    const simResult = await rpcServer.simulateTransaction(tx);
    
    if (rpc.Api.isSimulationError(simResult)) {
      throw new Error(`Transaction simulation failed: ${simResult.error}`);
    }
    
    let prepared = rpc.assembleTransaction(tx, simResult).build();
    prepared.sign(sponsorKeypair);

    console.log(`[Fund] Submitting funding transaction...`);
    const response = await rpcServer.sendTransaction(prepared);
    
    if (response.status === 'ERROR') {
      throw new Error(`Stellar RPC rejected transaction: ${response.errorResultXdr}`);
    }

    console.log(`[Fund] Funded successfully. Hash: ${response.hash}`);
    return res.json({ success: true, hash: response.hash });
  } catch (error) {
    console.error('[Fund] Error funding contract:', error);
    return res.status(500).json({ error: 'Failed to fund contract', details: error.message || error });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', network: NETWORK_PASSPHRASE, rpc: RPC_URL });
});

if (process.env.NODE_ENV !== 'production' || process.env.RUN_LOCAL === 'true') {
  app.listen(PORT, () => {
    console.log(`Sponsorship relayer server running on port ${PORT}`);
  });
}

// Export the app for Vercel Serverless Functions
export default app;
