# Eye:Witness — End-to-End Testing Guide

## Overview

You need **two MetaMask wallets** on Sepolia: one for the Photographer, one for the Publisher.

| Role | What they do |
|------|-------------|
| **Photographer** | Registers photos, sets license prices, earns USDC |
| **Publisher** | Deposits USDC escrow so the agent can auto-pay licenses |

---

## Prerequisites

### Network: Sepolia

Add Sepolia to MetaMask under **Show test networks**, or manually:

| Field | Value |
|-------|-------|
| Network name | Sepolia |
| RPC URL | `https://eth-sepolia.g.alchemy.com/v2/<your-key>` |
| Chain ID | `11155111` |
| Currency symbol | `ETH` |
| Block explorer | `https://sepolia.etherscan.io` |

### Fund wallets with Sepolia ETH

Get free Sepolia ETH from [sepoliafaucet.com](https://sepoliafaucet.com) or [faucet.sepolia.dev](https://faucet.sepolia.dev).

| Wallet | Amount needed |
|--------|--------------|
| Photographer wallet | ~0.01 ETH |
| Publisher wallet | ~0.01 ETH |
| Agent wallet | ~0.01 ETH (for payment + DMCA txs) |

### Start services (two terminals)

**Terminal 1 — Agent**
```bash
cd agent
npx ts-node src/index.ts
```

**Terminal 2 — Frontend**
```bash
cd frontend
npm run dev
```

Open http://localhost:3000

---

## Case 1: Auto-pay License (Happy Path)

Full flow: photographer registers → publisher deposits escrow and claims domain → agent detects → USDC auto-paid.

### Step 1 — Photographer registers a photo

1. Connect **Photographer wallet** (Sepolia)
2. Go to http://localhost:3000/register
3. Upload a **real phone photo** — must have GPS + timestamp in EXIF. Screenshots won't work.
4. The page shows extracted timestamp, GPS coordinates, and computed image hash
5. Set license prices (e.g. Editorial: `1` USDC, Commercial: `5` USDC)
6. Click **Register Photo** → confirm MetaMask transaction
7. After confirmation you'll land on the provenance page (`/photo/<hash>`)

> Each photo can only be registered once. If you see "already registered", use a different photo.

### Step 2 — Publisher sets up escrow

1. Switch to **Publisher wallet**
2. Go to http://localhost:3000/publisher
3. Click **Mint 100 USDC** → confirm tx (free test USDC)
4. Enter an amount ≥ your highest license price → click **Deposit** → confirm two txs (Approve + Deposit)
5. **Claim your domain** — enter the hostname of the URL you'll put in `targets.json` (e.g. `raw.githubusercontent.com`) → click **Claim Domain** → confirm tx

Without the domain claim, the agent cannot identify you as the publisher and falls back to DMCA.

### Step 3 — Add photo URL to agent targets

Edit `agent/targets.json` with a URL where the photo is hosted:

```json
["https://raw.githubusercontent.com/yourname/repo/branch/photo.jpg"]
```

The hostname must match what you claimed in Step 2. The agent re-reads this file on every tick — no restart needed.

### Step 4 — Watch the agent run

In Terminal 1, wait for the next 60-second tick:

```
[index] Tick at 2026-04-28T...
[registry] Synced 1 new registered photos
[crawler] Found 1 new images on https://raw.githubusercontent.com/...
[pipeline] Processing 1 pending detections
[pipeline] VERIFIED — provenance confirmed
[pipeline] Paid — tx: 0x...
[index] Tick complete
```

### Step 5 — Verify on dashboards

- **Photographer dashboard** (http://localhost:3000/dashboard/photographer): USDC Earned increases, detection count increments. Data persists across page navigations.
- **Publisher page** (http://localhost:3000/publisher): escrow balance decreases, license appears in Active Licenses table

---

## Case 2: DMCA Enforcement (No Escrow)

Tests the enforcement path: photo detected with no matching publisher escrow → agent files DMCA.

1. Complete Step 1 (register a photo)
2. Add a URL to `targets.json` whose domain has **not** been claimed by any publisher
3. Wait for the next agent tick

In Terminal 1:
```
[pipeline] No publisher found for domain — falling back to DMCA
[pipeline] DMCA sent to abuse@cloudflare.com for https://...
```

On the **Photographer dashboard** → **Disputes tab**: the DMCA entry appears with status `DMCA SENT`.

### Resolving a dispute

1. Publisher deposits escrow and claims the domain (Steps 2 above)
2. Click **Retry payment →** on the dispute row in the dashboard
3. On the next agent tick, payment executes automatically and the row disappears from disputes

---

## Deployed Contract Addresses (Sepolia)

| Contract | Address |
|----------|---------|
| PhotoRegistry | `0x937995f2752bE2A53C472a67acf9dAFB0491ce34` |
| LicenseEngine | `0xAc9F9eA0e7B3a5BEe9F115c67664089255C33214` |
| EscrowVault | `0xAE5B819bB335CEB44bAd485A144dAA61eEd8E374` |
| MockUSDC | `0x36ba7ED31b1Aedc2BdAd3fD320C6135a65e980D4` |

Verify any transaction at https://sepolia.etherscan.io

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "This photo is already registered" | Use a different photo |
| Agent logs "Registry sync skipped (RPC limit)" | Harmless — retries next tick |
| Agent logs low gas | Fund the agent wallet with Sepolia ETH |
| Auto-pay not triggering | Publisher must claim the URL's exact hostname and have sufficient escrow |
| Photos missing from dashboard after page reload | Set `NEXT_PUBLIC_REGISTRY_DEPLOY_BLOCK` in `.env.local` to the PhotoRegistry deploy block for faster historical log fetching |
| Photo upload fails to extract EXIF | Use a real phone photo; screenshots have no EXIF data |
| `localhost:3000` unreachable | Try `http://127.0.0.1:3000` |
| Frontend stuck compiling | Run with `npm run dev -- --webpack` |
