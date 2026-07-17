import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Transaction, Keypair, Networks, rpc } from '@stellar/stellar-sdk';

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
    const tx = new Transaction(txXdr, NETWORK_PASSPHRASE);

    // 2. Validate transaction fee to prevent fee drain attacks (max 0.1 XLM = 1,000,000 stroops)
    const MAX_FEE = 1000000;
    if (parseInt(tx.fee, 10) > MAX_FEE) {
      return res.status(400).json({ 
        error: `Transaction fee (${tx.fee} stroops) exceeds max sponsor allowance of ${MAX_FEE} stroops.` 
      });
    }

    // 3. Sign the transaction with the sponsor keypair
    const sponsorKeypair = Keypair.fromSecret(SPONSOR_SECRET_KEY);
    tx.sign(sponsorKeypair);

    const signedXdr = tx.toXDR();
    console.log(`[Sponsor] Sponsoring transaction with source ${sponsorKeypair.publicKey()}`);

    // 4. Submit to Soroban RPC
    console.log(`[Sponsor] Submitting to RPC: ${RPC_URL}`);
    const response = await rpcServer.sendTransaction(tx);
    
    if (response.status === 'ERROR') {
      console.error('[Sponsor] Submission failed:', response.errorResultXdr || response);
      return res.status(400).json({ 
        error: 'Stellar RPC rejected transaction', 
        details: response.errorResultXdr || response.errorResult || response 
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
