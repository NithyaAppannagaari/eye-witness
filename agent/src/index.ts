import path from 'path'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import fs from 'fs'
import { crawlAndInsert } from './crawler'
import { computeImageHash, computePHash } from './hash'
import {
  syncRegisteredPhotos,
  getPhotoFromChain,
  getLicenseRules,
  findPHashMatch,
  seedRegisteredPHash,
  checkLicense,
} from './registry'
import { verifyProvenance } from './verify'
import { classifyUse } from './classifier'
import {
  getPendingDetections,
  getMatchedDetections,
  getVerifiedDetections,
  getClassifiedDetections,
  updateDetection,
} from './db'
import { getPublisherForDomain, getPublisherBalance, executePayment } from './payment'
import { startApiServer } from './api'

const TARGETS_PATH = path.resolve(__dirname, '../targets.json')
const LOOP_INTERVAL_MS = 60_000

function loadTargets(): string[] {
  try {
    return JSON.parse(fs.readFileSync(TARGETS_PATH, 'utf-8')) as string[]
  } catch {
    console.error('[index] Could not load targets.json')
    return []
  }
}

async function processPending(): Promise<void> {
  const rows = getPendingDetections()
  if (rows.length === 0) return
  console.log(`[index] Processing ${rows.length} pending detections`)

  for (const row of rows) {
    // 1. Try exact SHA-256 match
    let matched = false
    try {
      const imageRes = await fetch(row.imageUrl, { signal: AbortSignal.timeout(10_000) })
      if (imageRes.ok) {
        const buffer = Buffer.from(await imageRes.arrayBuffer())
        const imageHash = computeImageHash(buffer)
        const photo = await getPhotoFromChain(imageHash)

        if (photo) {
          matched = true
          console.log(`[match] Exact SHA-256 match: ${imageHash} on ${row.pageUrl}`)
          const pHash = await computePHash(buffer)
          seedRegisteredPHash(imageHash, pHash)

          const alreadyLicensed = await checkLicense(imageHash, row.pageUrl)
          if (alreadyLicensed) {
            console.log(`[match] Already licensed: ${imageHash}`)
            updateDetection(row.id, { status: 'already_licensed', matchedPhotoHash: imageHash, ownerWallet: photo.owner })
            continue
          }

          updateDetection(row.id, {
            status: 'matched',
            matchedPhotoHash: imageHash,
            ownerWallet: photo.owner,
          })
        } else {
          console.log(`[match] No exact match for ${row.imageUrl}`)
        }
      }
    } catch {
      // network error — fall through to pHash
    }

    // 2. Try pHash fuzzy match if no exact match
    if (!matched) {
      const pHashMatch = findPHashMatch(row.pHash)
      if (pHashMatch) {
        const alreadyLicensed = await checkLicense(pHashMatch.photoHash, row.pageUrl)
        if (alreadyLicensed) {
          updateDetection(row.id, { status: 'already_licensed', matchedPhotoHash: pHashMatch.photoHash, ownerWallet: pHashMatch.owner })
          continue
        }
        updateDetection(row.id, {
          status: 'matched',
          matchedPhotoHash: pHashMatch.photoHash,
          ownerWallet: pHashMatch.owner,
        })
      } else {
        updateDetection(row.id, { status: 'no_match' })
      }
    }
  }
}

async function processMatched(): Promise<void> {
  const rows = getMatchedDetections()
  if (rows.length === 0) return
  console.log(`[index] Verifying ${rows.length} matched detections`)

  for (const row of rows) {
    if (!row.matchedPhotoHash || !row.ownerWallet) continue

    try {
      const photo = await getPhotoFromChain(row.matchedPhotoHash)
      if (!photo) {
        updateDetection(row.id, { status: 'unverifiable' })
        continue
      }

      const imageRes = await fetch(row.imageUrl, { signal: AbortSignal.timeout(10_000) })
      if (!imageRes.ok) {
        updateDetection(row.id, { status: 'unverifiable' })
        continue
      }
      const buffer = Buffer.from(await imageRes.arrayBuffer())
      const result = await verifyProvenance(buffer, photo.metadataHash, photo.owner)
      updateDetection(row.id, { status: result })
    } catch {
      updateDetection(row.id, { status: 'unverifiable' })
    }
  }
}

async function processVerified(): Promise<void> {
  const rows = getVerifiedDetections()
  if (rows.length === 0) return
  console.log(`[index] Classifying ${rows.length} verified detections`)

  for (const row of rows) {
    if (!row.matchedPhotoHash) continue

    try {
      const pageRes = await fetch(row.pageUrl, { signal: AbortSignal.timeout(10_000) })
      const pageHtml = pageRes.ok ? await pageRes.text() : ''

      const { useType, confidence } = await classifyUse(pageHtml)
      console.log(`[classifier] ${row.imageUrl} → ${useType} (confidence: ${confidence.toFixed(2)})`)

      const rules = await getLicenseRules(row.matchedPhotoHash)
      const priceMap: Record<string, bigint | null> = {
        editorial: rules?.editorialPrice ?? null,
        commercial: rules?.commercialPrice ?? null,
        ai_training: rules?.aiTrainingPrice ?? null,
      }
      const licensePrice = priceMap[useType] ?? null

      // Check if this use type is blocked (blockAiTraining and useType is ai_training)
      const isBlocked = useType === 'ai_training' && (rules?.blockAiTraining ?? false)

      updateDetection(row.id, {
        useType,
        licensePrice,
        status: isBlocked ? 'blocked_category' : 'classified',
      })
    } catch (err) {
      console.warn(`[index] Classification failed for ${row.imageUrl}:`, err)
    }
  }
}

async function processClassified(): Promise<void> {
  const rows = getClassifiedDetections()
  if (rows.length === 0) return
  console.log(`[index] Processing ${rows.length} classified detections for payment`)

  for (const row of rows) {
    if (!row.matchedPhotoHash || !row.ownerWallet || !row.licensePrice || !row.useType) {
      updateDetection(row.id, { status: 'awaiting_enforcement' })
      continue
    }

    try {
      const domain = new URL(row.pageUrl).hostname
      const publisherAddress = await getPublisherForDomain(domain)

      if (!publisherAddress) {
        console.log(`[payment] No publisher found for domain ${domain}`)
        updateDetection(row.id, { status: 'awaiting_enforcement' })
        continue
      }

      const price = BigInt(row.licensePrice)
      const balance = await getPublisherBalance(publisherAddress)

      if (balance < price) {
        console.log(`[payment] Publisher balance ${balance} < price ${price} for ${domain}`)
        updateDetection(row.id, { status: 'awaiting_enforcement' })
        continue
      }

      const txHash = await executePayment(
        publisherAddress,
        row.matchedPhotoHash,
        price,
        row.pageUrl,
        row.ownerWallet,
        row.useType
      )
      console.log(`[payment] Paid — tx: ${txHash}`)
      updateDetection(row.id, { status: 'paid', txHash, publisherAddress })
    } catch (err) {
      console.warn(`[index] Payment failed for detection ${row.id}:`, err)
    }
  }
}

async function runLoop(): Promise<void> {
  console.log('[index] Starting detection loop...')
  const targets = loadTargets()

  startApiServer()

  // Sync registered photos from chain on startup
  try {
    await syncRegisteredPhotos()
  } catch (err) {
    console.error('[index] Failed to sync registry:', err)
  }

  const tick = async () => {
    console.log(`\n[index] Tick at ${new Date().toISOString()}`)
    await crawlAndInsert(targets)
    await processPending()
    await processMatched()
    await processVerified()
    await processClassified()
    console.log('[index] Tick complete')
  }

  await tick()
  setInterval(tick, LOOP_INTERVAL_MS)
}

runLoop().catch(err => {
  console.error('[index] Fatal error:', err)
  process.exit(1)
})
