# Eye:Witness

[Created for BNB Hack]

Blockchain photo provenance registry with autonomous DMCA enforcement on BNB Smart Chain.

Photographers register photos on-chain. An AI agent crawls the web, detects unlicensed usage, auto-pays licenses via USDC, and escalates to DMCA takedowns for infringers who won't pay.

## Architecture

- **Smart contracts** (BNB Testnet): PhotoRegistry, LicenseEngine (ERC-1155), EscrowVault, DisputeRegistry, MockUSDC
- **Agent** (Node.js): Puppeteer crawler → pHash matching → Gemini Flash classification → on-chain payment or DMCA
- **Frontend** (Next.js): Photographer dashboard + publisher license flow

## Prerequisites

- Node.js 18+
- Redis (`brew install redis` on Mac)
- MetaMask with BNB Testnet configured
- tBNB in deployer wallet (faucet: https://www.bnbchain.org/en/testnet-faucet)

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd eye-witness
cp .env.example .env
```

### 2. Fill in `.env`

```env
DEPLOYER_PRIVATE_KEY=<your deployer wallet private key>
AGENT_PRIVATE_KEY=<agent wallet private key>
NEXT_PUBLIC_BASE_RPC_URL=https://data-seed-prebsc-1-s1.bnbchain.org:8545
OLLAMA_MODEL=llama3.2
SENDGRID_API_KEY=<optional, for DMCA emails>
PLATFORM_TREASURY_ADDRESS=<your wallet address>
```

### 3. Deploy contracts

```bash
cd contracts
npm install
npx hardhat run scripts/deploy.ts --network bscTestnet
```

Copy the printed contract addresses into `.env`:

```env
NEXT_PUBLIC_PHOTO_REGISTRY_ADDRESS=0x...
NEXT_PUBLIC_USDC_ADDRESS=0x...
NEXT_PUBLIC_LICENSE_ENGINE_ADDRESS=0x...
NEXT_PUBLIC_ESCROW_VAULT_ADDRESS=0x...
NEXT_PUBLIC_DISPUTE_REGISTRY_ADDRESS=0x...
```

Also copy them into `frontend/.env.local` (same variable names).

### 4. Start Redis

```bash
redis-server
```

### 5. Run the agent

```bash
cd agent
npm install
npx ts-node src/index.ts
```

Add URLs to crawl in `agent/targets.json`:
```json
["https://example.com/suspected-infringement"]
```

### 6. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000

## Usage

1. Connect MetaMask to BNB Testnet (chainId 97)
2. Go to `/register` → upload a photo → set license prices → submit
3. Agent automatically crawls `targets.json` every 60 seconds
4. Matches trigger license payments or DMCA escalation
5. View status at `/dashboard/photographer`

## Smart Contracts (BNB Testnet)

| Contract | Address |
|----------|---------|
| PhotoRegistry | `NEXT_PUBLIC_PHOTO_REGISTRY_ADDRESS` |
| LicenseEngine | `NEXT_PUBLIC_LICENSE_ENGINE_ADDRESS` |
| EscrowVault | `NEXT_PUBLIC_ESCROW_VAULT_ADDRESS` |
| DisputeRegistry | `NEXT_PUBLIC_DISPUTE_REGISTRY_ADDRESS` |
| MockUSDC | `NEXT_PUBLIC_USDC_ADDRESS` |

Verify on [BscScan Testnet](https://testnet.bscscan.com)

## Tech Stack

- Solidity 0.8.24, Hardhat, OpenZeppelin
- Next.js, wagmi v2, viem
- Ollama / llama3.2 (use-type classification)
- SQLite, BullMQ, Redis, Pino
- SendGrid (DMCA emails)
