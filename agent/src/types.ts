export type DetectionStatus =
  | 'pending'
  | 'no_match'
  | 'matched'
  | 'already_licensed'
  | 'verified'
  | 'unverifiable'
  | 'classified'
  | 'blocked_category'
  | 'paid'
  | 'awaiting_enforcement'
  | 'dmca_sent'
  | 'resolved'

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
