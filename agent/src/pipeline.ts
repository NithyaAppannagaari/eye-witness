import { computeImageHash, computePHash } from './hash'
import {
  getPhotoFromChain,
  getLicenseRules,
  findPHashMatch,
  seedRegisteredPHash,
  checkLicense,
} from './registry'
import { verifyProvenance } from './verify'
import { classifyUseByUrl } from './classifier'
import {
  getPendingDetections,
  getMatchedDetections,
  getVerifiedDetections,
  updateDetection,
} from './db'
import { getPublisherForDomain, getPublisherBalance, executePayment } from './payment'
import { identifyHost, getSiteOwnerEmails, generateNotice, sendNotice } from './dmca'
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
          // Exact SHA-256 match = provenance implicitly verified, skip EXIF re-check
          updateDetection(row.id, { status: 'verified', matchedPhotoHash: imageHash, ownerWallet: photo.owner })
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
  logger.info(`[pipeline] Processing ${rows.length} verified detections`)

  for (const row of rows) {
    if (!row.matchedPhotoHash || !row.ownerWallet) continue

    // Classify use type by URL (no external dependency)
    const useType = classifyUseByUrl(row.pageUrl)

    // Determine license price from on-chain rules
    let licensePrice: bigint | null = null
    try {
      const rules = await getLicenseRules(row.matchedPhotoHash)
      const priceMap: Record<string, bigint | null> = {
        editorial: rules?.editorialPrice ?? null,
        commercial: rules?.commercialPrice ?? null,
        ai_training: rules?.aiTrainingPrice ?? null,
      }
      licensePrice = priceMap[useType] ?? null
    } catch (err) {
      logger.warn({ err }, `[pipeline] Could not fetch license rules for ${row.matchedPhotoHash}`)
    }

    updateDetection(row.id, { useType, licensePrice })

    // Attempt automatic payment if publisher has escrow
    if (licensePrice) {
      try {
        const domain = new URL(row.pageUrl).hostname
        const publisherAddress = await getPublisherForDomain(domain)
        if (publisherAddress) {
          const balance = await getPublisherBalance(publisherAddress)
          if (balance >= licensePrice) {
            const txHash = await executePayment(publisherAddress, row.matchedPhotoHash, licensePrice, row.pageUrl, row.ownerWallet, useType)
            logger.info(`[pipeline] Paid — tx: ${txHash}`)
            updateDetection(row.id, { status: 'paid', txHash, publisherAddress })
            continue
          }
        }
      } catch (err) {
        logger.warn({ err }, `[pipeline] Payment failed for detection ${row.id}`)
      }
    }

    // Fallback: DMCA takedown — always sends; no domain claim required
    try {
      const hostname = new URL(row.pageUrl).hostname
      const encodedUrl = encodeURIComponent(row.pageUrl)
      const licenseUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/license/${row.matchedPhotoHash}?url=${encodedUrl}&use=${useType}`

      // Site-owner emails derived from the hostname (works for any site)
      const siteEmails = getSiteOwnerEmails(hostname)
      // Also include the hosting-provider abuse contact if known
      const hostEmail = identifyHost(hostname)
      const allEmails = hostEmail ? [...siteEmails, hostEmail] : siteEmails

      const notice = generateNotice({
        photoHash: row.matchedPhotoHash,
        pageUrl: row.pageUrl,
        ownerWallet: row.ownerWallet,
        useType,
        licenseUrl,
      })

      await sendNotice(allEmails, notice, row.matchedPhotoHash)
      const primaryEmail = allEmails[0]
      logger.info(`[pipeline] DMCA sent to ${allEmails.length} addresses for ${row.pageUrl}`)
      updateDetection(row.id, { status: 'dmca_sent', dmcaSentAt: new Date().toISOString(), dmcaEmail: primaryEmail })
    } catch (err) {
      logger.warn({ err }, `[pipeline] DMCA failed for detection ${row.id}`)
    }
  }
}
