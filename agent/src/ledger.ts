import { ethers } from 'ethers'
import path from 'path'
import fs from 'fs'
import { insertLedgerEntry, getLastLedgerBlock, setLastLedgerBlock, getDb } from './db'
import { logger } from './logger'

// Reads the locally-synced registered_photos table to find the photographer for
// a given photoId. Returns null if we haven't seen the registration yet (the
// next syncRegisteredPhotos tick will catch it; the ledger row can be updated
// then if needed).
function lookupPhotographer(photoId: string): string | null {
  const row = getDb().prepare('SELECT owner FROM registered_photos WHERE photoHash = ?').get(photoId) as { owner: string } | undefined
  return row ? row.owner.toLowerCase() : null
}

const ESCROW_ABI_PATH = path.resolve(__dirname, '../../frontend/src/abi/EscrowVault.json')
const ENGINE_ABI_PATH = path.resolve(__dirname, '../../frontend/src/abi/LicenseEngine.json')

let _provider: ethers.JsonRpcProvider | null = null
let _vault: ethers.Contract | null = null
let _engine: ethers.Contract | null = null

function getContracts() {
  if (_provider && _vault && _engine) return { provider: _provider, vault: _vault, engine: _engine }
  const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL
  const vaultAddress = process.env.NEXT_PUBLIC_ESCROW_VAULT_ADDRESS
  const engineAddress = process.env.NEXT_PUBLIC_LICENSE_ENGINE_ADDRESS
  if (!rpcUrl || !vaultAddress || !engineAddress) {
    throw new Error('[ledger] NEXT_PUBLIC_BASE_RPC_URL, NEXT_PUBLIC_ESCROW_VAULT_ADDRESS, NEXT_PUBLIC_LICENSE_ENGINE_ADDRESS must be set')
  }
  _provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { batchMaxCount: 1 })
  const vaultAbi = JSON.parse(fs.readFileSync(ESCROW_ABI_PATH, 'utf-8')).abi
  const engineAbi = JSON.parse(fs.readFileSync(ENGINE_ABI_PATH, 'utf-8')).abi
  _vault = new ethers.Contract(vaultAddress, vaultAbi, _provider)
  _engine = new ethers.Contract(engineAddress, engineAbi, _provider)
  return { provider: _provider, vault: _vault, engine: _engine }
}

const CHUNK_SIZE = 500
const CHUNK_DELAY_MS = 300

// Cap blocks per tick so a long offline gap doesn't blow the RPC budget.
// On Alchemy free tier (10-block eth_getLogs limit), keeping this at 9 means
// each tick is one call that fits inside the limit. Steady-state Sepolia
// produces ~5 blocks per 60s tick so we usually stay caught up.
const MAX_BLOCKS_PER_TICK = process.env.RPC_MAX_PER_TICK ? parseInt(process.env.RPC_MAX_PER_TICK, 10) : 9

// Indexes PaymentDrawn events from EscrowVault into the escrow_ledger table.
// For each event, joins with the LicenseMinted event in the same tx to fill
// in photographer + useType (PaymentDrawn alone doesn't carry those).
//
// Idempotent: keyed on (txHash, logIndex). Safe to call repeatedly.
export async function syncLedger(): Promise<void> {
  const { provider, vault, engine } = getContracts()
  const latestBlock = await provider.getBlockNumber()

  const lastSynced = getLastLedgerBlock()
  const deployBlock = process.env.ESCROW_DEPLOY_BLOCK ? parseInt(process.env.ESCROW_DEPLOY_BLOCK, 10) : null
  let fromBlock: number
  if (lastSynced != null) {
    fromBlock = lastSynced + 1
  } else if (deployBlock != null) {
    fromBlock = deployBlock
  } else {
    // No prior state and no deploy hint: skip historical backfill and start
    // forward. Free-tier RPCs can't handle a 10k-block scan in one go.
    setLastLedgerBlock(latestBlock)
    logger.info(`[ledger] No ESCROW_DEPLOY_BLOCK and no prior sync — starting forward from block ${latestBlock}. Set ESCROW_DEPLOY_BLOCK in .env if you need historical events.`)
    return
  }

  // Always attempt to backfill any null-photographer rows BEFORE the early
  // return. registered_photos may have caught up since the last ledger sync
  // even if no new blocks need indexing.
  backfillPhotographers()

  if (fromBlock > latestBlock) return

  // Per-tick cap. If we're far behind, we'll catch up over multiple ticks.
  const targetBlock = Math.min(latestBlock, fromBlock + MAX_BLOCKS_PER_TICK - 1)

  let inserted = 0
  for (let start = fromBlock; start <= targetBlock; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE - 1, targetBlock)

    const paymentEvents = await vault.queryFilter(vault.filters.PaymentDrawn(), start, end)
    if (paymentEvents.length === 0) {
      if (start + CHUNK_SIZE <= targetBlock) await new Promise(r => setTimeout(r, CHUNK_DELAY_MS))
      continue
    }

    // Pull all LicenseMinted events in the same range so we can join by txHash.
    const mintEvents = await engine.queryFilter(engine.filters.LicenseMinted(), start, end)
    const mintByTx = new Map<string, ethers.EventLog>()
    for (const ev of mintEvents) mintByTx.set(ev.transactionHash, ev as ethers.EventLog)

    for (const event of paymentEvents) {
      const e = event as ethers.EventLog
      const { photoId, publisher, url, amount } = e.args
      const block = await e.getBlock()

      const mint = mintByTx.get(e.transactionHash)
      const useType = mint?.args?.useType as string | undefined
      // photographer isn't in either event; we infer it from the on-chain photo registry
      // at API time rather than store a denormalized copy here. Leave null for now;
      // the API layer joins it from registered_photos.
      // (We still record useType because it lives in LicenseMinted only.)

      const wasInserted = insertLedgerEntry({
        txHash: e.transactionHash,
        logIndex: e.index,
        blockNumber: e.blockNumber,
        photoId: photoId as string,
        publisher: (publisher as string).toLowerCase(),
        photographer: lookupPhotographer(photoId as string),
        pageUrl: url as string,
        amount: amount as bigint,
        useType: useType ?? null,
        blockTimestamp: block.timestamp,
      })
      if (wasInserted) inserted++
    }

    if (start + CHUNK_SIZE <= targetBlock) {
      await new Promise(r => setTimeout(r, CHUNK_DELAY_MS))
    }
  }

  setLastLedgerBlock(targetBlock)
  const lag = latestBlock - targetBlock
  if (inserted > 0 || lag > 0) {
    logger.info(`[ledger] Indexed ${inserted} new PaymentDrawn events (up to block ${targetBlock}${lag > 0 ? `, ${lag} blocks behind chain head` : ''})`)
  }

  backfillPhotographers()
}

// If the ledger was indexed before registered_photos caught up, photographer is null.
// Each call fixes any rows whose photoId now resolves in registered_photos.
function backfillPhotographers(): void {
  const updated = getDb().prepare(`
    UPDATE escrow_ledger
    SET photographer = (
      SELECT LOWER(owner) FROM registered_photos WHERE photoHash = escrow_ledger.photoId
    )
    WHERE photographer IS NULL
      AND EXISTS (SELECT 1 FROM registered_photos WHERE photoHash = escrow_ledger.photoId)
  `).run()
  if (updated.changes > 0) logger.info(`[ledger] Backfilled photographer for ${updated.changes} ledger rows`)
}
