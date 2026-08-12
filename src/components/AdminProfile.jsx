import React, { useEffect, useState } from 'react';
import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit';
import * as StellarSdk from '@stellar/stellar-sdk';

/**
 * AdminProfile - displays on-chain reputation stats for a campaign admin.
 *
 * Props:
 *   adminAddress {string}  - Stellar address of the campaign admin
 *   donationContractId {string} - address of the deployed Donation contract
 *   networkPassphrase {string} - Stellar network passphrase
 *   rpcUrl {string}  - Stellar RPC url
 */
export default function AdminProfile({ adminAddress, donationContractId, networkPassphrase, rpcUrl }) {
  const [rep, setRep] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!adminAddress || !donationContractId) {
      setLoading(false);
      return;
    }

    const fetchRep = async () => {
      try {
        const server = new StellarSdk.rpc.Server(rpcUrl);
        const contract = new StellarSdk.Contract(donationContractId);
        const key = StellarSdk.nativeToScVal(adminAddress, { type: 'address' });

        // Call get_logger to find logger address, then call get_admin_reputation on logger
        // Since the reputation is stored in the logger, we call get_admin_reputation directly.
        // However we need the logger contract ID. For simplicity we expose get_admin_reputation
        // from the donation contract or we can call the logger contract if its address is known.
        // Here we call the logger via donation contract's get_logger.

        // Step 1: Get logger address
        const loggerResult = await server.simulateTransaction(
          new StellarSdk.TransactionBuilder(
            await server.getAccount('GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN'),
            { fee: '100', networkPassphrase }
          )
            .addOperation(
              contract.call(
                'get_logger',
              )
            )
            .setTimeout(30)
            .build()
        );

        // Fallback: read from env if simulation not possible without auth
        const loggerAddress = process.env.REACT_APP_LOGGER_CONTRACT_ID ||
          (loggerResult?.result?.retval ? StellarSdk.scValToNative(loggerResult.result.retval) : null);

        if (!loggerAddress) {
          setLoading(false);
          return;
        }

        // Step 2: Call get_admin_reputation on the Logger contract
        const loggerContract = new StellarSdk.Contract(loggerAddress);
        const repResult = await server.simulateTransaction(
          new StellarSdk.TransactionBuilder(
            await server.getAccount('GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN'),
            { fee: '100', networkPassphrase }
          )
            .addOperation(
              loggerContract.call('get_admin_reputation', key)
            )
            .setTimeout(30)
            .build()
        );

        if (repResult?.result?.retval) {
          const raw = StellarSdk.scValToNative(repResult.result.retval);
          setRep({
            campaigns_created: Number(raw.campaigns_created ?? 0),
            total_funds_raised: Number(raw.total_funds_raised ?? 0n),
            total_funds_withdrawn: Number(raw.total_funds_withdrawn ?? 0n),
          });
        }
      } catch (e) {
        console.warn('Admin reputation fetch failed:', e);
      } finally {
        setLoading(false);
      }
    };

    fetchRep();
  }, [adminAddress, donationContractId, networkPassphrase, rpcUrl]);

  const toXLM = (stroops) => (stroops / 10_000_000).toLocaleString('en-US', { maximumFractionDigits: 2 });

  const deliveryRate =
    rep && rep.total_funds_raised > 0
      ? Math.min(100, Math.round((rep.total_funds_withdrawn / rep.total_funds_raised) * 100))
      : 0;

  const trustScore = rep
    ? Math.min(100, rep.campaigns_created * 10 + deliveryRate)
    : 0;

  const trustLabel =
    trustScore >= 80 ? 'Trusted' :
    trustScore >= 50 ? 'Established' :
    trustScore >= 20 ? 'New' : 'Unverified';

  const trustColor =
    trustScore >= 80 ? '#22c55e' :
    trustScore >= 50 ? '#f59e0b' :
    trustScore >= 20 ? '#60a5fa' : '#9ca3af';

  if (loading) {
    return (
      <div className="admin-profile admin-profile--loading">
        <div className="admin-profile__spinner" />
        <span>Loading admin reputation…</span>
      </div>
    );
  }

  if (!rep) return null;

  return (
    <div className="admin-profile">
      <div className="admin-profile__header">
        <div className="admin-profile__avatar">
          {adminAddress.slice(0, 2)}
        </div>
        <div className="admin-profile__identity">
          <p className="admin-profile__label">Campaign Admin</p>
          <p className="admin-profile__address">
            {adminAddress.slice(0, 8)}…{adminAddress.slice(-6)}
          </p>
          <span className="admin-profile__badge" style={{ background: trustColor + '22', color: trustColor, borderColor: trustColor + '55' }}>
            ✦ {trustLabel}
          </span>
        </div>
        <div className="admin-profile__score-ring">
          <svg viewBox="0 0 56 56" width="56" height="56">
            <circle cx="28" cy="28" r="24" fill="none" stroke="#ffffff10" strokeWidth="5" />
            <circle
              cx="28" cy="28" r="24"
              fill="none"
              stroke={trustColor}
              strokeWidth="5"
              strokeDasharray={`${(trustScore / 100) * 150.8} 150.8`}
              strokeLinecap="round"
              transform="rotate(-90 28 28)"
            />
          </svg>
          <span className="admin-profile__score-value" style={{ color: trustColor }}>{trustScore}</span>
        </div>
      </div>

      <div className="admin-profile__stats">
        <div className="admin-profile__stat">
          <span className="admin-profile__stat-icon">📋</span>
          <div>
            <p className="admin-profile__stat-value">{rep.campaigns_created}</p>
            <p className="admin-profile__stat-label">Campaigns Created</p>
          </div>
        </div>
        <div className="admin-profile__stat">
          <span className="admin-profile__stat-icon">💰</span>
          <div>
            <p className="admin-profile__stat-value">{toXLM(rep.total_funds_raised)} XLM</p>
            <p className="admin-profile__stat-label">Total Raised</p>
          </div>
        </div>
        <div className="admin-profile__stat">
          <span className="admin-profile__stat-icon">✅</span>
          <div>
            <p className="admin-profile__stat-value">{toXLM(rep.total_funds_withdrawn)} XLM</p>
            <p className="admin-profile__stat-label">Funds Delivered</p>
          </div>
        </div>
        <div className="admin-profile__stat">
          <span className="admin-profile__stat-icon">📊</span>
          <div>
            <p className="admin-profile__stat-value">{deliveryRate}%</p>
            <p className="admin-profile__stat-label">Delivery Rate</p>
          </div>
        </div>
      </div>

      <div className="admin-profile__delivery-bar">
        <div className="admin-profile__delivery-track">
          <div
            className="admin-profile__delivery-fill"
            style={{ width: `${deliveryRate}%`, background: trustColor }}
          />
        </div>
        <span className="admin-profile__delivery-text">Fund delivery rate</span>
      </div>
    </div>
  );
}


// fmt
// fmt