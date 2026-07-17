import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Transaction, Keypair, Networks, rpc, TransactionBuilder } from '@stellar/stellar-sdk';

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

    // 3. Fetch latest sequence number for sponsor account
    const sponsorKeypair = Keypair.fromSecret(SPONSOR_SECRET_KEY);
    const horizonServer = new rpc.Server(RPC_URL); // reusing rpc server? No, we need horizon or rpc getAccount
    // Actually, in Soroban RPC, we can use getTransaction or we can load the account via horizon.
    // We can also just use Stellar SDK's native horizon client
    const { Horizon } = await import('@stellar/stellar-sdk');
    const horizonUrl = process.env.VITE_HORIZON_URL || 'https://horizon-testnet.stellar.org';
    const server = new Horizon.Server(horizonUrl);
    
    let sponsorAccount;
    try {
      sponsorAccount = await server.loadAccount(sponsorKeypair.publicKey());
    } catch (e) {
      throw new Error(`Failed to load sponsor account from network: ${e.message}`);
    }

    // 4. Rebuild transaction with correct sequence number
    // We extract operations and sorobanData from the original tx
    const builder = new TransactionBuilder(sponsorAccount, {
      fee: '100000', // Set a safe fee, or copy from tx
      networkPassphrase: NETWORK_PASSPHRASE
    });

    tx.operations.forEach(op => builder.addOperation(op));
    
    let newTx = builder.setTimeout(300).build();
    
    // Copy soroban data if present (for smart wallet auths)
    if (tx.sorobanData) {
      newTx.sorobanData = tx.sorobanData;
    }

    // 5. Sign the rebuilt transaction
    newTx.sign(sponsorKeypair);

    const signedXdr = newTx.toXDR();
    console.log(`[Sponsor] Sponsoring transaction with source ${sponsorKeypair.publicKey()}, seq ${sponsorAccount.sequenceNumber()}`);

    // 6. Submit to Soroban RPC
    console.log(`[Sponsor] Submitting to RPC: ${RPC_URL}`);
    const response = await rpcServer.sendTransaction(newTx);
    
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
