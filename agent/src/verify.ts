import exifr from 'exifr'
import crypto from 'crypto'
import { encodeMetadata } from '../../shared/encoding'
import { checkLicense } from './registry'

export async function verifyProvenance(
  imageBuffer: Buffer,
  onChainMetadataHash: string,
  ownerWallet: string
): Promise<'verified' | 'unverifiable'> {
  try {
    const exif = await exifr.parse(imageBuffer, {
      pick: ['DateTimeOriginal', 'GPSLatitude', 'GPSLongitude'],
    })

    if (!exif?.DateTimeOriginal || exif.GPSLatitude == null || exif.GPSLongitude == null) {
      return 'unverifiable'
    }

    const timestamp = (exif.DateTimeOriginal as Date).toISOString()
    const lat = exif.GPSLatitude as number
    const lng = exif.GPSLongitude as number

    const encoded = encodeMetadata(timestamp, lat, lng, ownerWallet)
    const recomputed = '0x' + crypto.createHash('sha256').update(encoded).digest('hex')

    return recomputed === onChainMetadataHash ? 'verified' : 'unverifiable'
  } catch {
    return 'unverifiable'
  }
}

export async function isAlreadyLicensed(photoHash: string, pageUrl: string): Promise<boolean> {
  return checkLicense(photoHash, pageUrl)
}
