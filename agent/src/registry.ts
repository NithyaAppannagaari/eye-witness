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
  const fallbackUrl = process.env.FALLBACK_RPC_URL
  const contractAddress = process.env.NEXT_PUBLIC_PHOTO_REGISTRY_ADDRESS

  if (!rpcUrl || !contractAddress) {
    throw new Error('NEXT_PUBLIC_BASE_RPC_URL and NEXT_PUBLIC_PHOTO_REGISTRY_ADDRESS must be set in .env')
  }

  const abiJson = JSON.parse(fs.readFileSync(ABI_PATH, 'utf-8'))
  const abi = abiJson.abi ?? abiJson

  const primary = new ethers.JsonRpcProvider(rpcUrl)
  const provider = fallbackUrl
    ? new ethers.FallbackProvider([primary, new ethers.JsonRpcProvider(fallbackUrl)])
    : primary

  contract = new ethers.Contract(contractAddress, abi, provider)
  return contract
}

const CHUNK_SIZE = 9 // Alchemy free tier: max 10-block range

export async function syncRegisteredPhotos(): Promise<void> {
  console.log('[registry] Syncing PhotoRegistered events from chain...')
  const c = getContract()
  const provider = c.runner as ethers.JsonRpcProvider

  const latestBlock = await provider.getBlockNumber()

  // On first sync, only look back 500 blocks (covers recent deployments).
  // Subsequent syncs start from where we left off.
  const lastSynced = getLastSyncedBlock()
  const fromBlock = lastSynced ?? Math.max(0, latestBlock - 500)

  let total = 0
  for (let start = fromBlock; start <= latestBlock; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE - 1, latestBlock)
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
  }

  setLastSyncedBlock(latestBlock)
  console.log(`[registry] Synced ${total} new registered photos (up to block ${latestBlock})`)
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
