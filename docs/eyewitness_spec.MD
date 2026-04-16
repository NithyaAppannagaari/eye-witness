**Eye:Witness**

Full Product Specification

_Verified Photography. Automatic Enforcement. On-Chain Payments._

_We're building a system where an autonomous agent crawls the web, detects unlicensed uses of registered photos via perceptual hashing, and triggers MPP micropayments on-chain directly to the photographer's wallet._

# **1\. Problem**

Photographers can't enforce their rights at scale. Licensing is too slow and expensive for small transactions. There's no existing system that detects your photo being used on a random site and automatically collects payment.

### **Trust**

- AI-generated images are now indistinguishable from real photos - real photographs are losing credibility by default
- No simple way to verify when or where a photo was actually taken once it leaves the photographer's device
- Photographers have no credible proof of authorship that travels with the image as it spreads

### **Payment**

- Photographers technically own their work the moment they take a photo, but enforcing that at scale is practically impossible
- Licensing infrastructure is too slow and expensive for small transactions - most photo use goes unpaid
- No existing system can detect your photo being used on a random site and automatically collect payment
- The vast majority of photographers - not top-tier professionals - have zero protection and zero monetization path

### **Enforcement**

- Agencies managing large portfolios pay heavily for manual rights management infrastructure that is slow, reactive, and human-dependent
- DMCA takedowns require manual filing, follow-up, and legal knowledge - inaccessible for most photographers
- When a violation is found, there is no frictionless path for the violator to simply pay and resolve it

# **2\. What We're Building**

Eye:Witness has three layers that work together: a provenance registry that proves a photo is real, a detection agent that finds unlicensed uses across the web, and a payment + enforcement system that resolves those uses automatically.

### **The four actors**

- **-** Photographer

registers photos, sets license rules, receives payments passively

- **-** Agency

stakes USDC to fund detection across their portfolio; earns back through volume

- **-** Publisher

either opts in (cooperative) or gets detected (unknown)

- **-** Agent

the autonomous software system that crawls, detects, classifies, pays, and enforces

# **3\. How It Works - Full Flow**

## **3.1 Photo Registration**

- Photographer uploads a photo via the web app
- exifr library extracts timestamp and GPS coordinates from EXIF metadata
- System computes two hashes:
- Image hash (SHA-256 of the raw image file) - used for visual matching by the agent
- Metadata hash (SHA-256 of timestamp + GPS + photographer wallet) - used as the provenance certificate
- Both hashes, the photographer's wallet address, and their license rules are committed to the PhotoRegistry Solidity contract on Base Sepolia in a single transaction
- A public provenance page is generated: image preview, GPS map, timestamp, on-chain tx hash, owner wallet
- The metadata hash is the trustless lookup key - any agent anywhere can query the contract with an image hash and find the owner's wallet with no company controlling that mapping

## **3.2 Agency Staking**

- Agencies (stock photo agencies, news wire services, talent management companies) stake USDC into the contract to fund the agent's detection activity across their entire portfolio
- The ROI is clear: agencies manage rights for thousands of photographers, so aggregate license fees collected far exceed the cost of running the agent
- Individual photographers do not need to stake anything - the agency funds enforcement on their behalf
- As the agent collects license fees from successful detections, it automatically replenishes the agency's stake - the system becomes self-sustaining at scale
- If an agency withdraws, their remaining stake is returned to their wallet

## **3.3 Detection Agent**

- Agent runs on a continuous Node.js loop - no human triggers it
- Puppeteer crawls target pages, extracts all image URLs, and fetches each image
- For each image, agent computes a perceptual hash (pHash)
- pHash works by downscaling the image, converting to grayscale, and producing a 64-bit fingerprint
- Two images with a Hamming distance under ~10 are treated as the same image
- This catches resized, cropped, and lightly edited versions - not just exact duplicates
- Agent queries the on-chain PhotoRegistry: does this pHash match a registered photo?
- No match → skip
- Match → retrieve photographer wallet, metadata hash, and license rules
- Second verification layer: agent recomputes the metadata hash from the found image's EXIF data and checks it against the on-chain record
- Hashes match → provenance verified, proceed
- Hashes don't match → image may be AI-generated or tampered - flagged as unverifiable, no payment triggered
- Agent checks if a valid on-chain license already exists for this URL → if yes, skip

## **3.4 Classification**

- Agent sends page HTML to OpenAI classifier to determine use type:
- Editorial - news articles, blog posts, educational content
- Commercial - product pages, marketing, advertising
- AI training - datasets, model training pipelines
- Classification determines the applicable license tier and price as set by the photographer at registration
- Uses outside the photographer's allowed categories (e.g. AI training if blocked) are routed directly to dispute regardless of publisher type

## **3.5 Payment - Cooperative Publisher Track**

- Publisher has pre-deposited USDC into the smart contract escrow
- Agent draws from their escrow balance and splits the payment atomically in one transaction:
- ~85% → photographer's wallet directly
- ~10% → agent's wallet (covers gas and operational costs - agent is self-funding)
- ~5% → platform treasury
- Contract calls mintLicense - an ERC-1155 license token is minted to the publisher's address
- The token includes a pointer to the metadata hash - proof that they licensed a verified real photograph, not just an image file
- If publisher's escrow balance runs out, detected uses are automatically rerouted to the dispute track

## **3.6 Enforcement - Unknown Publisher Track**

- Publisher has no escrow - they are unaware of Eye:Witness or have chosen not to opt in
- Agent automatically generates and sends a DMCA takedown notice to the violating site's hosting provider
- Hosting providers are legally required to respond to DMCA notices
- The on-chain record provides a timestamped, immutable evidence package
- No lawyer or manual effort required from the photographer
- The violator now has two options: fight the DMCA legally (expensive) or pay on-chain
- If they pay the license fee on-chain:
- Smart contract mints a valid ERC-1155 license receipt
- Contract emits a LicenseMinted event for the disputed URL
- Backend listens for this event and automatically sends a DMCA withdrawal notice to the hosting provider
- Site stays up - paying on-chain is the path of least resistance
- If they don't pay, the DMCA proceeds and the photographer has a permanent on-chain record for any further legal action

# **4\. Smart Contract Architecture**

## **4.1 PhotoRegistry.sol**

- Stores: photoHash, metadataHash, owner wallet, timestamp, license rules (price per tier, blocked categories)
- Functions: registerPhoto, getPhoto, checkLicense, getLicenseRules
- Emits: PhotoRegistered event on registration

## **4.2 LicenseEngine.sol**

- Handles license minting and payment splitting
- Functions: mintLicense (takes photoId, publisherAddress, useType, payment)
- Splits payment: photographer cut, agent cut, platform cut - ratios set at deployment
- Mints ERC-1155 token with metadata pointer to the on-chain provenance record
- Emits: LicenseMinted event (includes URL, photoId, publisher, timestamp)

## **4.3 EscrowVault.sol**

- Manages publisher escrow deposits and agency stakes
- Functions: deposit, withdraw, getBalance, drawPayment
- drawPayment called by agent - pulls from publisher escrow and routes to LicenseEngine
- Agency stake tracked separately - replenished automatically from agent's collected fees

## **4.4 DisputeRegistry.sol**

- Logs immutable dispute records for unresolved violations
- Functions: logDispute, resolveDispute, getDispute
- Emits: DisputeLogged event (URL, photoId, timestamp, evidence hash)
- Emits: DisputeResolved event when violator pays on-chain - triggers DMCA withdrawal

# **5\. On-Chain vs Off-Chain**

| **On-Chain (immutable)**        | **Off-Chain (practical)**          |
| ------------------------------- | ---------------------------------- |
| Image hash (SHA-256)            | Image file (Supabase / Cloudinary) |
| Metadata hash (timestamp + GPS) | EXIF parsing (exifr library)       |
| Photographer wallet address     | Web crawler (Puppeteer)            |
| License rules per photo         | Perceptual hash matching (pHash)   |
| Agency stake balances           | Use classifier (OpenAI)            |
| Publisher escrow balances       | Agent decision loop (Node.js)      |
| Payment records per license     | DMCA automation layer              |
| ERC-1155 license tokens         | Notification system                |
| Dispute records                 | Frontend (Next.js + Tailwind)      |
| DisputeResolved events          | Backend API (Next.js routes)       |

# **6\. Why Crypto Specifically**

- A software agent can't hold a credit card - a crypto wallet is just a keypair, any software can hold one and sign transactions independently
- At \$0.001-\$0.05 per transaction, traditional payment rails cost more in fees than the transaction itself - Base L2 fees are fractions of a cent
- A single on-chain transaction handles verification, payment, and license issuance atomically - no reconciliation, no settlement delay
- The blockchain is the only infrastructure where an autonomous agent can hold funds, verify ownership, and pay without a trusted middleman
- On-chain dispute records are immutable and timestamped - legally credible evidence without a lawyer

# **7\. Full Tech Stack**

| **Layer**          | **Technology**                               |
| ------------------ | -------------------------------------------- |
| Frontend           | Next.js, Tailwind CSS                        |
| Wallet connection  | RainbowKit + Wagmi                           |
| Backend / API      | Next.js API routes                           |
| Image storage      | Supabase Storage or Cloudinary               |
| EXIF parsing       | exifr (Node.js library)                      |
| Blockchain         | Solidity + Hardhat                           |
| Network            | Base Sepolia (testnet) → Base mainnet        |
| Crawler            | Puppeteer                                    |
| Perceptual hashing | pHash library (Node.js)                      |
| Use classifier     | OpenAI API (GPT-4o)                          |
| Agent loop         | Node.js cron / queue worker                  |
| DMCA automation    | Custom Node.js layer + hosting provider APIs |
| Event listener     | ethers.js event subscriptions                |
| Payments           | USDC on Base                                 |
| License tokens     | ERC-1155 (OpenZeppelin)                      |

# **8\. User Flows**

## **8.1 Photographer**

- Connects wallet via RainbowKit
- Uploads photo - EXIF extracted automatically, map + timestamp displayed for confirmation
- Sets license rules: price per use type, any blocked categories (e.g. AI training off)
- Clicks register - hashes committed on-chain, provenance page generated
- Dashboard shows: photos registered, detections found, payments received, disputes logged
- Receives USDC payments directly to wallet - no action required

## **8.2 Agency**

- Connects wallet, creates agency account
- Adds photographers to their portfolio - links their registered photos to the agency
- Deposits USDC stake into EscrowVault - funds detection activity across the full portfolio
- Dashboard shows: portfolio size, total detections, total fees collected, stake balance, ROI
- Stake auto-replenishes from collected fees - agency manually tops up only if volume is low

## **8.3 Cooperative Publisher**

- Discovers Eye:Witness, chooses to opt in to avoid DMCA risk
- Deposits USDC escrow into EscrowVault
- Uses photos as normal - agent detects use, draws from escrow, mints license automatically
- Receives ERC-1155 license tokens in their wallet as proof of legitimate use
- Dashboard shows: active licenses, escrow balance, photos used

## **8.4 Unknown Publisher (Violator)**

- Uses a registered photo with no license - has no idea Eye:Witness exists
- Agent detects the use, files DMCA with hosting provider automatically
- Publisher receives DMCA notice from their host - directed to Eye:Witness to resolve
- Publisher visits the photo's provenance page, sees license options and price
- Pays on-chain → license minted → DMCA automatically withdrawn → site stays up

# **9\. Full Build Plan**

## **Phase 1 - Core registry + registration UI**

- PhotoRegistry.sol - deploy to Base Sepolia
- Registration UI: upload, EXIF extraction, hash computation, wallet connection, on-chain commit
- Public provenance page: image preview, GPS map, timestamp, wallet, on-chain tx link
- Photographer dashboard: registered photos, basic stats

## **Phase 2 - Detection agent**

- Puppeteer crawler: target URL list, image extraction, pHash computation
- Registry query: pHash match → fetch owner wallet + license rules
- Second verification: recompute metadata hash from found image EXIF, compare to on-chain record
- License check: query chain for existing license on this URL
- OpenAI classifier: page HTML → use type → license tier

## **Phase 3 - Payment layer**

- LicenseEngine.sol + EscrowVault.sol - deploy to Base Sepolia
- Cooperative publisher flow: escrow deposit UI, agent drawPayment, ERC-1155 mint
- Payment split logic: photographer / agent / platform cuts
- Agency staking UI + auto-replenishment logic
- Agency + publisher dashboards

## **Phase 4 - Enforcement layer**

- DisputeRegistry.sol - deploy to Base Sepolia
- DMCA automation: generate notice, send to hosting provider API or email
- ethers.js event listener: watch for LicenseMinted on disputed URLs
- Auto-withdrawal: on LicenseMinted event, send DMCA withdrawal notice
- Dispute dashboard for photographers: URL, timestamp, status, on-chain evidence link

## **Phase 5 - Production hardening**

- Deploy all contracts to Base mainnet
- Crawler scaling: queue-based architecture for high-volume URL processing
- Rate limiting, error handling, and retry logic on the agent loop
- Security audit of all Solidity contracts
- USDC integration with real funds
- Full end-to-end testing across all four user flows

# **10\. Demo Script**

- Register a photo - show provenance page with timestamp, GPS map, wallet, on-chain hash
- Load a test webpage that embeds the photo with no license
- Run the agent live - it crawls the page, detects the photo, runs both hash verifications
- Show the classification step: OpenAI reads the page, returns use type and price
- Show the on-chain transaction: payment split, license token minted, photographer wallet credited
- Show the photographer dashboard updating in real time
- Demonstrate the dispute track: block the auto-approve, show DMCA generation, show on-chain dispute record
- Show the resolution: pay on-chain → LicenseMinted event → DMCA withdrawal triggered

_The agent only needs to crawl a handful of pre-set URLs for the demo. A clean end-to-end loop on 3 URLs - including one cooperative and one dispute resolution - is the full story._