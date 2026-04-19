import { computeImageHash, computePHash } from './hash'
import {
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
  getAwaitingEnforcement,
  getBlockedCategory,
  updateDetection,
} from './db'
import { getPublisherForDomain, getPublisherBalance, executePayment } from './payment'
import { identifyHost, generateNotice, sendNotice } from './dmca'
import { logDisputeOnChain } from './dispute'
import { logger } from './logger'

export async function processPending(): Promise<void> {
  const rows = getPendingDetections()
  if (rows.length === 0) return
  logger.info(`[pipeline] Processing ${rows.length} pending detections`)

  for (const row of rows) {
    let matched = false
    try {
      const imageRes = await fetch(row.imageUrl, { signal: AbortSignal.timeout(10_000) })
      if (imageRes.ok) {
        const buffer = Buffer.from(await imageRes.arrayBuffer())
        const imageHash = computeImageHash(buffer)
        const photo = await getPhotoFromChain(imageHash)

        if (photo) {
          matched = true
          const pHash = await computePHash(buffer)
          seedRegisteredPHash(imageHash, pHash)

          const alreadyLicensed = await checkLicense(imageHash, row.pageUrl)
          if (alreadyLicensed) {
            updateDetection(row.id, { status: 'already_licensed', matchedPhotoHash: imageHash, ownerWallet: photo.owner })
            continue
          }
          updateDetection(row.id, { status: 'matched', matchedPhotoHash: imageHash, ownerWallet: photo.owner })
        }
      }
    } catch { /* network error — fall through to pHash */ }

    if (!matched) {
      const pHashMatch = findPHashMatch(row.pHash)
      if (pHashMatch) {
        const alreadyLicensed = await checkLicense(pHashMatch.photoHash, row.pageUrl)
        if (alreadyLicensed) {
          updateDetection(row.id, { status: 'already_licensed', matchedPhotoHash: pHashMatch.photoHash, ownerWallet: pHashMatch.owner })
          continue
        }
        updateDetection(row.id, { status: 'matched', matchedPhotoHash: pHashMatch.photoHash, ownerWallet: pHashMatch.owner })
      } else {
        updateDetection(row.id, { status: 'no_match' })
      }
    }
  }
}

export async function processMatched(): Promise<void> {
  const rows = getMatchedDetections()
  if (rows.length === 0) return
  logger.info(`[pipeline] Verifying ${rows.length} matched detections`)

  for (const row of rows) {
    if (!row.matchedPhotoHash || !row.ownerWallet) continue
    try {
      const photo = await getPhotoFromChain(row.matchedPhotoHash)
      if (!photo) { updateDetection(row.id, { status: 'unverifiable' }); continue }

      const imageRes = await fetch(row.imageUrl, { signal: AbortSignal.timeout(10_000) })
      if (!imageRes.ok) { updateDetection(row.id, { status: 'unverifiable' }); continue }

      const buffer = Buffer.from(await imageRes.arrayBuffer())
      const result = await verifyProvenance(buffer, photo.metadataHash, photo.owner)
      updateDetection(row.id, { status: result })
    } catch {
      updateDetection(row.id, { status: 'unverifiable' })
    }
  }
}

export async function processVerified(): Promise<void> {
  const rows = getVerifiedDetections()
  if (rows.length === 0) return
  logger.info(`[pipeline] Classifying ${rows.length} verified detections`)

  for (const row of rows) {
    if (!row.matchedPhotoHash) continue
    try {
      const pageRes = await fetch(row.pageUrl, { signal: AbortSignal.timeout(10_000) })
      const pageHtml = pageRes.ok ? await pageRes.text() : ''
      const { useType, confidence } = await classifyUse(pageHtml)
      logger.info(`[pipeline] ${row.imageUrl} → ${useType} (${confidence.toFixed(2)})`)

      const rules = await getLicenseRules(row.matchedPhotoHash)
      const priceMap: Record<string, bigint | null> = {
        editorial: rules?.editorialPrice ?? null,
        commercial: rules?.commercialPrice ?? null,
        ai_training: rules?.aiTrainingPrice ?? null,
      }
      const licensePrice = priceMap[useType] ?? null
      const isBlocked = useType === 'ai_training' && (rules?.blockAiTraining ?? false)
      updateDetection(row.id, { useType, licensePrice, status: isBlocked ? 'blocked_category' : 'classified' })
    } catch (err) {
      logger.warn({ err }, `[pipeline] Classification failed for ${row.imageUrl}`)
    }
  }
}

export async function processClassified(): Promise<void> {
  const rows = getClassifiedDetections()
  if (rows.length === 0) return
  logger.info(`[pipeline] Processing ${rows.length} classified detections for payment`)

  for (const row of rows) {
    if (!row.matchedPhotoHash || !row.ownerWallet || !row.licensePrice || !row.useType) {
      updateDetection(row.id, { status: 'awaiting_enforcement' })
      continue
    }
    try {
      const domain = new URL(row.pageUrl).hostname
      const publisherAddress = await getPublisherForDomain(domain)
      if (!publisherAddress) {
        updateDetection(row.id, { status: 'awaiting_enforcement' })
        continue
      }
      const price = BigInt(row.licensePrice)
      const balance = await getPublisherBalance(publisherAddress)
      if (balance < price) {
        updateDetection(row.id, { status: 'awaiting_enforcement' })
        continue
      }
      const txHash = await executePayment(publisherAddress, row.matchedPhotoHash, price, row.pageUrl, row.ownerWallet, row.useType)
      logger.info(`[pipeline] Paid — tx: ${txHash}`)
      updateDetection(row.id, { status: 'paid', txHash, publisherAddress })
    } catch (err) {
      logger.warn({ err }, `[pipeline] Payment failed for detection ${row.id}`)
    }
  }
}

export async function processEnforcement(): Promise<void> {
  const rows = [...getAwaitingEnforcement(), ...getBlockedCategory()]
  if (rows.length === 0) return
  logger.info(`[pipeline] Processing ${rows.length} rows for enforcement`)

  for (const row of rows) {
    if (!row.matchedPhotoHash || !row.ownerWallet) continue
    try {
      const disputeId = await logDisputeOnChain(row.matchedPhotoHash, row.pageUrl, row.imageUrl)
      updateDetection(row.id, { disputeId })
      logger.info(`[pipeline] Logged dispute ${disputeId} for detection ${row.id}`)

      const hostname = new URL(row.pageUrl).hostname
      const dmcaEmail = identifyHost(hostname)
      const notice = generateNotice({
        photoHash: row.matchedPhotoHash,
        pageUrl: row.pageUrl,
        ownerWallet: row.ownerWallet,
        useType: row.useType ?? 'unknown',
      })
      if (dmcaEmail) {
        await sendNotice(dmcaEmail, notice, row.matchedPhotoHash)
        updateDetection(row.id, { status: 'dmca_sent', dmcaSentAt: new Date().toISOString(), dmcaEmail })
      } else {
        logger.info(`[pipeline] No DMCA contact for ${hostname}`)
        updateDetection(row.id, { status: 'dmca_sent', dmcaSentAt: new Date().toISOString() })
      }
    } catch (err) {
      logger.warn({ err }, `[pipeline] Enforcement failed for detection ${row.id}`)
    }
  }
}
