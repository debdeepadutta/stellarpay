# LoggerContract Build & Deploy Instructions

Follow these steps to build and deploy your new `logger_contract` to the Stellar Testnet.

## 1. Build the Contract
Run this command from the root directory:
```bash
stellar contract build
```
Note: Since we created a new directory `logger_contract`, make sure you are in that directory or the root if you set up a workspace. If you just want to build this specific one:
```bash
cd logger_contract
stellar contract build
```

## 2. Deploy to Testnet
Replace `YOUR_IDENTITY` with your Stellar CLI identity name (e.g., `alice`).

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/logger_contract.wasm \
  --source YOUR_IDENTITY \
  --network testnet
```

## 3. Interaction Examples

### Log a Donation
```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source YOUR_IDENTITY \
  --network testnet \
  -- \
  log_donation --amount 50
```

### Get Last Donation
```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source YOUR_IDENTITY \
  --network testnet \
  -- \
  get_last_donation
```
