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
      console.log('[verify] Missing EXIF fields — DateTimeOriginal:', exif?.DateTimeOriginal, 'lat:', exif?.GPSLatitude, 'lng:', exif?.GPSLongitude)
      return 'unverifiable'
    }

    const timestamp = exif.DateTimeOriginal instanceof Date
      ? exif.DateTimeOriginal.toISOString()
      : String(exif.DateTimeOriginal)

    // Handle both decimal and DMS-array formats (mirrors frontend PhotoUpload logic)
    const lat = Array.isArray(exif.GPSLatitude)
      ? exif.GPSLatitude[0] + exif.GPSLatitude[1] / 60 + exif.GPSLatitude[2] / 3600
      : exif.GPSLatitude as number
    const lng = Array.isArray(exif.GPSLongitude)
      ? exif.GPSLongitude[0] + exif.GPSLongitude[1] / 60 + exif.GPSLongitude[2] / 3600
      : exif.GPSLongitude as number

    const encoded = encodeMetadata(timestamp, lat, lng, ownerWallet)
    const recomputed = '0x' + crypto.createHash('sha256').update(encoded).digest('hex')

    console.log('[verify] recomputed:', recomputed)
    console.log('[verify] on-chain: ', onChainMetadataHash)

    return recomputed === onChainMetadataHash ? 'verified' : 'unverifiable'
  } catch (err) {
    console.error('[verify] Error:', err)
    return 'unverifiable'
  }
}

export async function isAlreadyLicensed(photoHash: string, pageUrl: string): Promise<boolean> {
  return checkLicense(photoHash, pageUrl)
}
