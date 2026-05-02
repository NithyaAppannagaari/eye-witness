export type DetectionStatus =
  | 'pending'
  | 'no_match'
  | 'matched'
  | 'already_licensed'
  | 'verified'
  | 'unverifiable'
  | 'paying'
  | 'paid'
  | 'dmca_sent'

export interface DetectionRow {
  id: number
  pageUrl: string
  imageUrl: string
  pHash: string
  matchedPhotoHash: string | null
  ownerWallet: string | null
  useType: string | null
  licensePrice: bigint | null
  disputeId: number | null
  publisherAddress: string | null
  txHash: string | null
  status: DetectionStatus
  createdAt: string
  dmcaSentAt: string | null
  resolvedAt: string | null
  dmcaEmail: string | null
}

export interface RegisteredPhoto {
  photoHash: string
  owner: string
  timestamp: bigint
  pHash: string | null
}

// One row per on-chain PaymentDrawn event indexed by the agent. Source of truth
// for all "money flow" UI. Note: photographer + useType come from the LicenseMinted
// event in the same tx, joined at index time. amount is 6-decimal USDC as a string.
export interface LedgerEntry {
  id: number
  txHash: string
  logIndex: number
  blockNumber: number
  photoId: string
  publisher: string
  photographer: string | null
  pageUrl: string
  amount: bigint
  useType: string | null
  blockTimestamp: number | null
  createdAt: string
}
