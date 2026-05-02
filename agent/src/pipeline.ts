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
  getPayingDetections,
  updateDetection,
  upsertRegisteredPhoto,
} from './db'
import { getPublisherForDomain, getPublisherBalance, executePayment, isAlreadyChargedOnChain } from './payment'
import { identifyHost, getSiteOwnerEmails, generateNotice, sendNotice } from './dmca'
import { logger } from './logger'

// Boot-time reconciliation: any rows left in 'paying' from a prior crashed run
// must be resolved before we re-enter the loop. We probe the on-chain guard:
//   - charged → mark 'paid' (we lost the txHash, but the funds did move)
//   - not charged → roll back to 'verified' so the next tick retries cleanly
// If the chain probe fails (RPC down), we leave the row alone and try again next boot.
export async function reconcilePaying(): Promise<void> {
  const rows = getPayingDetections()
  if (rows.length === 0) return
  logger.info(`[pipeline] Reconciling ${rows.length} stuck 'paying' detections from prior run`)

  for (const row of rows) {
    if (!row.matchedPhotoHash) {
      logger.warn(`[pipeline] Detection ${row.id} stuck in 'paying' with no matchedPhotoHash — rolling back`)
      updateDetection(row.id, { status: 'verified' })
      continue
    }
    try {
      const charged = await isAlreadyChargedOnChain(row.matchedPhotoHash, row.pageUrl)
      if (charged) {
        logger.info(`[pipeline] Detection ${row.id}: charged on-chain, settling as paid`)
        updateDetection(row.id, { status: 'paid' })
      } else {
        logger.info(`[pipeline] Detection ${row.id}: not charged on-chain, rolling back to verified`)
        updateDetection(row.id, { status: 'verified' })
      }
    } catch (err) {
      logger.warn({ err }, `[pipeline] Reconcile probe failed for detection ${row.id} — leaving as 'paying' for next boot`)
    }
  }
}

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
          // Upsert into registered_photos *now* so the ledger indexer (which
          // runs later in the same tick) can resolve the photographer. Without
          // this, ledger rows can land with photographer=null when syncRegisteredPhotos
          // is rate-limit-lagging behind — and the photographer dashboard then
          // shows $0 earned even though the on-chain payment succeeded.
          upsertRegisteredPhoto({
            photoHash: imageHash,
            owner: photo.owner,
            timestamp: photo.timestamp,
            pHash,
          })
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
    if (!licensePrice) {
      logger.info(`[pipeline] Detection ${row.id}: no license price for use="${useType}" on photo ${row.matchedPhotoHash} — falling through to DMCA`)
    } else {
      let publisherAddress: string | null = null
      try {
        const domain = new URL(row.pageUrl).hostname
        publisherAddress = await getPublisherForDomain(domain)
        if (!publisherAddress) {
          logger.info(`[pipeline] Detection ${row.id}: domain "${domain}" not claimed by any publisher — falling through to DMCA. Have a publisher run claimDomain("${domain}") to enable auto-pay.`)
        } else {
          const balance = await getPublisherBalance(publisherAddress)
          if (balance < licensePrice) {
            logger.info(`[pipeline] Detection ${row.id}: publisher ${publisherAddress} balance ${balance} < price ${licensePrice} — falling through to DMCA. Top up escrow to enable auto-pay.`)
          } else {
            // Record intent BEFORE the tx. If the agent crashes between here and
            // the `paid` update, the boot-time reconciler will check the on-chain
            // chargedFor guard and resolve to 'paid' (if the tx mined) or back to
            // 'verified' (if it didn't). The contract guard prevents double-charge
            // even if the reconciler is wrong.
            updateDetection(row.id, { status: 'paying', publisherAddress })
            const txHash = await executePayment(publisherAddress, row.matchedPhotoHash, licensePrice, row.pageUrl, row.ownerWallet, useType)
            logger.info(`[pipeline] Detection ${row.id}: PAID ${licensePrice} from ${publisherAddress} for ${row.pageUrl} — tx: ${txHash}`)
            updateDetection(row.id, { status: 'paid', txHash })
            continue
          }
        }
      } catch (err) {
        logger.warn({ err, publisherAddress }, `[pipeline] Payment failed for detection ${row.id}`)
        // Tx may have mined despite the local error (e.g. lost receipt). Probe the
        // on-chain guard. If charged, settle as 'paid' without txHash (we lost it).
        // If not charged or the probe also fails, roll back to 'verified' — the
        // contract guard ensures a retry can't double-charge.
        let settled = false
        if (row.matchedPhotoHash) {
          try {
            if (await isAlreadyChargedOnChain(row.matchedPhotoHash, row.pageUrl)) {
              logger.info(`[pipeline] Reconciled detection ${row.id}: charged on-chain, marking paid`)
              updateDetection(row.id, { status: 'paid' })
              settled = true
            }
          } catch { /* probe failed — leave for boot reconciler */ }
        }
        if (!settled) updateDetection(row.id, { status: 'verified' })
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
