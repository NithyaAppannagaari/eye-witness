export type DetectionStatus =
  | 'pending'
  | 'no_match'
  | 'matched'
  | 'already_licensed'
  | 'verified'
  | 'unverifiable'
  | 'classified'
  | 'blocked_category'

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
  status: DetectionStatus
  createdAt: string
}

export interface RegisteredPhoto {
  photoHash: string
  owner: string
  timestamp: bigint
  pHash: string | null
}
