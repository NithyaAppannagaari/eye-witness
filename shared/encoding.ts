export function encodeMetadata(
  timestamp: string,
  lat: number,
  lng: number,
  wallet: string
): Uint8Array {
  return new TextEncoder().encode(
    `${timestamp}|${lat}|${lng}|${wallet.toLowerCase()}`
  )
}
