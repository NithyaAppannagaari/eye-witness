# Eye:Witness

[Created for BNB Hack]

An autonomous agent crawls the web, detects unlicensed photo use via perceptual hashing, and triggers on-chain micropayments to the creator's wallet — with zero human involvement.

## How It Works

1. **Register** — Photographer uploads a photo. The app extracts GPS + timestamp from EXIF, computes image + metadata hashes, and stores both on-chain with license prices.
2. **Crawl** — The agent runs every 60 seconds, visiting URLs in `targets.json`, extracting all images, and computing perceptual hashes.
3. **Verify** — On a match, the agent re-extracts EXIF from the found image and recomputes the metadata hash. Must match the on-chain record.
4. **Pay or enforce** — If the hosting publisher has deposited USDC escrow and claimed their domain: payment is automatic. Otherwise: DMCA takedown notice is sent to the hosting provider.

## Architecture

- **Smart contracts** (Ethereum Sepolia): `PhotoRegistry`, `LicenseEngine` (ERC-1155, 85/15 split), `EscrowVault`, `MockUSDC`
- **Agent** (Node.js): Puppeteer crawler → pHash matching → EXIF verification → on-chain payment or DMCA
- **Frontend** (Next.js): Photographer dashboard + publisher escrow flow

## Prerequisites

- Node.js 18+
- MetaMask with Sepolia configured

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd eye-witness
cp .env.example .env
```

### 2. Fill in `.env`

```env
DEPLOYER_PRIVATE_KEY=<deployer wallet private key>
AGENT_PRIVATE_KEY=<agent wallet private key>
AGENT_WALLET_ADDRESS=<agent wallet address>
NEXT_PUBLIC_BASE_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<your-key>
PLATFORM_TREASURY_ADDRESS=<your wallet address>
SENDGRID_API_KEY=<optional, for DMCA emails>
```

### 3. Deploy contracts

```bash
cd contracts
npm install
npx hardhat run scripts/deploy.ts --network sepolia
```

Copy the printed addresses into `.env` and `frontend/.env.local`:

```env
NEXT_PUBLIC_PHOTO_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_LICENSE_ENGINE_ADDRESS=0x...
NEXT_PUBLIC_ESCROW_VAULT_ADDRESS=0x...
NEXT_PUBLIC_USDC_ADDRESS=0x...
```

Optionally set `NEXT_PUBLIC_REGISTRY_DEPLOY_BLOCK` to the block the PhotoRegistry was deployed at — makes the photographer dashboard load faster by not scanning from block 0.

### 4. Run the agent

```bash
cd agent
npm install
npx ts-node src/index.ts
```

Add target URLs to `agent/targets.json`:
```json
["https://example.com/page-with-your-photo"]
```

The agent re-reads this file on every tick — no restart needed.

### 5. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000

## Demo Setup (2 wallets)

**Photographer wallet:**
1. Go to `/register` → upload a phone photo (needs GPS + timestamp EXIF)
2. Set license prices → confirm transaction

**Publisher wallet:**
1. Go to `/publisher` → Mint 100 test USDC → Deposit → Claim Domain
2. The domain must match the hostname in `targets.json`

Then restart the agent — on the next tick it finds the photo, verifies provenance, and auto-pays the photographer.

See [docs/TESTING.md](docs/TESTING.md) for the full walkthrough.

## Smart Contracts (Sepolia)

| Contract | Address |
|----------|---------|
| PhotoRegistry | `0x937995f2752bE2A53C472a67acf9dAFB0491ce34` |
| LicenseEngine | `0xAc9F9eA0e7B3a5BEe9F115c67664089255C33214` |
| EscrowVault | `0xAE5B819bB335CEB44bAd485A144dAA61eEd8E374` |
| MockUSDC | `0x36ba7ED31b1Aedc2BdAd3fD320C6135a65e980D4` |

Verify on [Sepolia Etherscan](https://sepolia.etherscan.io)

## Tech Stack

- Solidity 0.8.24, Hardhat, OpenZeppelin
- Next.js, wagmi v2, viem
- Puppeteer, pHash, exifr
- SQLite, Pino
- SendGrid (DMCA emails, optional)
