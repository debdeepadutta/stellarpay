const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const ADMIN_ADDRESS = "GCYYHFAIGQJEDJVV4R3Z6SFTMVD23HCNPQ3IZTLRDRQ4VT25XLDFTTZH";
const TOKEN_ADDRESS = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"; // Native XLM SAC on Testnet
const NETWORK = "testnet";
const SOURCE_ACCOUNT = "admin";

function runCmd(cmd) {
  console.log(`Running: ${cmd}`);
  try {
    return execSync(cmd, { stdio: 'pipe' }).toString().trim();
  } catch (err) {
    console.error(`Command failed: ${cmd}`);
    console.error(err.stderr ? err.stderr.toString() : err.message);
    process.exit(1);
  }
}

async function main() {
  console.log("=== 1. BUILDING SMART CONTRACTS ===");
  runCmd("cd logger_contract && stellar contract build");
  runCmd("cd vault_contract && stellar contract build");
  runCmd("cd contracts && stellar contract build");

  console.log("\n=== 2. DEPLOYING CONTRACTS ===");
  
  // Deploy Logger
  console.log("Deploying Logger Contract...");
  const loggerId = runCmd(`stellar contract deploy --wasm logger_contract/target/wasm32v1-none/release/logger_contract.wasm --source ${SOURCE_ACCOUNT} --network ${NETWORK}`);
  console.log(`Logger Contract ID: ${loggerId}`);

  // Deploy Vault
  console.log("Deploying Vault Contract...");
  const vaultId = runCmd(`stellar contract deploy --wasm vault_contract/target/wasm32v1-none/release/vault_contract.wasm --source ${SOURCE_ACCOUNT} --network ${NETWORK}`);
  console.log(`Vault Contract ID: ${vaultId}`);

  // Deploy Donation Contract (Registry)
  console.log("Deploying Donation Contract...");
  const donationId = runCmd(`stellar contract deploy --wasm contracts/target/wasm32v1-none/release/donation_contract.wasm --source ${SOURCE_ACCOUNT} --network ${NETWORK}`);
  console.log(`Donation Contract ID: ${donationId}`);

  console.log("\n=== 3. INITIALIZING CONTRACTS ===");

  // Initialize Donation Contract
  console.log("Initializing Donation Contract...");
  const donationInitHash = runCmd(`stellar contract invoke --id ${donationId} --source-account ${SOURCE_ACCOUNT} --network ${NETWORK} -- initialize --admin ${ADMIN_ADDRESS} --token ${TOKEN_ADDRESS} --logger ${loggerId} --vault ${vaultId}`);
  console.log(`Donation Init Tx Hash: ${donationInitHash}`);

  // Initialize Logger Contract
  console.log("Initializing Logger Contract...");
  const loggerInitHash = runCmd(`stellar contract invoke --id ${loggerId} --source-account ${SOURCE_ACCOUNT} --network ${NETWORK} -- initialize --donation_contract ${donationId}`);
  console.log(`Logger Init Tx Hash: ${loggerInitHash}`);

  // Initialize Vault Contract
  console.log("Initializing Vault Contract...");
  const vaultInitHash = runCmd(`stellar contract invoke --id ${vaultId} --source-account ${SOURCE_ACCOUNT} --network ${NETWORK} -- initialize --admin ${ADMIN_ADDRESS} --donation_contract ${donationId} --token ${TOKEN_ADDRESS}`);
  console.log(`Vault Init Tx Hash: ${vaultInitHash}`);

  console.log("\n=== 4. WRITING DEPLOYMENT SUMMARY ===");
  const summaryContent = `--- STELLAR PHILANTHROPY ECOSYSTEM SUMMARY (MULTI-CAMPAIGN REGISTRY) ---

CONTRACT ADDRESSES:
------------------
Donation Contract (Registry): ${donationId}
Logger Contract:             ${loggerId}
Vault Contract:              ${vaultId}

INITIALIZATION PROOF:
--------------------
Logger Init:   ${loggerInitHash}
Vault Init:    ${vaultInitHash}
Donation Init: ${donationInitHash}

Deploy Date: ${new Date().toISOString()}
`;

  const summaryPath = path.join(__dirname, 'contract_deployment_summary.txt');
  fs.writeFileSync(summaryPath, summaryContent);
  console.log(`Deployment summary written to: ${summaryPath}`);
  console.log(summaryContent);
}

main();
