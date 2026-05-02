import { ethers } from 'ethers'
import path from 'path'
import fs from 'fs'
import {
  upsertRegisteredPhoto,
  getAllRegisteredPhotos,
  updateRegisteredPhotoPHash,
  getLastSyncedBlock,
  setLastSyncedBlock,
} from './db'
import { hammingDistance } from './hash'
import { RegisteredPhoto } from './types'

const ABI_PATH = path.resolve(__dirname, '../../frontend/src/abi/PhotoRegistry.json')

let contract: ethers.Contract | null = null

function getContract(): ethers.Contract {
  if (contract) return contract

  const rpcUrl = process.env.NEXT_PUBLIC_BASE_RPC_URL
  const contractAddress = process.env.NEXT_PUBLIC_PHOTO_REGISTRY_ADDRESS

  if (!rpcUrl || !contractAddress) {
    throw new Error('NEXT_PUBLIC_BASE_RPC_URL and NEXT_PUBLIC_PHOTO_REGISTRY_ADDRESS must be set in .env')
  }

  const abiJson = JSON.parse(fs.readFileSync(ABI_PATH, 'utf-8'))
  const abi = abiJson.abi ?? abiJson

  const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { batchMaxCount: 1 })
  contract = new ethers.Contract(contractAddress, abi, provider)
  return contract
}

const CHUNK_SIZE = 100
const CHUNK_DELAY_MS = 300 // avoid rate limit

// Cap how far we'll scan per tick. Alchemy's free tier limits eth_getLogs to a
// 10-block range per call; with a per-tick cap of 9 we stay under it with a
// single call, then catch up gradually over subsequent ticks. Bump this if you
// upgrade to a paid RPC tier (or run a self-hosted node).
const MAX_BLOCKS_PER_TICK = process.env.RPC_MAX_PER_TICK ? parseInt(process.env.RPC_MAX_PER_TICK, 10) : 9

export async function syncRegisteredPhotos(): Promise<void> {
  console.log('[registry] Syncing PhotoRegistered events from chain...')
  const c = getContract()
  const provider = c.runner as ethers.JsonRpcProvider

  const latestBlock = await provider.getBlockNumber()

  const lastSynced = getLastSyncedBlock()
  const deployBlock = process.env.REGISTRY_DEPLOY_BLOCK ? parseInt(process.env.REGISTRY_DEPLOY_BLOCK, 10) : null
  let fromBlock: number
  if (lastSynced != null) {
    fromBlock = lastSynced
  } else if (deployBlock != null) {
    fromBlock = deployBlock
  } else {
    // No prior state and no deploy hint: skip historical backfill and start
    // tracking from the next block forward. Avoids hammering the RPC on a
    // cold start with a free-tier provider.
    setLastSyncedBlock(latestBlock)
    console.log(`[registry] No REGISTRY_DEPLOY_BLOCK and no prior sync — starting forward from block ${latestBlock}. Set REGISTRY_DEPLOY_BLOCK in .env if you need historical events.`)
    return
  }

  // Per-tick cap so a long offline gap doesn't blow the RPC budget.
  const targetBlock = Math.min(latestBlock, fromBlock + MAX_BLOCKS_PER_TICK - 1)

  let total = 0
  for (let start = fromBlock; start <= targetBlock; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE - 1, targetBlock)
    const filter = c.filters.PhotoRegistered()
    const events = await c.queryFilter(filter, start, end)

    for (const event of events) {
      const e = event as ethers.EventLog
      const { photoHash, owner, timestamp } = e.args
      upsertRegisteredPhoto({
        photoHash: photoHash as string,
        owner: owner as string,
        timestamp: timestamp as bigint,
        pHash: null,
      })
      total++
    }

    if (start + CHUNK_SIZE <= targetBlock) {
      await new Promise(r => setTimeout(r, CHUNK_DELAY_MS))
    }
  }

  setLastSyncedBlock(targetBlock)
  if (total > 0 || targetBlock < latestBlock) {
    const lag = latestBlock - targetBlock
    console.log(`[registry] Synced ${total} new registered photos (up to block ${targetBlock}${lag > 0 ? `, ${lag} blocks behind chain head` : ''})`)
  }
}

export async function getPhotoFromChain(
  photoHash: string
): Promise<{ metadataHash: string; owner: string; timestamp: bigint } | null> {
  try {
    const c = getContract()
    const photo = await c.getPhoto(photoHash)
    if (!photo || !photo.owner || photo.owner === ethers.ZeroAddress) return null
    return {
      metadataHash: photo.metadataHash as string,
      owner: photo.owner as string,
      timestamp: photo.timestamp as bigint,
    }
  } catch {
    return null
  }
}

export async function checkLicense(photoHash: string, pageUrl: string): Promise<boolean> {
  try {
    const c = getContract()
    return await c.checkLicense(photoHash, pageUrl) as boolean
  } catch {
    return false
  }
}

export async function getLicenseRules(
  photoHash: string
): Promise<{ editorialPrice: bigint; commercialPrice: bigint; aiTrainingPrice: bigint; blockAiTraining: boolean } | null> {
  try {
    const c = getContract()
    const rules = await c.getLicenseRules(photoHash)
    return {
      editorialPrice: rules.editorialPrice as bigint,
      commercialPrice: rules.commercialPrice as bigint,
      aiTrainingPrice: rules.aiTrainingPrice as bigint,
      blockAiTraining: rules.blockAiTraining as boolean,
    }
  } catch {
    return null
  }
}

export function findPHashMatch(
  targetPHash: string,
  threshold = 10
): RegisteredPhoto | null {
  const registered = getAllRegisteredPhotos()
  let bestMatch: RegisteredPhoto | null = null
  let bestDist = threshold

  for (const photo of registered) {
    if (!photo.pHash) continue
    const dist = hammingDistance(targetPHash, photo.pHash)
    if (dist < bestDist) {
      bestDist = dist
      bestMatch = photo
    }
  }

  return bestMatch
}

export function seedRegisteredPHash(photoHash: string, pHash: string): void {
  updateRegisteredPhotoPHash(photoHash, pHash)
}
