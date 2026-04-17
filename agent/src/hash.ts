import sharp from 'sharp'
import crypto from 'crypto'

export async function computePHash(buffer: Buffer): Promise<string> {
  const { data } = await sharp(buffer)
    .resize(8, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const pixels = Array.from(data as Uint8Array)
  const mean = pixels.reduce((a, b) => a + b, 0) / 64
  const bits = pixels.map(p => (p > mean ? 1 : 0))

  let hex = ''
  for (let i = 0; i < 64; i += 4) {
    const nibble = (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3]
    hex += nibble.toString(16)
  }
  return hex
}

export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Infinity
  let dist = 0
  for (let i = 0; i < a.length; i++) {
    const xor = parseInt(a[i], 16) ^ parseInt(b[i], 16)
    dist += xor.toString(2).split('').filter(bit => bit === '1').length
  }
  return dist
}

export function computeImageHash(buffer: Buffer): string {
  return '0x' + crypto.createHash('sha256').update(buffer).digest('hex')
}
