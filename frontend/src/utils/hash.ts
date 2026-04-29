function encodeMetadata(timestamp: string, lat: number, lng: number, wallet: string): Uint8Array {
  return new TextEncoder().encode(`${timestamp}|${lat}|${lng}|${wallet.toLowerCase()}`)
}

export async function computeImageHash(buffer: ArrayBuffer): Promise<`0x${string}`> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return bufferToHex(hashBuffer);
}

export async function computeMetadataHash(
  timestamp: string,
  lat: number,
  lng: number,
  wallet: string
): Promise<`0x${string}`> {
  const encoded = encodeMetadata(timestamp, lat, lng, wallet);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded as BufferSource);
  return bufferToHex(hashBuffer);
}

function bufferToHex(buffer: ArrayBuffer): `0x${string}` {
  const byteArray = new Uint8Array(buffer);
  const hex = Array.from(byteArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}`;
}
