import path from 'path'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import fs from 'fs'
import sgMail from '@sendgrid/mail'

interface HostingProvider {
  domain: string
  email: string
}

const PROVIDERS_PATH = path.resolve(__dirname, '../hostingProviders.json')

function loadProviders(): HostingProvider[] {
  try {
    return JSON.parse(fs.readFileSync(PROVIDERS_PATH, 'utf-8')) as HostingProvider[]
  } catch {
    console.warn('[dmca] Could not load hostingProviders.json')
    return []
  }
}

export function identifyHost(hostname: string): string | null {
  const providers = loadProviders()
  for (const p of providers) {
    if (hostname === p.domain || hostname.endsWith(`.${p.domain}`)) {
      return p.email
    }
  }
  return null
}

export function generateNotice(params: {
  photoHash: string
  pageUrl: string
  ownerWallet: string
  useType: string
}): string {
  const { photoHash, pageUrl, ownerWallet, useType } = params
  const date = new Date().toUTCString()
  return `DMCA Takedown Notice
Date: ${date}

To Whom It May Concern,

I am the authorized enforcement agent for the copyright owner of the photographic work identified below. I have a good-faith belief that the material listed below is being used in a manner not authorized by the copyright owner, its agent, or the law (17 U.S.C. § 512(c)(3)).

Infringing Material:
  URL: ${pageUrl}
  Use Type Detected: ${useType}

Original Work (On-Chain Registration):
  Photo Hash (SHA-256): ${photoHash}
  Owner Wallet: ${ownerWallet}
  Registry: Ethereum Sepolia — Eye:Witness Protocol (0xFdFE4b312B8f17120C301D1719bB775dB953bD5C)

This photo is registered on-chain with immutable provenance. Automated detection has classified the usage as "${useType}", which is not permitted under the photographer's license terms.

I request that you immediately remove or disable access to the infringing material identified above.

I swear, under penalty of perjury, that the information in this notification is accurate and that I am authorized to act on behalf of the copyright owner.

Eye:Witness Automated Enforcement Agent
On behalf of: ${ownerWallet}
`
}

export function generateWithdrawalNotice(params: {
  photoHash: string
  pageUrl: string
  ownerWallet: string
}): string {
  const { photoHash, pageUrl, ownerWallet } = params
  const date = new Date().toUTCString()
  return `DMCA Takedown Withdrawal Notice
Date: ${date}

To Whom It May Concern,

We are writing to inform you that the DMCA takedown notice previously submitted regarding the content at the URL below has been resolved. The copyright owner has received a valid license for the use, and the takedown request is hereby withdrawn.

Previously Disputed URL: ${pageUrl}
Photo Hash: ${photoHash}
Owner Wallet: ${ownerWallet}

No further action is required on your part regarding this matter.

Eye:Witness Automated Enforcement Agent
On behalf of: ${ownerWallet}
`
}

export async function sendNotice(toEmail: string, noticeText: string, photoHash: string): Promise<void> {
  const apiKey = process.env.SENDGRID_API_KEY
  const fromEmail = process.env.SENDGRID_FROM_EMAIL

  if (!apiKey || !fromEmail) {
    console.warn('[dmca] SENDGRID_API_KEY or SENDGRID_FROM_EMAIL not set — logging notice only')
    console.log('[dmca] Notice text:\n', noticeText)
    return
  }

  sgMail.setApiKey(apiKey)
  await sgMail.send({
    to: toEmail,
    from: fromEmail,
    subject: `DMCA Takedown Notice — Photo ${photoHash.slice(0, 10)}`,
    text: noticeText,
  })
  console.log(`[dmca] Notice sent to ${toEmail}`)
}
