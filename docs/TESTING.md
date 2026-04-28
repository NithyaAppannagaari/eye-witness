# Eye:Witness — End-to-End Testing Guide

## Overview

There are three roles to test. You need **at least two MetaMask wallets** (Photographer + Publisher), and optionally a third for Agency.

| Role | What they do |
|------|-------------|
| **Photographer** | Registers photos, sets license prices, earns USDC |
| **Publisher** | Deposits USDC escrow so the agent can auto-pay licenses |
| **Agency** | Stakes USDC to back the agent's enforcement operations |

---

## Prerequisites

### 1. Network: BNB Testnet
Add this to MetaMask if not already there:

| Field | Value |
|-------|-------|
| Network name | BNB Smart Chain Testnet |
| RPC URL | `https://data-seed-prebsc-2-s2.bnbchain.org:8545` |
| Chain ID | `97` |
| Currency symbol | `tBNB` |
| Block explorer | `https://testnet.bscscan.com` |

### 2. Fund wallets with tBNB (gas)
Get free tBNB from the faucet: https://www.bnbchain.org/en/testnet-faucet

- **Photographer wallet** — needs ~0.01 tBNB (one registration tx)
- **Publisher wallet** — needs ~0.01 tBNB (approve + deposit txs)
- **Agent wallet** — needs ~0.01 tBNB to submit on-chain payment/dispute txs

> The agent wallet must have tBNB or it cannot execute any on-chain actions (license payments, dispute filings).

### 3. Start services (three terminals)

**Terminal 1 — Redis** (skip if already running)
```bash
redis-server
```

**Terminal 2 — Agent**
```bash
cd /Users/nithya/blockchain/eye-witness/agent
npx ts-node src/index.ts
```

**Terminal 3 — Frontend**
```bash
cd /Users/nithya/blockchain/eye-witness/frontend
npm run dev -- --webpack
```

Open http://localhost:3000

---

## Case 1: Auto-pay License (Happy Path)

This tests the full cooperative flow: photographer registers → publisher deposits escrow → agent detects usage → license auto-paid → USDC sent to photographer.

### Step 1 — Photographer registers a photo

1. Connect **Photographer wallet** in MetaMask
2. Go to http://localhost:3000/register
3. Upload a photo that has **EXIF data** (GPS + timestamp) — a real phone photo works best
4. The page will show the extracted timestamp, GPS coordinates, and computed image hash
5. Set license prices:
   - **Editorial**: e.g. `0.003` USDC
   - **Commercial**: e.g. `0.01` USDC
   - **AI Training**: e.g. `0.05` USDC (or toggle "Block AI Training")
6. Click **Register Photo** and confirm the MetaMask transaction
7. After confirmation you'll be redirected to the provenance page (`/photo/<hash>`)
8. Verify the tx on [BscScan Testnet](https://testnet.bscscan.com)

### Step 2 — Publisher deposits escrow

1. Switch to **Publisher wallet** in MetaMask
2. Go to http://localhost:3000/publisher
3. Click **Mint 100 USDC** — this mints MockUSDC on testnet (free, no real money)
4. Confirm the MetaMask tx; wallet balance updates to $100.00
5. Enter a deposit amount (e.g. `10`) and click **Deposit**
6. Two MetaMask prompts appear:
   - First: **Approve** USDC spend (ERC-20 allowance)
   - Second: **Deposit** into EscrowVault
7. Confirm both; escrow balance updates to $10.00
8. Optionally: enter your domain (e.g. `mysite.com`) and click **Claim Domain** — this links your wallet to a domain so the agent can identify you as publisher

### Step 3 — Add the photo URL to agent targets

Add the URL where the photo appears (or a direct image URL) to the crawl list:

```bash
# Edit agent/targets.json
nano /Users/nithya/blockchain/eye-witness/agent/targets.json
```

Example:
```json
["https://yoursite.com/article-with-photo"]
```

The agent ticks every **60 seconds**. Watch Terminal 2 for log output.

### Step 4 — Watch the agent process the detection

In the agent terminal you'll see the pipeline progress through stages:

```
[crawler] Crawling https://yoursite.com/article-with-photo
[crawler] Found N new images on ...
[pipeline] Processing 1 pending detections
```

Then on the next tick (or same tick if fast):
```
[pipeline] MATCH — pHash distance=X
[pipeline] Verifying metadata hash on-chain...
[pipeline] VERIFIED — provenance confirmed
[pipeline] Classifying use type...
[pipeline] Classified: editorial
[pipeline] Paying license via escrow...
[pipeline] PAID — tx 0x...
```

### Step 5 — Verify on dashboards

- **Photographer dashboard** (http://localhost:3000/dashboard/photographer): detection count increments, USDC Earned increases
- **Publisher page** (http://localhost:3000/publisher): escrow balance decreases, license appears in Active Licenses table
- Tx hash links to [BscScan](https://testnet.bscscan.com) showing the LicenseMinted event

---

## Case 2: DMCA Enforcement (No Escrow)

This tests the enforcement path: photo detected on a site with no escrow → agent files an on-chain dispute → DMCA email sent (if SendGrid configured).

### Steps

1. Complete **Step 1** above (register a photo as Photographer)
2. **Skip** the publisher escrow deposit — use a site/URL with no associated escrow balance
3. Add the URL to `agent/targets.json`
4. Wait for agent tick

In the agent terminal you'll see:
```
[pipeline] MATCH — pHash distance=X
[pipeline] VERIFIED — provenance confirmed
[pipeline] Classified: commercial
[pipeline] Publisher escrow empty or domain not registered
[pipeline] Filing dispute on-chain...
[pipeline] Dispute filed — disputeId #N
[pipeline] DMCA alert suppressed (SendGrid not configured)
```

On the **Photographer dashboard** (http://localhost:3000/dashboard/photographer):
- Switch to the **Disputes** tab
- The new dispute appears with status `OPEN`
- After DMCA is sent (if SendGrid configured): status updates to `DMCA SENT`

### Resolving a dispute

The publisher resolves by depositing escrow and clicking **Retry payment →** on the dispute row. The agent re-runs the payment, dispute status becomes `RESOLVED`, and DMCA is withdrawn.

---

## Case 3: Agency Staking

This funds the agent's own operating costs (gas + enforcement stake).

1. Connect **Agency wallet** in MetaMask
2. Go to http://localhost:3000/dashboard/agency
3. Mint 100 MockUSDC → confirm tx
4. Enter stake amount (e.g. `50`) → click **Stake** → confirm two txs (approve + stake)
5. Agency Stake balance updates
6. Add photographer wallet addresses to the **Portfolio** section to track their earnings

The agent's 15% cut of each license fee automatically replenishes this stake.

---

## Deployed Contract Addresses (BNB Testnet)

| Contract | Address |
|----------|---------|
| PhotoRegistry | `0x79d8A8c826DA75422cf6805345283Fec7FA2e7d2` |
| LicenseEngine | `0x056AE14b9702621f7CCCd01E9aa05dfb7901187d` |
| EscrowVault | `0x8D4C26733EBA24D5FEf048B25e8BDDB45D0489A0` |
| DisputeRegistry | `0xB894130D01b667dE2d333722a7Ee3471D6b301b5` |
| MockUSDC | `0xA5cbeB74A8c874f9DDdD245097d28E63A566BC5B` |

Verify any transaction at https://testnet.bscscan.com

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Agent logs "Registry sync skipped (RPC limit)" | Harmless — retries next tick |
| Agent logs "Low Agent Gas Balance" | Fund `0x5B2a...406F4` with tBNB from the faucet |
| Agent logs "Low Agency Stake" | Stake USDC on `/dashboard/agency` |
| MetaMask shows wrong network | Switch to BNB Testnet (chainId 97) |
| Photo upload fails to extract EXIF | Use a real phone photo; screenshots have no EXIF |
| Frontend stuck compiling | Run with `npm run dev -- --webpack` instead of default Turbopack |
| `localhost:3000` unreachable | Try `http://127.0.0.1:3000` instead |
