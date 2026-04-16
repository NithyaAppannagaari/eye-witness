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

## Prerequisites — Set Up Before Writing Any Code

Complete everything in this section before Phase 1 starts. Both devs do this independently on their own machines.

---

### 1. System Installations

**Node.js + package manager:**
```bash
# Install Node.js 20+ via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 20
nvm use 20
node --version   # should be v20.x.x

npm install -g pnpm
```

**Git:**
```bash
git --version   # if not installed: xcode-select --install
```

**Docker** (needed in Phase 5 for Redis):
- Download Docker Desktop from docker.com — install and confirm `docker --version` works

**Python + Slither** (needed in Phase 5 for security audit):
```bash
python3 --version   # 3.8+ required
pip3 install slither-analyzer
```

**exiftool** (needed in tests to strip EXIF from images):
```bash
brew install exiftool
```

---

### 2. Wallet Setup

**You need four wallets total, split across both devs. Use MetaMask.**

Install the MetaMask browser extension from metamask.io. Create wallets and back up every seed phrase.

| Wallet | Who holds it | Purpose |
|---|---|---|
| **Deployer** | Dev A | Deploys all contracts, pays deployment gas |
| **Agent** | Dev A | Signs every on-chain agent transaction (payments, disputes) |
| **Photographer** | Dev B | Registers photos via the frontend during testing |
| **Publisher** | Dev B | Deposits USDC escrow during testing |

**Why these are separate:**
- Deployer and agent are separate so a compromised agent key cannot redeploy contracts
- Dev B holds photographer and publisher wallets separately so you can test the full "photographer receives payment from publisher" flow without the same wallet being on both sides
- Each dev holds their own wallets so either dev can run tests independently without coordinating who signs

**To export a private key from MetaMask:** Settings → Security & Privacy → Reveal Private Key. Store in `.env` only — never commit.

---

### 3. Add Base Sepolia to MetaMask

Both devs use the same Base Sepolia public testnet. You do not each need a separate testnet. The only time you'd run a local chain separately is for rapid contract iteration (optional: `npx hardhat node` + `--network localhost`).

Add Base Sepolia to MetaMask manually:

| Field | Value |
|---|---|
| Network name | Base Sepolia |
| RPC URL | `https://sepolia.base.org` |
| Chain ID | `84532` |
| Currency symbol | ETH |
| Block explorer | `https://sepolia.basescan.org` |

Or go to [chainlist.org](https://chainlist.org) and search "Base Sepolia" → click "Add to MetaMask".

---

### 4. Fund Your Wallets With Testnet ETH

All four wallets need Base Sepolia ETH for gas. Get it from:
- [faucet.quicknode.com/base/sepolia](https://faucet.quicknode.com/base/sepolia)
- [coinbase.com/faucets/base-ethereum-goerli-faucet](https://coinbase.com/faucets/base-ethereum-goerli-faucet)

Paste each wallet address, request ETH. Aim for at least 0.1 ETH per wallet; the deployer needs ~0.5 ETH since it pays for contract deployments. Confirm balances on [sepolia.basescan.org](https://sepolia.basescan.org).

If faucets rate-limit you, one dev can send ETH from a funded wallet to the other.

---

### 5. Get Testnet USDC

The payment flows require USDC. On Base Sepolia, use Circle's testnet USDC:

1. Go to [faucet.circle.com](https://faucet.circle.com)
2. Select "Base Sepolia"
3. Request USDC for the **publisher wallet** and the **photographer wallet** (Dev B)
4. Confirm balance on Basescan — Base Sepolia USDC contract: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

---

### 6. Set Up External Accounts

Both devs create all of these accounts:

**Alchemy (RPC provider):**
- Sign up at [alchemy.com](https://alchemy.com)
- Create an app → select "Base Sepolia" → copy the HTTPS RPC URL to `.env` as `NEXT_PUBLIC_BASE_RPC_URL`
- Gives a dedicated endpoint with higher rate limits than the public Base Sepolia URL

**WalletConnect:**
- Sign up at [cloud.walletconnect.com](https://cloud.walletconnect.com)
- Create a project, copy the Project ID to `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`

**OpenAI** (used in Phase 2 for the classifier):
- Sign up at [platform.openai.com](https://platform.openai.com)
- Create an API key, add $5–10 in credits
- Copy to `OPENAI_API_KEY`

**SendGrid** (used in Phase 4 for DMCA emails):
- Sign up at [sendgrid.com](https://sendgrid.com) — free tier is enough for development
- Verify a sender email: Settings → Sender Authentication
- Create an API key: Settings → API Keys → copy to `SENDGRID_API_KEY`
- Enable sandbox mode so no real emails go out during development: set `mail_settings.sandbox_mode.enable = true` in your client config

---

### 7. Repository Structure

Set up the monorepo together before either dev starts coding:

```
eye-witness/
├── contracts/     Hardhat project — Solidity contracts, tests, deploy scripts
├── agent/         Node.js detection agent
├── frontend/      Next.js app
├── docs/
└── .env           Never commit — each dev copies from .env.example
```

Create `.env.example` in the root:
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

Add `.env` to `.gitignore` immediately. Confirm it's ignored before the first commit.

---

### 8. Prerequisites Checklist (Both Devs)

- [ ] Node.js 20+ installed, `node --version` confirms
- [ ] MetaMask installed, wallets created, seed phrases backed up
- [ ] Base Sepolia added to MetaMask (chain ID 84532)
- [ ] All four wallets funded with testnet ETH, confirmed on Basescan
- [ ] Publisher and photographer wallets funded with testnet USDC from Circle faucet
- [ ] Alchemy RPC URL in `.env`
- [ ] WalletConnect Project ID in `.env`
- [ ] OpenAI API key in `.env`
- [ ] SendGrid account with sender verified and sandbox mode ready
- [ ] Monorepo structure created, `.env.example` committed, `.env` gitignored
- [ ] Docker Desktop installed

---

## Developer Split Convention

Both devs work across contracts, agent, and frontend in every phase. The split is by **feature ownership** — each dev owns a full vertical slice (contract + any agent code + any UI) for their assigned features, rather than one dev doing all backend and the other all frontend.

Handoff points where one dev's output is required before the other can continue are marked **→ HANDOFF**.

---

## Phase 1 — Core Registry + Registration UI

### Dev A — `PhotoRegistry.sol` + Hardhat setup + Photographer Dashboard

**What you need to do:**

**Contracts + infrastructure:**
1. Run `npx hardhat init` in `contracts/` — choose "TypeScript project"
2. Install: `npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox @openzeppelin/contracts`
3. Configure `hardhat.config.ts` with Base Sepolia RPC + `DEPLOYER_PRIVATE_KEY` from `.env`
4. Write `contracts/PhotoRegistry.sol`:
   - `struct Photo { bytes32 metadataHash; address owner; uint256 timestamp; LicenseRules licenseRules; }`
   - `struct LicenseRules { uint256 editorialPrice; uint256 commercialPrice; uint256 aiTrainingPrice; bool blockAiTraining; }`
   - `mapping(bytes32 => Photo) public photos` keyed by `photoHash`
   - `mapping(bytes32 => mapping(string => bool)) public licenses` for `checkLicense`
   - `registerPhoto`, `getPhoto`, `checkLicense`, `getLicenseRules` functions
   - Emit `PhotoRegistered(bytes32 photoHash, address owner, uint256 timestamp)` on register
5. Write `test/PhotoRegistry.test.ts`: register, retrieve, duplicate rejection, license check
6. Write `scripts/deploy.ts` — deploy to Base Sepolia
7. Deploy, record address in `.env`
8. **→ HANDOFF to Dev B:** export ABI to `frontend/src/abi/PhotoRegistry.json`, share contract address and the exact `metadataHash` encoding spec (field order, string format, byte encoding) so Dev B's hash computation matches

**Photographer dashboard (`/dashboard/photographer`):**
1. Create `frontend/pages/dashboard/photographer.tsx` — this page is Dev A's to own since it reads on-chain registration data
2. Use wagmi's `useAccount` to get connected wallet
3. Query `PhotoRegistered` events filtered by `owner == connectedWallet`
4. Render table: photo thumbnail, registration date, detection count (0 placeholder), payments received (0 placeholder), dispute count (0 placeholder)
5. Stats bar: total photos, total USDC earned (placeholder), open disputes (placeholder)

**How to test:**
- `npx hardhat test` — all unit tests pass
- From Hardhat console on Base Sepolia, call `registerPhoto` with a dummy hash — confirm `PhotoRegistered` event on Basescan
- Call `getPhoto(hash)` — confirm all fields return correctly
- Register the same hash twice — confirm the contract reverts
- Connect a wallet that has registered photos — confirm dashboard table populates correctly
- Connect a wallet with no photos — confirm empty state (no crash)

---

### Dev B — Next.js setup + Registration UI + Provenance Page

**Depends on:** Dev A's ABI + contract address + metadataHash encoding spec (can mock the contract call until handoff, build the rest in parallel)

**What you need to do:**

**App scaffold:**
1. Run `npx create-next-app@latest eyewitness-app --typescript` in `frontend/`
2. Install: `npm install @rainbow-me/rainbowkit wagmi viem exifr`
3. Configure RainbowKit in `_app.tsx` — set chain to `baseSepolia` from `wagmi/chains`

**Registration UI (`/register`):**
1. Build `components/PhotoUpload.tsx`:
   - `<input type="file" accept="image/*">` — read file as `ArrayBuffer`
   - Run `exifr.parse(buffer)` — extract `GPSLatitude`, `GPSLongitude`, `DateTimeOriginal`
   - Display a GPS map embed (Mapbox static tiles or Google Maps static API) and formatted timestamp
   - Show a warning and disable the register button if no EXIF is found
2. Build `utils/hash.ts` using the encoding spec from Dev A:
   - `imageHash`: `crypto.subtle.digest('SHA-256', imageBuffer)` → hex string
   - `metadataHash`: `crypto.subtle.digest('SHA-256', encode(timestamp + lat + lng + walletAddress))` → hex string, encoded exactly as Dev A specifies
3. Build `components/LicenseRulesForm.tsx`: three price inputs (editorial, commercial, AI training) + checkbox to block AI training
4. On submit: call `registerPhoto` via wagmi `useWriteContract` — on confirmation redirect to `/photo/[imageHash]`

**Provenance page (`/photo/[photoHash]`):**
1. Create `pages/photo/[photoHash].tsx`
2. Call `PhotoRegistry.getPhoto(photoHash)` via `useReadContract`
3. Render: image preview, GPS map, human-readable timestamp, owner wallet (attempt ENS via `viem` `getEnsName`), Basescan tx link
4. Add "License this photo" CTA — stub as coming soon, wire to escrow deposit in Phase 3

**How to test:**
- Upload a real JPEG with GPS EXIF — confirm map renders at correct coordinates and timestamp displays
- Upload an image with no EXIF — confirm warning shows, register button disabled
- Submit a registration with a funded test wallet on Base Sepolia — confirm tx goes through in MetaMask and appears on Basescan
- Navigate to `/photo/[hash]` for a registered photo — confirm all fields render correctly with the right data
- Test with an unregistered hash — confirm "not found" state renders, not a crash

---

### Phase 1 — Done Checklist

- [ ] `npx hardhat test` passes all unit tests (Dev A)
- [ ] `PhotoRegistry` deployed on Base Sepolia, address in `.env` (Dev A)
- [ ] ABI exported to `frontend/src/abi/` and metadataHash encoding spec documented (Dev A)
- [ ] Photographer dashboard shows correct photo list for connected wallet (Dev A)
- [ ] Photo upload extracts EXIF and computes both hashes correctly (Dev B)
- [ ] Real wallet can register a photo end-to-end, tx on Basescan (Dev B)
- [ ] Provenance page renders all fields for a registered photo (Dev B)
- [ ] metadataHash computed identically in frontend and what the contract stores — confirm by registering and checking the stored hash matches what `utils/hash.ts` would produce (both devs verify together)

---

## Phase 2 — Detection Agent

**Runtime:** Node.js long-running process in `agent/`. Runs on a `setInterval` loop — no human trigger.

### Dev A — Agent infrastructure + Crawler + pHash

**What you need to do:**

**Project setup:**
1. Create `agent/` — run `npm init -y`, install: `npm install puppeteer sharp better-sqlite3 ethers dotenv`
2. Initialize TypeScript: `npm install --save-dev typescript ts-node @types/node`, create `tsconfig.json`

**SQLite DB (`agent/src/db.ts`):**
1. Initialize a `detections` table:
   ```
   id, pageUrl, imageUrl, pHash, matchedPhotoHash, ownerWallet,
   useType, licensePrice, disputeId, status, createdAt
   ```
2. Export typed insert/update/query helpers

**Crawler (`agent/src/crawler.ts`):**
1. Read target URLs from `agent/targets.json`
2. For each URL, launch a Puppeteer browser instance, navigate to the page
3. Use `page.evaluate()` to extract all `<img src>` values and CSS `background-image` URLs from the DOM
4. Fetch each image as a binary buffer via Node.js `fetch`
5. Store page HTML in memory for later use by the classifier (Dev B)

**pHash computation (`agent/src/hash.ts`):**
1. Install `imghash` or `blockhash-core`
2. `computePHash(imageBuffer: Buffer): Promise<string>` — resize to 8×8 grayscale via `sharp`, compute 64-bit fingerprint
3. `hammingDistance(a: string, b: string): number` — XOR two 64-bit hex strings, count set bits; distance < 10 = match
4. Insert a DB row per image with `status = 'pending'` and the computed pHash

**Main loop (`agent/src/index.ts`):**
1. `runLoop()` — calls crawler, passes results to registry query (Dev B's module), wraps everything in `setInterval` at 60s

**→ HANDOFF to Dev B:** the DB helpers, `computePHash`, `hammingDistance`, and the image buffer — Dev B's registry query and verification modules consume these

**How to test:**
- Add 2–3 real URLs to `targets.json` — run `npx ts-node src/index.ts` and confirm image URLs are printed and rows insert into SQLite
- Run `computePHash` on the same image twice — confirm identical output both times
- Open `agent.db` with `sqlite3 agent.db` and confirm the `detections` table has rows with correct `pHash` values

---

### Dev B — Registry query + Verification + OpenAI classifier

**Depends on:** Dev A's DB helpers, `computePHash`, `hammingDistance`, and Puppeteer image buffers

**What you need to do:**

**Registry query (`agent/src/registry.ts`):**
1. Install: `npm install ethers` (in `agent/` — same package Dev A already installed)
2. Initialize an ethers.js read-only `Contract` instance pointing to `PhotoRegistry` on Base Sepolia
3. Export `queryRegistry(pHash: string): Promise<PhotoRecord | null>` — calls `getPhoto(pHash)`, returns null if not found
4. In the agent pipeline, for each `'pending'` DB row:
   - Find the closest match in the registry using `hammingDistance` from Dev A's `hash.ts`
   - If distance < 10: update row with `matchedPhotoHash`, `ownerWallet`, `status = 'matched'`
   - If no match: `status = 'no_match'`

**Second verification layer (`agent/src/verify.ts`):**
1. Install: `npm install exifr` in `agent/`
2. `verifyProvenance(imageBuffer: Buffer, onChainMetadataHash: string, ownerWallet: string): Promise<'verified' | 'unverifiable'>`:
   - Run `exifr.parse(imageBuffer)` — extract `DateTimeOriginal`, `GPSLatitude`, `GPSLongitude`
   - Recompute `metadataHash` using the exact same encoding spec Dev A documented in Phase 1 handoff
   - Compare to `onChainMetadataHash` — return `'verified'` on match, `'unverifiable'` on mismatch or missing EXIF
3. Also call `PhotoRegistry.checkLicense(photoHash, pageUrl)` — if `true`, set `status = 'already_licensed'` and skip
4. Update DB: `status = 'verified'` or `status = 'unverifiable'`

**OpenAI classifier (`agent/src/classifier.ts`):**
1. Install: `npm install openai`
2. `classifyUse(pageHtml: string): Promise<{ useType: 'editorial' | 'commercial' | 'ai_training', confidence: number }>`:
   - Strip `<script>` and `<style>` tags from HTML using a regex
   - Pass first ~3000 chars to `gpt-4o-mini` with a structured system prompt
   - Parse JSON response — default to `{ useType: 'editorial', confidence: 0 }` on any failure
3. For each `'verified'` row:
   - Call `classifyUse` with the page HTML stored by the crawler
   - Look up price from `getLicenseRules` via the registry
   - Store `useType` and `licensePrice` in the DB
   - If `useType` is in photographer's blocked categories: `status = 'blocked_category'`
   - Otherwise: `status = 'classified'`

**How to test:**
- Manually insert a row with the pHash of a registered photo and `status = 'pending'` — run the pipeline and confirm it moves to `'matched'`
- Resize a registered photo slightly, recompute its pHash — confirm Hamming distance < 10 and it still matches
- Take a completely unrelated image — confirm distance > 10 and `status = 'no_match'`
- Run `verifyProvenance` with the unmodified registered image — confirm `'verified'`
- Run `exiftool -all= image.jpg` to strip EXIF, run again — confirm `'unverifiable'`
- Pass HTML from a news article to `classifyUse` — confirm `'editorial'`; from a product page — confirm `'commercial'`
- Confirm all DB status transitions: `pending → matched → verified → classified`

---

### Phase 2 — Done Checklist

- [ ] Agent loop runs without crashing for 5+ minutes on real URLs (Dev A)
- [ ] pHash is deterministic — same image always produces the same hash (Dev A)
- [ ] All discovered images are inserted into SQLite with correct pHash (Dev A)
- [ ] Registry query correctly identifies matches and non-matches (Dev B)
- [ ] Hamming distance matching catches resized/cropped variants (Dev B)
- [ ] `verifyProvenance` returns `'verified'` for genuine photos and `'unverifiable'` for EXIF-stripped copies (Dev B)
- [ ] `checkLicense` skips already-licensed images (Dev B)
- [ ] OpenAI classifier returns valid `useType` values, stored in DB (Dev B)
- [ ] All DB status transitions work end-to-end (both devs verify together)

---

## Phase 3 — Payment Layer

### Dev A — `LicenseEngine.sol` + Agent payment execution

**What you need to do:**

**`LicenseEngine.sol`:**
1. Create `contracts/LicenseEngine.sol`:
   - Inherit `ERC1155` + `AccessControl` from OpenZeppelin
   - Constructor: `photographerCut` (basis points), `agentCut`, `platformCut`, `platformTreasury`, `usdcAddress`
   - `AGENT_ROLE = keccak256("AGENT_ROLE")`
   - `mintLicense(bytes32 photoId, address publisher, string calldata useType, uint256 amount, string calldata url)`:
     - Only `AGENT_ROLE`
     - Split USDC: photographer's cut via `IERC20.transfer`, agent's cut to `msg.sender`, platform cut to treasury
     - Mint ERC-1155 token (ID = `uint256(photoId)`) to `publisher`, URI = provenance page URL
     - Emit `LicenseMinted(url, photoId, publisher, block.timestamp)`
2. Write tests: correct split amounts, role enforcement, token minted to correct address, event emitted
3. Deploy to Base Sepolia
4. **→ HANDOFF to Dev B:** export ABI + address so Dev B can wire it into `EscrowVault.sol` and the publisher UI

**Agent payment execution (`agent/src/payment.ts`):**
1. Initialize ethers.js `Wallet` from `AGENT_PRIVATE_KEY` connected to Base Sepolia
2. `executePayment(publisherAddress, photoHash, amount, pageUrl): Promise<string>` — calls `EscrowVault.drawPayment` (Dev B's contract), returns tx hash
3. In the agent loop for each `'classified'` row:
   - Check `EscrowVault.getBalance(publisherAddress)` — if balance ≥ price: call `executePayment`, `status = 'paid'`
   - If balance < price or unknown: `status = 'awaiting_enforcement'`

**How to test:**
- `npx hardhat test` — all `LicenseEngine` tests pass
- Call `mintLicense` from the agent wallet on Hardhat console — confirm USDC splits correctly to photographer/agent/treasury on Basescan
- Confirm ERC-1155 token appears in publisher wallet on Basescan token transfers
- Call `mintLicense` from a non-agent wallet — confirm access control revert
- With zero publisher balance: confirm agent routes to `'awaiting_enforcement'` and sends no transaction

---

### Dev B — `EscrowVault.sol` + Publisher UI + Agency UI

**Depends on:** Dev A's `LicenseEngine` ABI + address (needed as a constructor arg for EscrowVault)

**What you need to do:**

**`EscrowVault.sol`:**
1. Create `contracts/EscrowVault.sol`:
   - `mapping(address => uint256) public publisherBalances`
   - `mapping(address => uint256) public agencyStakes`
   - `deposit(uint256 amount)` — `transferFrom` caller → add to `publisherBalances[msg.sender]`; emit `Deposited`
   - `withdraw(uint256 amount)` — reduce balance, transfer USDC back
   - `getBalance(address account)` → uint256
   - `drawPayment(address publisher, uint256 amount, bytes32 photoId, string calldata url)` — only `AGENT_ROLE`; deduct from `publisherBalances[publisher]`, call `LicenseEngine.mintLicense`
   - `stakeAgency(uint256 amount)` / `withdrawStake(uint256 amount)` for agency stake balances
   - `replenishStake(address agency, uint256 amount)` — only `AGENT_ROLE`; routes agent's fee back to agency stake
2. Write tests: deposit, withdraw, drawPayment reverts on insufficient balance, role enforcement, replenishment
3. Deploy to Base Sepolia with `LicenseEngine` address as constructor arg
4. Grant agent wallet `AGENT_ROLE` on both `EscrowVault` and `LicenseEngine`

**Publisher escrow UI (`/publisher`):**
1. Create `frontend/pages/publisher.tsx`
2. Two-step USDC flow: `approve(EscrowVaultAddress, amount)` → wait for confirm → `deposit(amount)` using wagmi `useWriteContract` sequentially
3. Poll `EscrowVault.getBalance(connectedWallet)` every 15 seconds — display balance and estimated licenses remaining (`balance / avgLicensePrice`)
4. Active licenses tab: query `LicenseMinted` events filtered by publisher address — table with photo thumbnail, licensed URL, date, price paid, Basescan ERC-1155 link

**Agency staking UI (`/dashboard/agency`):**
1. Create `frontend/pages/dashboard/agency.tsx`
2. Agency creation: name + wallet — add a minimal on-chain mapping (extend `PhotoRegistry` with an `agencies` mapping or deploy a tiny `AgencyRegistry`)
3. Portfolio management: add photographer wallet addresses, confirm on-chain
4. USDC approve + `stakeAgency` flow
5. Dashboard stats: query `LicenseMinted` events for portfolio photos, sum fees, display total collected vs. stake, ROI
6. Auto-replenishment display — updates as the agent routes fees back via `replenishStake`

**Update photographer dashboard (hand back to Dev A to wire):**
- Expose a `/api/detections?wallet=` endpoint from the agent's process (add a minimal Express server) so Dev A can wire up detection counts and payment totals on the photographer dashboard

**How to test:**
- `npx hardhat test` — all `EscrowVault` tests pass
- Approve + deposit 5 USDC from a test wallet — confirm `getBalance` returns 5 and the UI updates
- Run the agent against a page with a registered photo — confirm publisher balance decreases and a new row in active licenses
- Click the Basescan ERC-1155 link — confirm it opens the correct token transfer
- Register an agency, add two photographer wallets — confirm on-chain record reflects both
- Stake USDC, trigger a detection — confirm auto-replenishment reflects in the agency dashboard

---

### Phase 3 — Done Checklist

- [ ] `LicenseEngine` deployed on Base Sepolia, tests pass (Dev A)
- [ ] Agent payment execution module routes correctly based on publisher balance (Dev A)
- [ ] Agent wallet has `AGENT_ROLE` on `LicenseEngine` (Dev A)
- [ ] `EscrowVault` deployed on Base Sepolia, tests pass (Dev B)
- [ ] Payment split matches configured basis points exactly — confirmed on Basescan (both devs)
- [ ] ERC-1155 license token minted to publisher on every successful payment (both devs)
- [ ] Publisher escrow UI: deposit, balance display, and license history all work (Dev B)
- [ ] Agency staking UI: create, deposit, portfolio, and auto-replenishment all work (Dev B)
- [ ] Photographer dashboard wired to real detection counts and payment totals (Dev A)

---

## Phase 4 — Enforcement Layer

### Dev A — `DisputeRegistry.sol` + DMCA automation + agent enforcement routing

**What you need to do:**

**`DisputeRegistry.sol`:**
1. Create `contracts/DisputeRegistry.sol`:
   - `struct Dispute { bytes32 photoId; string url; bytes32 evidenceHash; uint256 timestamp; bool resolved; }`
   - `mapping(uint256 => Dispute) public disputes` — auto-incrementing counter
   - `logDispute(bytes32 photoId, string calldata url, bytes32 evidenceHash)` — only `AGENT_ROLE`; emits `DisputeLogged(url, photoId, timestamp, evidenceHash)`
   - `resolveDispute(uint256 disputeId)` — only `AGENT_ROLE`; sets `resolved = true`, emits `DisputeResolved`
   - `getDispute(uint256 disputeId)` → Dispute struct
2. Write tests: log, get, resolve, resolve reverts on already-resolved, role enforcement
3. Deploy to Base Sepolia, grant agent wallet `AGENT_ROLE`
4. **→ HANDOFF to Dev B:** export ABI + address for the dispute dashboard UI

**DMCA automation (`agent/src/dmca.ts`):**
1. `generateNotice(data: { photographerWallet, photoHash, provenanceUrl, infringingUrl, timestamp }): string` — fills a plain-text DMCA template with all required fields
2. `identifyHost(domain: string): Promise<{ email: string }>` — WHOIS lookup with `whois` npm package; map registrar to DMCA contact email using a `hostingProviders.json` lookup table (build out top 20: AWS, Cloudflare, GoDaddy, Namecheap, Bluehost, SiteGround, HostGator, etc.)
3. `sendNotice(notice: string, recipient: { email: string }): Promise<void>` — SendGrid (`@sendgrid/mail`)
4. Install: `npm install @sendgrid/mail whois` in `agent/`

**Agent enforcement routing:**
1. In the agent loop, for each `'awaiting_enforcement'` and `'blocked_category'` row:
   - Generate DMCA notice, identify host, send via SendGrid
   - Compute `evidenceHash = SHA-256(photoHash + pageUrl + timestamp + ownerWallet)`
   - Call `DisputeRegistry.logDispute` on-chain — store returned `disputeId` in DB
   - Update DB: `status = 'dmca_sent'`, store `disputeId` and `dmcaSentAt`

**How to test:**
- `npx hardhat test` — all `DisputeRegistry` tests pass
- From Hardhat console: call `logDispute`, confirm `DisputeLogged` event on Basescan
- Call `resolveDispute`, confirm `DisputeResolved` and `resolved = true` on Basescan
- Call `resolveDispute` again — confirm revert
- Run the agent against a test page with no publisher escrow — confirm `DisputeLogged` on-chain and `status = 'dmca_sent'` in DB
- Call `generateNotice` with dummy data, print output — confirm all fields populated, nothing `undefined`
- Send notice in SendGrid sandbox mode — confirm 202 response

---

### Dev B — Event listener + Dispute dashboard

**Depends on:** Dev A's `DisputeRegistry` ABI + address

**What you need to do:**

**Event listener (`agent/src/listener.ts`):**
1. Initialize a persistent ethers.js WebSocket provider (`ethers.WebSocketProvider`) on Base Sepolia
2. `licenseEngine.on('LicenseMinted', handler)`:
   - In handler: look up URL in SQLite DB — check for a row with `status = 'dmca_sent'` for that URL
   - If found: call `DisputeRegistry.resolveDispute(disputeId)` on-chain
   - Look up the original DMCA recipient from DB and send a withdrawal notice via the same `sendNotice` function Dev A wrote (different template — DMCA withdrawal, not takedown)
   - Update DB: `status = 'resolved'`, store `resolvedAt`
3. Start the listener in `agent/src/index.ts` alongside the crawler loop — they run concurrently

**Dispute dashboard (extend `/dashboard/photographer`):**
1. Add a "Disputes" tab to the existing photographer dashboard
2. Query `DisputeLogged` events from `DisputeRegistry` filtered by `photoId` values in the photographer's portfolio
3. Cross-reference `DisputeResolved` events to determine current status
4. Render table: infringing URL, detection date, DMCA status badge (`OPEN` / `DMCA_SENT` / `RESOLVED`), Basescan evidence link
5. "Evidence package" link per row — the Basescan tx for `logDispute`, the photographer's permanent legal record
6. Poll for status updates every 30 seconds so the badge flips to `RESOLVED` without a page reload

**How to test:**
- Trigger an enforcement flow (agent detects unescrow'd photo) — confirm dispute row appears in dashboard with `DMCA_SENT`
- Manually mint a license for the disputed URL from Hardhat console — confirm listener picks it up within 30 seconds (watch agent logs)
- Confirm `DisputeRegistry.getDispute(id).resolved` is `true` on Basescan
- Confirm withdrawal notice is sent (check SendGrid activity log)
- Confirm dashboard badge flips to `RESOLVED` within the poll interval without a page refresh
- Connect a wallet with no disputes — confirm empty state renders correctly

---

### Phase 4 — Done Checklist

- [ ] `DisputeRegistry` deployed on Base Sepolia, agent has `AGENT_ROLE` (Dev A)
- [ ] DMCA notice populates all required fields (Dev A)
- [ ] Host lookup works for at least top 10 providers (Dev A)
- [ ] SendGrid delivery confirmed in sandbox + a real send to a test inbox (Dev A)
- [ ] `DisputeLogged` on Basescan for every enforcement action (Dev A)
- [ ] Event listener detects `LicenseMinted` and triggers `resolveDispute` within 30 seconds (Dev B)
- [ ] DMCA withdrawal email sends automatically on resolution (Dev B)
- [ ] Dispute dashboard shows correct status for all open and resolved disputes (Dev B)
- [ ] Status badge updates to `RESOLVED` without page reload (Dev B)

---

## Phase 5 — Production Hardening

### Dev A — Security audit + Mainnet deployment + Agent scaling

**What you need to do:**

**Security audit:**
1. Run Slither: `slither contracts/ --solc-remaps @openzeppelin=node_modules/@openzeppelin`
2. Fix all high/medium severity findings — minimum bar: reentrancy guards on all fund-movement functions, no `tx.origin`, correct access control on every state-changing function, no overflow/underflow risks
3. Manual review checklist: can the agent drain funds beyond its authorization? Can a photographer register a hash they don't own? Are all payment math operations overflow-safe?

**Mainnet deployment:**
1. Add Base Mainnet to `hardhat.config.ts`
2. Deploy all four contracts in order (see deployment order below)
3. Update `.env` with mainnet addresses and a mainnet RPC URL
4. Replace testnet USDC with mainnet USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`)
5. Verify contracts on Basescan: `npx hardhat verify --network base <address> <constructorArgs>`

**Agent scaling (BullMQ):**
1. Install: `npm install bullmq ioredis` in `agent/`
2. Producer (`agent/src/producer.ts`): reads agency portfolios from on-chain, enqueues target URLs as BullMQ jobs (`eyewitness:crawl`)
3. Consumer (`agent/src/worker.ts`): `Worker` instance running the full pipeline per job
4. 3 parallel workers to start; per-domain rate limiting via Redis key `ratelimit:{domain}` (5-second minimum gap)
5. Retry: `attempts: 3`, `backoff: { type: 'exponential', delay: 2000 }` — dead-letter queue `eyewitness:crawl:failed` after 3 failures
6. Replace all `console.log` with Pino structured JSON logging

**How to test:**
- Slither shows zero high-severity findings before deploying
- Verify contracts on Basescan — confirm source code visible publicly
- `docker run -p 6379:6379 redis`, start 2 workers, enqueue 20 URLs — confirm all process (check BullMQ dashboard via `bull-board`)
- Kill one worker mid-job — confirm BullMQ re-queues the stalled job automatically
- Hit a URL returning 403 — confirm 3 retries then dead-letter queue, no worker crash

---

### Dev B — Reliability + Monitoring + Mainnet frontend + End-to-end testing

**What you need to do:**

**Reliability and monitoring (`agent/src/monitor.ts`):**
1. Poll `EscrowVault.agencyStakes(agencyWallet)` every 5 minutes — if below `MIN_STAKE_THRESHOLD`, send a SendGrid alert email
2. Poll agent wallet ETH balance via provider — alert if below `MIN_GAS_THRESHOLD` (e.g., 0.005 ETH)
3. Add a `/health` HTTP endpoint (minimal Express server in `agent/`) returning `{ status: 'ok', queueDepth: N, lastJobAt: ISO }` — return 503 if the queue is stalled
4. Configure `ethers.FallbackProvider`: Alchemy primary + public Base RPC as fallback
5. Add `ecosystem.config.js` for PM2: `pm2 start ecosystem.config.js` — auto-restart on crash

**Mainnet frontend:**
1. Replace `baseSepolia` with `base` in RainbowKit/wagmi chain config
2. Update all contract addresses in `.env.production` to mainnet addresses (from Dev A handoff)
3. Update USDC address to mainnet
4. Confirm RainbowKit shows "Base" not "Base Sepolia" after switch

**End-to-end test execution** (both devs run these together on mainnet):

**Flow 1 — Photographer:**
- Register a real photo → confirm provenance page and Basescan link

**Flow 2 — Cooperative publisher:**
- Deposit real USDC as publisher → host the photo on a test page → run agent → confirm balance decreases, ERC-1155 minted, photographer wallet receives USDC, license appears in publisher dashboard

**Flow 3 — Unknown publisher:**
- Host photo with no escrow → run agent → confirm DMCA sent, `DisputeLogged` on-chain, dashboard shows `DMCA_SENT` → pay on-chain → confirm listener fires, `RESOLVED`, withdrawal email sent

**Flow 4 — Agency:**
- Stake USDC, add photographer to portfolio → run Flows 1 and 2 → confirm agency stake auto-replenishes and dashboard ROI updates

**Edge cases:**
- [ ] Near-duplicate photo (slightly resized) — agent matches it
- [ ] EXIF-stripped copy — `'unverifiable'`, no payment triggered
- [ ] Blocked use category with publisher escrow — forced dispute, escrow not drawn

**How to test:**
- PM2 auto-restarts agent after a simulated crash (`pm2 logs` shows restart)
- Drop agent wallet ETH near zero in test — confirm alert email fires
- `/health` endpoint returns 200 with correct queue depth
- Simulate primary RPC failure — confirm fallback takes over, agent continues
- All four flows complete on mainnet with real USDC, no errors

---

### Phase 5 — Done Checklist

- [ ] Slither passes with zero high-severity findings (Dev A)
- [ ] All contracts verified on Base Mainnet Basescan (Dev A)
- [ ] BullMQ processes 20 URLs without errors, stalled job recovery confirmed (Dev A)
- [ ] Pino structured logging in place (Dev A)
- [ ] PM2 auto-restarts agent on crash (Dev B)
- [ ] `/health` endpoint returns correct status (Dev B)
- [ ] Alert emails fire for low stake and low gas (Dev B)
- [ ] Fallback RPC provider confirmed working (Dev B)
- [ ] Frontend connects to Base Mainnet (Dev B)
- [ ] All four user flows complete on mainnet with real USDC (both devs)
- [ ] All edge cases produce correct outcomes (both devs)

---

## Environment Setup

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

---

## Contract Deployment Order

1. `PhotoRegistry.sol`
2. `LicenseEngine.sol` (needs treasury address + USDC address)
3. `EscrowVault.sol` (needs LicenseEngine address)
4. `DisputeRegistry.sol` (standalone)
5. Grant agent wallet `AGENT_ROLE` on `EscrowVault`, `LicenseEngine`, and `DisputeRegistry`

---

## Key Dependencies

| Package | Purpose |
|---|---|
| `hardhat` | Solidity compilation + deployment |
| `@openzeppelin/contracts` | ERC-1155, AccessControl |
| `ethers` | On-chain reads/writes from agent |
| `better-sqlite3` | Local agent database |
| `puppeteer` | Headless browser crawling |
| `sharp` | Image processing for pHash |
| `imghash` / `blockhash-core` | 64-bit perceptual hash |
| `exifr` | EXIF extraction (agent + browser) |
| `openai` | Use-type classification |
| `bullmq` + `ioredis` | Agent job queue (Phase 5) |
| `pino` | Structured logging (Phase 5) |
| `@sendgrid/mail` | DMCA email delivery |
| `whois` | Hosting provider identification |
| `pm2` | Agent process management (Phase 5) |
| `wagmi` + `viem` | Frontend wallet interaction |
| `@rainbow-me/rainbowkit` | Wallet connection UI |
| `next` | Frontend framework |
