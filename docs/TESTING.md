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

### 1. Network: Sepolia
Sepolia is usually pre-installed in MetaMask under **Show test networks**. If not, add it manually:

| Field | Value |
|-------|-------|
| Network name | Sepolia |
| RPC URL | `https://eth-sepolia.g.alchemy.com/v2/OzvZxRJgn9vOe3sJZufRm` |
| Chain ID | `11155111` |
| Currency symbol | `ETH` |
| Block explorer | `https://sepolia.etherscan.io` |

### 2. Fund wallets with Sepolia ETH (gas)
Get free Sepolia ETH from a faucet:
- https://sepoliafaucet.com (Alchemy, needs account)
- https://faucet.sepolia.dev (Google Cloud)

| Wallet | Amount needed | Purpose |
|--------|--------------|---------|
| Photographer wallet | ~0.01 ETH | Registration tx |
| Publisher wallet | ~0.01 ETH | Approve + deposit txs |
| Agent wallet | ~0.01 ETH | On-chain payment + dispute txs |

> The agent wallet must have Sepolia ETH or it cannot execute any on-chain actions.

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

This tests the full cooperative flow: photographer registers → publisher deposits escrow and claims domain → agent detects usage → license auto-paid → USDC sent to photographer.

### Step 1 — Photographer registers a photo

1. Connect **Photographer wallet** in MetaMask (must be on Sepolia)
2. Go to http://localhost:3000/register
3. Upload a photo that has **EXIF data** (GPS + timestamp) — a real phone photo works best. Screenshots won't work.
4. The page shows the extracted timestamp, GPS coordinates, and computed image hash
5. Set license prices. Make sure your prices are low enough for the publisher's escrow to cover:
   - **Editorial**: e.g. `1` USDC
   - **Commercial**: e.g. `5` USDC
   - **AI Training**: e.g. `10` USDC (or toggle "Block AI Training")
6. Click **Register Photo** and confirm the MetaMask transaction
7. After confirmation you'll be redirected to the provenance page (`/photo/<hash>`)
8. Verify the tx on [Sepolia Etherscan](https://sepolia.etherscan.io)

> Each photo can only be registered once per contract deployment. If you see "This photo is already registered", use a different photo.

### Step 2 — Publisher deposits escrow and claims domain

1. Switch to **Publisher wallet** in MetaMask
2. Go to http://localhost:3000/publisher
3. Click **Mint 100 USDC** — mints MockUSDC on Sepolia (free, no real money) → confirm tx
4. Deposit enough to cover your highest license price. E.g. if commercial is $5, deposit at least `10`:
   - Enter amount → click **Deposit**
   - Confirm the **Approve** tx (ERC-20 allowance)
   - Confirm the **Deposit** tx
5. **Claim your domain** — this is required for auto-pay to work:
   - Enter the hostname of the URL you'll put in `targets.json` (e.g. `raw.githubusercontent.com`)
   - Click **Claim Domain** → confirm tx
   - Without this step, the agent cannot identify you as the publisher and will go straight to DMCA

### Step 3 — Add the photo URL to agent targets

Edit [agent/targets.json](../agent/targets.json) with the URL where the photo appears:

```json
["https://raw.githubusercontent.com/yourname/repo/branch/photo.jpg"]
```

The URL's hostname must match what you claimed in Step 2. The agent ticks every **60 seconds** and resets this URL on every restart so you can reuse it.

### Step 4 — Restart the agent and watch it run

The agent resets stale detections for your target URLs on startup:

```bash
# In Terminal 2 — Ctrl+C then restart:
npx ts-node src/index.ts
```

Watch Terminal 2. On the first tick you'll see:

```
[index] Reset detections for 1 target(s)
[registry] Syncing PhotoRegistered events from chain...
[registry] Synced 1 new registered photos (up to block XXXXXX)
[crawler] Crawling https://...
[crawler] Found 1 new images on ...
[pipeline] Processing 1 pending detections
[pipeline] editorial (0.XX)
[pipeline] Paid — tx: 0x...
[index] Tick complete
```

If the photo was registered recently (within ~33 hours / 10,000 blocks), registry sync will find it automatically. For older registrations, add `REGISTRY_DEPLOY_BLOCK=<block>` to `.env` (find the block number on Sepolia Etherscan).

### Step 5 — Verify on dashboards

- **Photographer dashboard** (http://localhost:3000/dashboard/photographer): USDC Earned increases, detection count increments
- **Publisher page** (http://localhost:3000/publisher): escrow balance decreases, license appears in Active Licenses table
- Tx links open on [Sepolia Etherscan](https://sepolia.etherscan.io)

---

## Case 2: DMCA Enforcement (No Escrow / No Domain Claim)

This tests the enforcement path: photo detected with no matching publisher escrow → agent files on-chain dispute.

To trigger this, either:
- Use a URL whose domain has **not** been claimed by any publisher wallet, or
- Use a domain that has been claimed but the escrow balance is **less than** the license price

### Steps

1. Complete Step 1 (register a photo as Photographer)
2. Add a URL to `targets.json` whose domain you have **not** claimed as publisher
3. Restart the agent

In the agent terminal:
```
[pipeline] Processing 1 pending detections
[pipeline] editorial (0.XX)
[pipeline] Logged dispute N for detection N
```

On the **Photographer dashboard** (http://localhost:3000/dashboard/photographer):
- Switch to the **Disputes** tab
- The dispute appears with status `OPEN`

### Resolving a dispute

The publisher deposits escrow, claims the domain, then clicks **Retry payment →** on the dispute row. The agent re-processes the payment, and the dispute status becomes `RESOLVED`.

---

## Case 3: Agency Staking

This funds the agent's stake used for enforcement operations.

1. Connect **Agency wallet** in MetaMask (Sepolia)
2. Go to http://localhost:3000/dashboard/agency
3. Mint 100 MockUSDC → confirm tx
4. Enter stake amount (e.g. `50`) → click **Stake** → confirm two txs (approve + stake)
5. Agency Stake balance updates
6. Add photographer wallet addresses to the **Portfolio** section to track their earnings

The agent's cut of each license fee automatically replenishes this stake.

---

## Deployed Contract Addresses (Sepolia)

| Contract | Address |
|----------|---------|
| PhotoRegistry | `0x937995f2752bE2A53C472a67acf9dAFB0491ce34` |
| LicenseEngine | `0xAc9F9eA0e7B3a5BEe9F115c67664089255C33214` |
| EscrowVault | `0xAE5B819bB335CEB44bAd485A144dAA61eEd8E374` |
| DisputeRegistry | `0x393607264C23670248c2917B61a4dc2Ff58F3993` |
| MockUSDC | `0x36ba7ED31b1Aedc2BdAd3fD320C6135a65e980D4` |

Verify any transaction at https://sepolia.etherscan.io

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "This photo is already registered" | Use a different photo — each image can only be registered once |
| Agent logs "Registry sync skipped (RPC limit)" | Harmless — retries next tick |
| Agent logs "Low Agent Gas Balance" | Fund `0x5B2a...406F4` with Sepolia ETH from the faucet |
| Agent logs "Low Agency Stake" | Stake USDC on `/dashboard/agency` |
| Auto-pay not triggering (goes to DMCA) | Publisher must claim the URL's domain on `/publisher` and have enough escrow to cover the license price |
| MetaMask shows wrong network | Switch to Sepolia (chainId 11155111) |
| Photo upload fails to extract EXIF | Use a real phone photo; screenshots have no EXIF data |
| Agent doesn't find registered photo | Photo was registered >10,000 blocks ago — add `REGISTRY_DEPLOY_BLOCK=<block>` to `.env` |
| Frontend stuck compiling | Run with `npm run dev -- --webpack` instead of default Turbopack |
| `localhost:3000` unreachable | Try `http://127.0.0.1:3000` instead |
