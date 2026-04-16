# Eye:Witness — Full Build Plan

> Verified Photography. Automatic Enforcement. On-Chain Payments.

---

## Overview

Eye:Witness is a three-layer system:
1. **Provenance Registry** — proves a photo is real and timestamped on-chain
2. **Detection Agent** — autonomous crawler that finds unlicensed photo use across the web
3. **Payment + Enforcement** — resolves violations automatically via micropayments or DMCA

**Four actors:** Photographer, Agency, Publisher (cooperative), Unknown Publisher (violator)

**Chain:** Base Sepolia (testnet) → Base Mainnet (production)

**Tech stack:** Solidity + Hardhat, Next.js + RainbowKit, Node.js agent, Puppeteer, pHash, OpenAI, ethers.js, USDC

---

## Developer Assignment

| Phase | Owner | Builds |
|---|---|---|
| Phase 1 | Dev A | `PhotoRegistry.sol` + registration UI + provenance page + photographer dashboard |
| Phase 2 | Dev B | Full detection agent — crawler, pHash, registry query, verification, classifier |
| Phase 3 | Dev A | `LicenseEngine.sol` + `EscrowVault.sol` + agent payment execution + publisher/agency UI |
| Phase 4 | Dev B | `DisputeRegistry.sol` + DMCA automation + event listener + dispute dashboard |
| Phase 5 | Dev A | Security audit + mainnet deploy + agent scaling + reliability |

Each dev works solo for their phase, merges to `main` when their done checklist is complete, and the other dev picks up from there.

---

## Full Project File Structure

```
eye-witness/
│
├── shared/
│   └── encoding.ts                  # Phase 1 — canonical metadataHash encoding, imported by frontend + agent
│
├── contracts/
│   ├── hardhat.config.ts
│   ├── contracts/
│   │   ├── PhotoRegistry.sol        # Phase 1
│   │   ├── LicenseEngine.sol        # Phase 3
│   │   ├── EscrowVault.sol          # Phase 3
│   │   └── DisputeRegistry.sol      # Phase 4
│   ├── scripts/
│   │   └── deploy.ts
│   └── test/
│       ├── PhotoRegistry.test.ts
│       ├── LicenseEngine.test.ts
│       ├── EscrowVault.test.ts
│       └── DisputeRegistry.test.ts
│
├── agent/
│   ├── targets.json                 # Phase 2 — URLs to crawl
│   ├── agent.db                     # Phase 2 — SQLite DB (gitignored)
│   ├── hostingProviders.json        # Phase 4 — DMCA contact lookup table
│   ├── ecosystem.config.js          # Phase 5 — PM2 config
│   └── src/
│       ├── types.ts                 # Phase 2 — DB row shapes + detection status enum
│       ├── index.ts                 # Phase 2 — main loop entry point
│       ├── db.ts                    # Phase 2 — SQLite helpers
│       ├── crawler.ts               # Phase 2 — Puppeteer image extraction
│       ├── hash.ts                  # Phase 2 — pHash + Hamming distance
│       ├── registry.ts              # Phase 2 — on-chain PhotoRegistry query
│       ├── verify.ts                # Phase 2 — EXIF recompute + metadataHash check
│       ├── classifier.ts            # Phase 2 — OpenAI use-type classification
│       ├── payment.ts               # Phase 3 — agent payment execution
│       ├── dmca.ts                  # Phase 4 — DMCA notice generation + SendGrid
│       ├── listener.ts              # Phase 4 — LicenseMinted event watcher
│       ├── producer.ts              # Phase 5 — BullMQ job producer
│       ├── worker.ts                # Phase 5 — BullMQ worker
│       ├── monitor.ts               # Phase 5 — stake + gas balance alerts
│       └── health.ts                # Phase 5 — /health HTTP endpoint
│
├── frontend/
│   ├── _app.tsx                     # Phase 1 — RainbowKit + wagmi config
│   ├── src/abi/
│   │   ├── PhotoRegistry.json       # Phase 1 — generated after deploy
│   │   ├── LicenseEngine.json       # Phase 3 — generated after deploy
│   │   ├── EscrowVault.json         # Phase 3 — generated after deploy
│   │   └── DisputeRegistry.json     # Phase 4 — generated after deploy
│   ├── pages/
│   │   ├── register.tsx             # Phase 1 — photo upload + registration
│   │   ├── photo/[photoHash].tsx    # Phase 1 — public provenance page
│   │   ├── publisher.tsx            # Phase 3 — escrow deposit + license history
│   │   └── dashboard/
│   │       ├── photographer.tsx     # Phase 1 — registrations, detections, payments, disputes
│   │       └── agency.tsx           # Phase 3 — portfolio, stake, ROI
│   ├── components/
│   │   ├── PhotoUpload.tsx          # Phase 1 — file input + EXIF display
│   │   └── LicenseRulesForm.tsx     # Phase 1 — price inputs + AI training toggle
│   ├── hooks/
│   │   └── useRegisterPhoto.ts      # Phase 1 — wagmi writeContract wrapper
│   └── utils/
│       └── hash.ts                  # Phase 1 — SHA-256 image + metadata hashes
│
├── docs/
│   ├── BUILD.md
│   └── eyewitness_spec.docx
│
├── .env.example
├── .env                             # gitignored
└── .gitignore
```

---

## Prerequisites — Set Up Before Writing Any Code

Complete everything in this section before Phase 1 starts. Both devs do this independently on their own machines.

---

### 1. System Installations

```bash
# Node.js 20+ via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 20
nvm use 20
node --version   # should be v20.x.x

npm install -g pnpm
```

```bash
git --version   # if not installed: xcode-select --install
```

**Docker** (Phase 5, Redis):
- Install Docker Desktop from docker.com — confirm `docker --version`

**Python + Slither** (Phase 5, security audit):
```bash
python3 --version   # 3.8+ required
pip3 install slither-analyzer
```

**exiftool** (test helper for stripping EXIF):
```bash
brew install exiftool
```

---

### 2. Wallet Setup

You need four wallets total. Use MetaMask.

| Wallet | Who holds it | Purpose |
|---|---|---|
| **Deployer** | Dev A | Deploys all contracts, pays deployment gas |
| **Agent** | Dev A | Signs all on-chain agent transactions |
| **Photographer** | Dev B | Registers photos during testing |
| **Publisher** | Dev B | Deposits USDC escrow during testing |

Deployer and agent are separate so a compromised agent key cannot redeploy contracts. Dev B holds photographer and publisher separately so you can test the full "payment received" flow without the same wallet on both sides.

**Export private keys:** MetaMask → Settings → Security & Privacy → Reveal Private Key. Store in `.env` only — never commit.

---

### 3. Add Base Sepolia to MetaMask

Both devs use the same public Base Sepolia testnet — you do not need separate testnets.

| Field | Value |
|---|---|
| Network name | Base Sepolia |
| RPC URL | `https://sepolia.base.org` |
| Chain ID | `84532` |
| Currency symbol | ETH |
| Block explorer | `https://sepolia.basescan.org` |

Or search "Base Sepolia" on [chainlist.org](https://chainlist.org) → Add to MetaMask.

---

### 4. Fund Wallets With Testnet ETH

Get Base Sepolia ETH from [faucet.quicknode.com/base/sepolia](https://faucet.quicknode.com/base/sepolia). Aim for 0.1 ETH per wallet; deployer needs ~0.5 ETH. Confirm on [sepolia.basescan.org](https://sepolia.basescan.org).

---

### 5. Get Testnet USDC

1. Go to [faucet.circle.com](https://faucet.circle.com) → select Base Sepolia
2. Request USDC for the publisher and photographer wallets
3. Base Sepolia USDC contract: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

---

### 6. External Accounts (both devs)

**Alchemy:** [alchemy.com](https://alchemy.com) → new app → Base Sepolia → copy HTTPS RPC URL to `NEXT_PUBLIC_BASE_RPC_URL`

**WalletConnect:** [cloud.walletconnect.com](https://cloud.walletconnect.com) → new project → copy Project ID to `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`

**OpenAI:** [platform.openai.com](https://platform.openai.com) → create API key, add $5–10 credits → copy to `OPENAI_API_KEY`

**SendGrid:** [sendgrid.com](https://sendgrid.com) → verify a sender email → create API key → copy to `SENDGRID_API_KEY`. Enable sandbox mode during development so no real emails go out: set `mail_settings.sandbox_mode.enable = true` in your SendGrid client config.

---

### 7. Repo + `.env` Setup (do together)

Create the monorepo structure and commit `.env.example`:

```
NEXT_PUBLIC_BASE_RPC_URL=
NEXT_PUBLIC_PHOTO_REGISTRY_ADDRESS=
NEXT_PUBLIC_LICENSE_ENGINE_ADDRESS=
NEXT_PUBLIC_ESCROW_VAULT_ADDRESS=
NEXT_PUBLIC_DISPUTE_REGISTRY_ADDRESS=
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
DEPLOYER_PRIVATE_KEY=
AGENT_PRIVATE_KEY=
OPENAI_API_KEY=
SENDGRID_API_KEY=
REDIS_URL=
PLATFORM_TREASURY_ADDRESS=
```

Add `.env` to `.gitignore` before the first commit. Each dev copies `.env.example` to `.env` locally and fills in their own keys.

---

### Prerequisites Checklist (both devs)

- [ ] Node.js 20+ installed
- [ ] MetaMask installed, wallets created, seed phrases backed up
- [ ] Base Sepolia added to MetaMask (chain ID 84532)
- [ ] All four wallets funded with testnet ETH, confirmed on Basescan
- [ ] Publisher and photographer wallets funded with testnet USDC
- [ ] Alchemy RPC URL in `.env`
- [ ] WalletConnect Project ID in `.env`
- [ ] OpenAI API key in `.env`
- [ ] SendGrid account with sender verified
- [ ] `.env.example` committed, `.env` gitignored
- [ ] Docker Desktop installed

---

## Phase 1 — Core Registry + Registration UI

**Owner: Dev A**

Dev B is not working during this phase. Dev A merges to `main` when the done checklist is complete, then Dev B picks up Phase 2.

---

### 1.1 Shared encoding utility

Before writing any contract or frontend code, write `shared/encoding.ts` — this file is the single source of truth for how `metadataHash` is encoded. Both the frontend (Phase 1) and the agent verification layer (Phase 2) will import from it.

```ts
export function encodeMetadata(timestamp: string, lat: number, lng: number, wallet: string): Uint8Array {
  return new TextEncoder().encode(`${timestamp}|${lat}|${lng}|${wallet.toLowerCase()}`)
}
```

Commit this first, before anything else.

---

### 1.2 Smart Contract: `PhotoRegistry.sol`

1. Run `npx hardhat init` in `contracts/` — choose "TypeScript project"
2. Install: `npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox @openzeppelin/contracts`
3. Configure `hardhat.config.ts` with Base Sepolia RPC + `DEPLOYER_PRIVATE_KEY` from `.env`
4. Write `contracts/PhotoRegistry.sol`:
   - `struct LicenseRules { uint256 editorialPrice; uint256 commercialPrice; uint256 aiTrainingPrice; bool blockAiTraining; }`
   - `struct Photo { bytes32 metadataHash; address owner; uint256 timestamp; LicenseRules licenseRules; }`
   - `mapping(bytes32 => Photo) public photos` keyed by `photoHash`
   - `mapping(bytes32 => mapping(string => bool)) public licenses` for `checkLicense`
   - `registerPhoto(bytes32 photoHash, bytes32 metadataHash, LicenseRules calldata rules)` — stores record, emits `PhotoRegistered(bytes32 photoHash, address owner, uint256 timestamp)`
   - `getPhoto(bytes32 photoHash)` → Photo struct
   - `checkLicense(bytes32 photoHash, string calldata url)` → bool
   - `getLicenseRules(bytes32 photoHash)` → LicenseRules struct
5. Write `test/PhotoRegistry.test.ts`: register, retrieve, duplicate rejection, `checkLicense` returns false before license, returns true after
6. Write `scripts/deploy.ts` targeting Base Sepolia
7. Deploy — record address in `.env` as `NEXT_PUBLIC_PHOTO_REGISTRY_ADDRESS`
8. Export compiled ABI to `frontend/src/abi/PhotoRegistry.json`

---

### 1.3 Frontend: Registration UI

1. Run `npx create-next-app@latest eyewitness-app --typescript` in `frontend/`
2. Install: `npm install @rainbow-me/rainbowkit wagmi viem exifr`
3. Configure RainbowKit in `_app.tsx` — chain set to `baseSepolia` from `wagmi/chains`
4. Write `components/PhotoUpload.tsx`:
   - `<input type="file" accept="image/*">` — read file as `ArrayBuffer`
   - Run `exifr.parse(buffer)` — extract `GPSLatitude`, `GPSLongitude`, `DateTimeOriginal`
   - Show a GPS map embed (Mapbox static tiles or Google Maps static) and formatted timestamp
   - Show a warning and disable the register button if no EXIF is found
5. Write `utils/hash.ts`:
   - `imageHash`: `crypto.subtle.digest('SHA-256', imageBuffer)` → hex string
   - `metadataHash`: `crypto.subtle.digest('SHA-256', encodeMetadata(timestamp, lat, lng, wallet))` → hex string, using `encodeMetadata` imported from `shared/encoding.ts`
6. Write `components/LicenseRulesForm.tsx`: three price inputs (editorial, commercial, AI training) + checkbox to block AI training
7. Write `hooks/useRegisterPhoto.ts` using wagmi `useWriteContract` — calls `registerPhoto` on the deployed contract
8. On submission: call `registerPhoto`, wait for confirmation, redirect to `/photo/[imageHash]`

---

### 1.4 Provenance Page (`/photo/[photoHash]`)

1. Create `pages/photo/[photoHash].tsx`
2. Call `PhotoRegistry.getPhoto(photoHash)` via `useReadContract`
3. Render: image preview, GPS map embed, human-readable timestamp, owner wallet (attempt ENS via `viem` `getEnsName`), Basescan link to the registration transaction
4. Add a "License this photo" CTA — render as coming soon, wire to escrow deposit in Phase 3

---

### 1.5 Photographer Dashboard (`/dashboard/photographer`)

1. Create `pages/dashboard/photographer.tsx`
2. Use `useAccount` to get connected wallet, query `PhotoRegistered` events filtered by `owner == connectedWallet`
3. Render table: photo thumbnail, registration date, detection count (0 placeholder), payments received (0 placeholder), dispute count (0 placeholder)
4. Stats bar: total photos, total USDC earned (placeholder), open disputes (placeholder)
5. These placeholders will be wired with real data in Phases 2–4

---

### Phase 1 — How to Test

- `npx hardhat test` — all unit tests pass
- Call `registerPhoto` from Hardhat console on Base Sepolia — confirm `PhotoRegistered` event on Basescan
- Register the same hash twice — confirm the contract reverts
- Upload a real JPEG with GPS EXIF — confirm map renders at the correct location and timestamp displays
- Upload an image with no EXIF — confirm warning shows, register button disabled
- Submit a registration with a funded test wallet — confirm tx in MetaMask and on Basescan
- Navigate to `/photo/[hash]` for the registered photo — confirm all fields render with correct data
- Test with an unregistered hash — confirm "not found" state, no crash
- Connect the photographer wallet to `/dashboard/photographer` — confirm the registered photo appears

### Phase 1 — Done Checklist

- [ ] `npx hardhat test` passes
- [ ] `PhotoRegistry` deployed on Base Sepolia, address in `.env`
- [ ] ABI exported to `frontend/src/abi/PhotoRegistry.json`
- [ ] `shared/encoding.ts` committed
- [ ] Real wallet can register a photo end-to-end, tx on Basescan
- [ ] Provenance page renders all fields correctly
- [ ] Photographer dashboard shows registered photos for connected wallet
- [ ] Merged to `main` — Dev B picks up Phase 2

---

## Phase 2 — Detection Agent

**Owner: Dev B**

Dev A is not working during this phase. Dev B pulls `main` (which has the deployed `PhotoRegistry` and `shared/encoding.ts` from Phase 1), builds the entire agent, merges to `main` when done.

---

### 2.1 Project setup

1. Create `agent/` — `npm init -y`, install: `npm install puppeteer sharp exifr ethers better-sqlite3 openai dotenv`
2. Install dev deps: `npm install --save-dev typescript ts-node @types/node`; create `tsconfig.json`
3. Write `agent/src/types.ts` — all shared DB row shapes and status enum:
   ```ts
   export type DetectionStatus =
     | 'pending' | 'no_match' | 'matched' | 'already_licensed'
     | 'verified' | 'unverifiable' | 'classified' | 'blocked_category'

   export interface DetectionRow {
     id: number
     pageUrl: string
     imageUrl: string
     pHash: string
     matchedPhotoHash: string | null
     ownerWallet: string | null
     useType: string | null
     licensePrice: bigint | null
     disputeId: number | null
     status: DetectionStatus
     createdAt: string
   }
   ```

---

### 2.2 SQLite DB (`agent/src/db.ts`)

1. Initialize a `detections` table with the columns from `DetectionRow`
2. Export typed helpers: `insertDetection`, `updateDetection`, `getDetectionByUrl`
3. Add `agent.db` to `.gitignore`

---

### 2.3 Crawler (`agent/src/crawler.ts`)

1. Read target URLs from `agent/targets.json`
2. For each URL, launch Puppeteer, load the page, use `page.evaluate()` to extract all `<img src>` and CSS `background-image` URLs
3. Fetch each image as a binary buffer via Node.js `fetch`
4. Store page HTML in memory alongside the buffer — the classifier needs it later
5. Insert a `DetectionRow` per image with `status = 'pending'`

---

### 2.4 pHash + Hamming distance (`agent/src/hash.ts`)

1. `computePHash(imageBuffer: Buffer): Promise<string>` — use `sharp` to resize to 8×8 grayscale, then `imghash` or `blockhash-core` to produce a 64-bit hex fingerprint
2. `hammingDistance(a: string, b: string): number` — XOR two 64-bit hex strings, count set bits
3. Treat any pair with distance < 10 as a match — this catches resized and lightly cropped versions

---

### 2.5 Registry query (`agent/src/registry.ts`)

1. Initialize an ethers.js read-only `Contract` for `PhotoRegistry` on Base Sepolia (use `NEXT_PUBLIC_PHOTO_REGISTRY_ADDRESS` from `.env`)
2. `queryRegistry(pHash: string): Promise<PhotoRecord | null>` — calls `getPhoto(pHash)`, returns null if not found
3. In the pipeline, for each `'pending'` row: compute pHash, find closest match across all registered hashes using `hammingDistance`. If distance < 10: update row to `status = 'matched'` with `matchedPhotoHash` and `ownerWallet`. If no match: `status = 'no_match'`

---

### 2.6 Second verification layer (`agent/src/verify.ts`)

1. Import `encodeMetadata` from `shared/encoding.ts`
2. `verifyProvenance(imageBuffer: Buffer, onChainMetadataHash: string, ownerWallet: string): Promise<'verified' | 'unverifiable'>`:
   - Run `exifr.parse(imageBuffer)` — extract `DateTimeOriginal`, `GPSLatitude`, `GPSLongitude`
   - Recompute `metadataHash` using `encodeMetadata` (same function as the frontend — guaranteed identical encoding)
   - SHA-256 hash the result, compare to `onChainMetadataHash`
   - Return `'verified'` on match, `'unverifiable'` on mismatch or missing EXIF
3. Also call `PhotoRegistry.checkLicense(photoHash, pageUrl)` — if `true`, set `status = 'already_licensed'` and skip
4. Update DB: `'verified'` or `'unverifiable'`

---

### 2.7 OpenAI classifier (`agent/src/classifier.ts`)

1. Initialize OpenAI client with `OPENAI_API_KEY`
2. `classifyUse(pageHtml: string): Promise<{ useType: 'editorial' | 'commercial' | 'ai_training', confidence: number }>`:
   - Strip `<script>` and `<style>` tags, pass first ~3000 chars to `gpt-4o-mini`
   - System prompt: classify the use type, return `{ useType, confidence }` as JSON
   - On any failure, default to `{ useType: 'editorial', confidence: 0 }`
3. For each `'verified'` row: classify, look up price from `getLicenseRules`, store `useType` and `licensePrice`
4. If `useType` is in photographer's blocked categories: `status = 'blocked_category'` — forced dispute regardless of publisher escrow
5. Otherwise: `status = 'classified'`

---

### 2.8 Main loop (`agent/src/index.ts`)

1. Wire all modules together: crawler → pHash → registry query → verification → classification
2. Wrap in `runLoop()` called on `setInterval` at 60 seconds
3. Add a `targets.json` with 3–5 test URLs

---

### Phase 2 — How to Test

- Run `npx ts-node src/index.ts` with real URLs in `targets.json` — confirm images are fetched and rows insert into SQLite
- Open `agent.db` with `sqlite3 agent.db` — confirm `detections` table has rows with pHash values
- Compute pHash for the same image twice — confirm identical output
- Resize a registered photo slightly, confirm Hamming distance < 10 and `status = 'matched'`
- Run `exiftool -all= image.jpg` to strip EXIF, run through `verifyProvenance` — confirm `'unverifiable'`
- Run the unmodified registered image through `verifyProvenance` — confirm `'verified'`
- Pass HTML from a news article to `classifyUse` — confirm `'editorial'`; from a product page — confirm `'commercial'`
- Confirm all DB status transitions work end-to-end: `pending → matched → verified → classified`

### Phase 2 — Done Checklist

- [ ] Agent loop runs without crashing for 5+ minutes on real URLs
- [ ] pHash is deterministic — same image always produces the same hash
- [ ] Hamming distance matching catches resized/cropped variants (distance < 10)
- [ ] `verifyProvenance` returns `'verified'` for genuine photos, `'unverifiable'` for stripped copies
- [ ] `checkLicense` correctly skips already-licensed images
- [ ] OpenAI classifier returns valid `useType` values
- [ ] All DB status transitions work end-to-end
- [ ] Merged to `main` — Dev A picks up Phase 3

---

## Phase 3 — Payment Layer

**Owner: Dev A**

Dev B is not working during this phase. Dev A pulls `main` (which has the running agent from Phase 2), adds the payment contracts, wires them into the agent loop, and builds the publisher/agency UI.

---

### 3.1 `LicenseEngine.sol`

1. Create `contracts/LicenseEngine.sol`:
   - Inherit `ERC1155` + `AccessControl` from OpenZeppelin
   - Constructor takes: `photographerCut` (basis points), `agentCut`, `platformCut`, `platformTreasury` address, `usdcAddress`
   - Define `AGENT_ROLE = keccak256("AGENT_ROLE")`
   - `mintLicense(bytes32 photoId, address publisher, string calldata useType, uint256 amount, string calldata url)`:
     - Only `AGENT_ROLE`
     - Split USDC: photographer's cut via `IERC20.transfer`, agent's cut to `msg.sender`, platform cut to treasury
     - Mint ERC-1155 token (ID = `uint256(photoId)`) to `publisher`, URI = provenance page URL
     - Emit `LicenseMinted(string url, bytes32 photoId, address publisher, uint256 timestamp)`
2. Write `test/LicenseEngine.test.ts`: correct split amounts, role enforcement, token minted to correct address, event emitted
3. Deploy to Base Sepolia — record address in `.env`

---

### 3.2 `EscrowVault.sol`

1. Create `contracts/EscrowVault.sol`:
   - `mapping(address => uint256) public publisherBalances`
   - `mapping(address => uint256) public agencyStakes`
   - `deposit(uint256 amount)` — `transferFrom` caller, add to `publisherBalances[msg.sender]`; emit `Deposited`
   - `withdraw(uint256 amount)` — reduce balance, transfer USDC back
   - `getBalance(address account)` → uint256
   - `drawPayment(address publisher, uint256 amount, bytes32 photoId, string calldata url)` — only `AGENT_ROLE`; deducts from `publisherBalances[publisher]`, calls `LicenseEngine.mintLicense`
   - `stakeAgency(uint256 amount)` / `withdrawStake(uint256 amount)` for agency stake balances
   - `replenishStake(address agency, uint256 amount)` — only `AGENT_ROLE`; routes agent's fee portion back to agency stake
2. Write `test/EscrowVault.test.ts`: deposit, withdraw, drawPayment reverts on insufficient balance, role enforcement
3. Deploy to Base Sepolia with `LicenseEngine` address as constructor arg
4. Grant agent wallet `AGENT_ROLE` on both `LicenseEngine` and `EscrowVault`
5. Export both ABIs to `frontend/src/abi/`

---

### 3.3 Agent payment execution (`agent/src/payment.ts`)

1. Initialize ethers.js `Wallet` from `AGENT_PRIVATE_KEY`
2. `executePayment(publisherAddress, photoHash, amount, pageUrl): Promise<string>` — calls `EscrowVault.drawPayment`, returns tx hash
3. In `agent/src/index.ts`, extend the loop: for each `'classified'` row:
   - Call `EscrowVault.getBalance(publisherAddress)`
   - If balance ≥ `licensePrice`: call `executePayment`, update `status = 'paid'`, store tx hash
   - If balance < price or publisher unknown: update `status = 'awaiting_enforcement'`

---

### 3.4 Publisher escrow UI (`/publisher`)

1. Create `frontend/pages/publisher.tsx`
2. Two-step USDC flow: `approve(EscrowVaultAddress, amount)` → wait for confirmation → `deposit(amount)` using wagmi `useWriteContract` sequentially
3. Poll `EscrowVault.getBalance(connectedWallet)` every 15 seconds — display balance and estimated licenses remaining (`balance / avgLicensePrice`)
4. Active licenses tab: query `LicenseMinted` events filtered by publisher address — table with photo thumbnail, licensed URL, date, price paid, Basescan link to ERC-1155 token

---

### 3.5 Agency staking UI (`/dashboard/agency`)

1. Create `frontend/pages/dashboard/agency.tsx`
2. Agency creation: add a minimal on-chain `agencies` mapping (extend `PhotoRegistry` or deploy a small `AgencyRegistry`)
3. Portfolio management: add photographer wallets, confirm on-chain
4. USDC approve + `stakeAgency` flow
5. Dashboard stats: query `LicenseMinted` events for portfolio photos, sum fees, display total collected vs. stake + ROI
6. Auto-replenishment display — updates as the agent calls `replenishStake`

---

### 3.6 Update photographer dashboard

Wire up the detection count and payments received columns in `/dashboard/photographer` using real `LicenseMinted` events and the agent's SQLite DB (expose `/api/detections?wallet=` from a minimal Express server on the agent process).

---

### Phase 3 — How to Test

- `npx hardhat test` — all new tests pass
- Approve + deposit test USDC into `EscrowVault` from Hardhat console — confirm `getBalance` returns correct amount
- Call `drawPayment` from agent wallet — confirm USDC splits to photographer/agent/treasury in correct ratios on Basescan
- Confirm ERC-1155 token appears in publisher wallet on Basescan
- Call `drawPayment` from a non-agent wallet — confirm access control revert
- Set publisher balance to 0, trigger payment — confirm row updates to `'awaiting_enforcement'`, no tx sent
- Connect publisher wallet to `/publisher`, deposit USDC, run agent against a test page — confirm balance decreases and license row appears
- Register agency, add photographers, stake USDC — confirm all on-chain and visible in dashboard
- Confirm photographer dashboard shows real detection counts and payment totals

### Phase 3 — Done Checklist

- [ ] `npx hardhat test` passes for all new contracts
- [ ] `LicenseEngine` and `EscrowVault` deployed on Base Sepolia, addresses in `.env`
- [ ] Agent wallet has `AGENT_ROLE` on both contracts
- [ ] Payment split matches configured basis points, confirmed on Basescan
- [ ] ERC-1155 license token minted to publisher on every successful payment
- [ ] Agent correctly routes to `'awaiting_enforcement'` when publisher has no balance
- [ ] Publisher escrow UI: deposit, balance display, license history all work
- [ ] Agency staking UI: create, deposit, portfolio, auto-replenishment all work
- [ ] Photographer dashboard shows real detection counts and payment totals
- [ ] Merged to `main` — Dev B picks up Phase 4

---

## Phase 4 — Enforcement Layer

**Owner: Dev B**

Dev A is not working during this phase. Dev B pulls `main` (which has the full payment layer from Phase 3) and builds the dispute system end-to-end.

---

### 4.1 `DisputeRegistry.sol`

1. Create `contracts/DisputeRegistry.sol`:
   - `struct Dispute { bytes32 photoId; string url; bytes32 evidenceHash; uint256 timestamp; bool resolved; }`
   - `mapping(uint256 => Dispute) public disputes` with auto-incrementing counter
   - `logDispute(bytes32 photoId, string calldata url, bytes32 evidenceHash)` — only `AGENT_ROLE`; emits `DisputeLogged(string url, bytes32 photoId, uint256 timestamp, bytes32 evidenceHash)`
   - `resolveDispute(uint256 disputeId)` — only `AGENT_ROLE`; sets `resolved = true`, emits `DisputeResolved`
   - `getDispute(uint256 disputeId)` → Dispute struct
2. Write `test/DisputeRegistry.test.ts`: log, get, resolve, resolve reverts on already-resolved, role enforcement
3. Deploy to Base Sepolia, grant agent wallet `AGENT_ROLE`
4. Export ABI to `frontend/src/abi/DisputeRegistry.json`

---

### 4.2 DMCA automation (`agent/src/dmca.ts`)

1. Install: `npm install @sendgrid/mail whois` in `agent/`
2. `generateNotice(data: { photographerWallet, photoHash, provenanceUrl, infringingUrl, timestamp }): string` — fills a plain-text DMCA template with all required fields (photographer identity, provenance link, on-chain tx link, infringing URL, timestamp, demand to remove or license)
3. `identifyHost(domain: string): Promise<{ email: string }>` — WHOIS lookup, map registrar to DMCA contact using `hostingProviders.json`. Build out at minimum: AWS, Cloudflare, GoDaddy, Namecheap, Bluehost, SiteGround, HostGator, Squarespace, Wix, Shopify, GitHub Pages, Vercel, Netlify, DigitalOcean, Linode
4. `sendNotice(notice: string, recipient: { email: string }): Promise<void>` — send via SendGrid

---

### 4.3 Agent enforcement routing (extend `agent/src/index.ts`)

For each `'awaiting_enforcement'` and `'blocked_category'` row:
1. Call `generateNotice`, `identifyHost`, and `sendNotice`
2. Compute `evidenceHash = SHA-256(photoHash + pageUrl + timestamp + ownerWallet)`
3. Call `DisputeRegistry.logDispute` on-chain — store returned `disputeId` in DB
4. Update DB: `status = 'dmca_sent'`, store `disputeId` and `dmcaSentAt`

---

### 4.4 Event listener (`agent/src/listener.ts`)

1. Initialize a persistent ethers.js WebSocket provider (`ethers.WebSocketProvider`) on Base Sepolia
2. `licenseEngine.on('LicenseMinted', handler)`:
   - Look up the URL from the event in SQLite — check for a `'dmca_sent'` row
   - If found: call `DisputeRegistry.resolveDispute(disputeId)` on-chain
   - Send a DMCA withdrawal notice to the same host contact (different template — withdrawal, not takedown)
   - Update DB: `status = 'resolved'`, store `resolvedAt`
3. Start the listener in `agent/src/index.ts` alongside the crawler loop — runs concurrently

---

### 4.5 Dispute dashboard (extend `/dashboard/photographer`)

1. Add a "Disputes" tab to the photographer dashboard
2. Query `DisputeLogged` events from `DisputeRegistry` filtered by `photoId` values in the connected wallet's portfolio
3. Cross-reference `DisputeResolved` events to determine current status per dispute
4. Render table: infringing URL, detection date, DMCA status badge (`OPEN` / `DMCA_SENT` / `RESOLVED`), Basescan evidence link
5. "Evidence package" link per row — the Basescan tx for `logDispute`, permanent legal record
6. Poll every 30 seconds so the badge flips to `RESOLVED` without a page reload

---

### Phase 4 — How to Test

- `npx hardhat test` — all `DisputeRegistry` tests pass
- From Hardhat console: call `logDispute` — confirm `DisputeLogged` event on Basescan
- Call `resolveDispute` — confirm `DisputeResolved` and `resolved = true`
- Call `resolveDispute` again — confirm revert
- Run agent against a test page with no publisher escrow — confirm `DisputeLogged` on-chain and `status = 'dmca_sent'` in DB
- Call `generateNotice` with dummy data, print output — confirm all fields populated
- Send notice in SendGrid sandbox mode — confirm 202 response
- `identifyHost` on a domain you control — confirm it returns the correct host entry
- Manually mint a license for a disputed URL from Hardhat console — confirm listener picks it up within 30 seconds, `resolveDispute` called, withdrawal email sent, DB updated to `'resolved'`
- Confirm dispute dashboard shows `DMCA_SENT` for an active dispute and flips to `RESOLVED` after resolution

### Phase 4 — Done Checklist

- [ ] `npx hardhat test` passes for `DisputeRegistry`
- [ ] `DisputeRegistry` deployed on Base Sepolia, agent has `AGENT_ROLE`
- [ ] DMCA notice template populates all required fields correctly
- [ ] Host lookup works for all 15 providers in `hostingProviders.json`
- [ ] SendGrid delivery confirmed in sandbox + real send to a test inbox
- [ ] `DisputeLogged` on Basescan for every enforcement action
- [ ] Event listener detects `LicenseMinted` and triggers `resolveDispute` within 30 seconds
- [ ] DMCA withdrawal email sends automatically on resolution
- [ ] Dispute dashboard shows correct status, updates without reload
- [ ] Merged to `main` — Dev A picks up Phase 5

---

## Phase 5 — Production Hardening

**Owner: Dev A**

Dev B is not working during this phase. Dev A pulls `main` and prepares everything for mainnet.

---

### 5.1 Security audit

1. Run Slither: `slither contracts/ --solc-remaps @openzeppelin=node_modules/@openzeppelin`
2. Fix all high and medium severity findings. Minimum bar before deploying to mainnet:
   - Reentrancy guards on all fund-movement functions in `LicenseEngine` and `EscrowVault`
   - No `tx.origin` usage anywhere
   - Correct access control on every state-changing function
   - No overflow/underflow risks in payment math
3. Manual review checklist: can the agent drain funds beyond its authorization? Can a photographer register a hash they don't own? Are the basis point splits guaranteed to sum to 10000?

---

### 5.2 Mainnet deployment

1. Add Base Mainnet to `hardhat.config.ts`
2. Deploy all four contracts to Base Mainnet in order (see contract deployment order at bottom of this file)
3. Update `.env` with mainnet contract addresses and a mainnet RPC URL (Alchemy — don't use the public endpoint for production)
4. Replace testnet USDC with mainnet USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
5. Verify all contracts on Basescan: `npx hardhat verify --network base <address> <constructorArgs>`
6. Update frontend chain config: replace `baseSepolia` with `base` in RainbowKit/wagmi

---

### 5.3 Agent scaling (BullMQ)

1. Install: `npm install bullmq ioredis` in `agent/`
2. `agent/src/producer.ts`: reads agency portfolios from on-chain, enqueues target URLs as BullMQ jobs on queue `eyewitness:crawl`
3. `agent/src/worker.ts`: `Worker` instance — runs the full pipeline per job (crawl → verify → classify → pay/enforce)
4. Configure 3 parallel workers; per-domain rate limiting via Redis key `ratelimit:{domain}` — 5-second minimum gap between requests to the same domain
5. Retry: `attempts: 3`, `backoff: { type: 'exponential', delay: 2000 }` — failed jobs after 3 attempts go to dead-letter queue `eyewitness:crawl:failed`
6. Replace all `console.log` with Pino structured JSON logging

---

### 5.4 Reliability

1. `agent/src/monitor.ts`: poll `EscrowVault.agencyStakes(agencyWallet)` every 5 minutes — if below `MIN_STAKE_THRESHOLD`, send a SendGrid alert; poll agent wallet ETH balance — alert if below `MIN_GAS_THRESHOLD` (0.005 ETH)
2. `agent/src/health.ts`: minimal Express server returning `{ status: 'ok', queueDepth: N, lastJobAt: ISO }` — 503 if queue is stalled
3. Configure `ethers.FallbackProvider`: Alchemy primary + public Base RPC as fallback
4. `ecosystem.config.js` for PM2: `pm2 start ecosystem.config.js` — auto-restart on crash

---

### 5.5 End-to-end tests on mainnet

Run all four flows with real USDC before calling this done:

**Flow 1 — Photographer:** register a real photo → confirm provenance page and Basescan link

**Flow 2 — Cooperative publisher:** deposit real USDC → host the photo on a test page → run agent → confirm balance decreases, ERC-1155 minted, photographer wallet USDC increases, license appears in publisher dashboard

**Flow 3 — Unknown publisher:** host photo with no escrow → run agent → confirm DMCA sent, `DisputeLogged` on-chain → pay on-chain → confirm listener fires, `RESOLVED`, withdrawal email sent

**Flow 4 — Agency:** stake USDC, add photographer to portfolio → run Flows 1 and 2 → confirm agency stake auto-replenishes and dashboard ROI updates

**Edge cases:**
- Near-duplicate photo (slightly resized) — agent matches it
- EXIF-stripped copy — `'unverifiable'`, no payment triggered
- Blocked use category with publisher escrow — forced dispute, escrow not drawn

---

### Phase 5 — How to Test

- Slither shows zero high-severity findings before deploying
- All contracts verified on Base Mainnet Basescan — source code publicly visible
- `docker run -p 6379:6379 redis`, start 2 workers, enqueue 20 URLs — all process, check `bull-board`
- Kill one worker mid-job — confirm BullMQ re-queues it automatically
- Hit a URL returning 403 — confirm 3 retries then dead-letter queue, worker does not crash
- Drop agent wallet ETH near zero — confirm alert email fires
- Simulate primary RPC failure (invalid URL) — confirm fallback takes over
- `/health` endpoint returns 200 with correct queue depth
- PM2 restarts agent after a simulated crash (`pm2 logs`)
- All four E2E flows complete with real funds, no errors

### Phase 5 — Done Checklist

- [ ] Slither passes with zero high-severity findings
- [ ] All four contracts verified on Base Mainnet Basescan
- [ ] BullMQ processes 20 URLs without errors, stalled job recovery works
- [ ] Pino structured logging in place
- [ ] PM2 auto-restart confirmed
- [ ] `/health` endpoint returns correct status
- [ ] Alert emails fire for low stake and low gas
- [ ] Fallback RPC confirmed working
- [ ] Frontend on Base Mainnet
- [ ] All four E2E flows complete on mainnet with real USDC
- [ ] All edge cases produce correct outcomes

---

## Contract Deployment Order

1. `PhotoRegistry.sol`
2. `LicenseEngine.sol` (needs treasury address + USDC address)
3. `EscrowVault.sol` (needs LicenseEngine address)
4. `DisputeRegistry.sol` (standalone)
5. Grant agent wallet `AGENT_ROLE` on `LicenseEngine`, `EscrowVault`, and `DisputeRegistry`

---

## Key Dependencies

| Package | Used in | Purpose |
|---|---|---|
| `hardhat` | contracts | Solidity compilation + deployment |
| `@openzeppelin/contracts` | contracts | ERC-1155, AccessControl |
| `ethers` | agent | On-chain reads/writes |
| `better-sqlite3` | agent | Local detections database |
| `puppeteer` | agent | Headless browser crawling |
| `sharp` | agent | Image processing for pHash |
| `imghash` / `blockhash-core` | agent | 64-bit perceptual hash |
| `exifr` | agent + frontend | EXIF extraction |
| `openai` | agent | Use-type classification |
| `@sendgrid/mail` | agent | DMCA email delivery |
| `whois` | agent | Hosting provider identification |
| `bullmq` + `ioredis` | agent | Job queue (Phase 5) |
| `pino` | agent | Structured logging (Phase 5) |
| `pm2` | agent | Process management (Phase 5) |
| `wagmi` + `viem` | frontend | Wallet interaction |
| `@rainbow-me/rainbowkit` | frontend | Wallet connection UI |
| `next` | frontend | Framework |
