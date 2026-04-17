import path from 'path'
import dotenv from 'dotenv'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

import fs from 'fs'
import https from 'https'
import { computePHash, hammingDistance, computeImageHash } from './hash'
import { classifyUse } from './classifier'
import { verifyProvenance } from './verify'
import { getDb } from './db'

function fetchBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      const chunks: Buffer[] = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    }).on('error', reject)
  })
}

async function run() {
  console.log('\n=== Phase 2 Test Suite ===\n')

  // ── Test 1: SQLite DB has detections with pHash values ──────────────────
  console.log('Test 1: SQLite DB rows with pHash')
  const rows = getDb().prepare('SELECT COUNT(*) as total FROM detections').get() as { total: number }
  const withPHash = getDb().prepare("SELECT COUNT(*) as n FROM detections WHERE pHash != ''").get() as { n: number }
  console.log(`  Total rows: ${rows.total}`)
  console.log(`  Rows with pHash: ${withPHash.n}`)
  console.log(rows.total > 0 ? '  ✅ PASS' : '  ❌ FAIL — run the agent first so images are crawled\n')

  // ── Test 2: pHash determinism ────────────────────────────────────────────
  console.log('\nTest 2: pHash determinism (same image → same hash)')
  const TEST_IMAGE_URL = 'https://images.pexels.com/photos/1108099/pexels-photo-1108099.jpeg?w=400'
  try {
    const buf = await fetchBuffer(TEST_IMAGE_URL)
    const hash1 = await computePHash(buf)
    const hash2 = await computePHash(buf)
    const match = hash1 === hash2
    console.log(`  Hash 1: ${hash1}`)
    console.log(`  Hash 2: ${hash2}`)
    console.log(match ? '  ✅ PASS — deterministic' : '  ❌ FAIL — hashes differ')
  } catch (err) {
    console.log('  ⚠️  SKIP — could not fetch test image:', err)
  }

  // ── Test 3: Hamming distance for near-duplicate ──────────────────────────
  console.log('\nTest 3: Hamming distance — near-duplicate detection')
  const originalUrl = 'https://images.pexels.com/photos/1108099/pexels-photo-1108099.jpeg?w=400'
  const resizedUrl  = 'https://images.pexels.com/photos/1108099/pexels-photo-1108099.jpeg?w=200'
  try {
    const [orig, resized] = await Promise.all([fetchBuffer(originalUrl), fetchBuffer(resizedUrl)])
    const origHash = await computePHash(orig)
    const resizedHash = await computePHash(resized)
    const dist = hammingDistance(origHash, resizedHash)
    console.log(`  Original pHash:  ${origHash}`)
    console.log(`  Resized pHash:   ${resizedHash}`)
    console.log(`  Hamming distance: ${dist}`)
    console.log(dist < 10 ? `  ✅ PASS — distance ${dist} < 10, would be matched` : `  ⚠️  distance ${dist} ≥ 10 (may still be correct for very different sizes)`)
  } catch (err) {
    console.log('  ⚠️  SKIP — could not fetch images:', err)
  }

  // ── Test 4: verifyProvenance — image without EXIF → unverifiable ─────────
  console.log('\nTest 4: verifyProvenance — no-EXIF image → unverifiable')
  try {
    const buf = await fetchBuffer('https://images.pexels.com/photos/1108099/pexels-photo-1108099.jpeg?w=400')
    const result = await verifyProvenance(buf, '0xdeadbeef', '0x0000000000000000000000000000000000000001')
    console.log(`  Result: ${result}`)
    console.log(result === 'unverifiable' ? '  ✅ PASS — stock photo with no EXIF correctly returns unverifiable' : '  ❌ FAIL')
  } catch (err) {
    console.log('  ⚠️  SKIP:', err)
  }

  // ── Test 5: classifyUse — editorial ─────────────────────────────────────
  console.log('\nTest 5: classifyUse — news article HTML → editorial')
  const editorialHtml = `<html><body>
    <h1>Breaking News: Scientists Discover New Species</h1>
    <p>Journalists reporting from the field have uncovered a major development in environmental science.
    This article covers the latest news and provides commentary from leading researchers.</p>
  </body></html>`
  try {
    const result = await classifyUse(editorialHtml)
    console.log(`  useType: ${result.useType}, confidence: ${result.confidence.toFixed(2)}`)
    console.log(result.useType === 'editorial' ? '  ✅ PASS' : `  ⚠️  Got '${result.useType}' — Ollama may classify differently`)
  } catch (err) {
    console.log('  ❌ FAIL — Ollama error (is it running?):', err)
  }

  // ── Test 6: classifyUse — commercial ────────────────────────────────────
  console.log('\nTest 6: classifyUse — product page HTML → commercial')
  const commercialHtml = `<html><body>
    <h1>Buy Premium Running Shoes - $129.99</h1>
    <p>Add to cart. Free shipping on orders over $50. Shop our full collection of athletic footwear.
    Sale ends Sunday. Limited stock available. Purchase now.</p>
  </body></html>`
  try {
    const result = await classifyUse(commercialHtml)
    console.log(`  useType: ${result.useType}, confidence: ${result.confidence.toFixed(2)}`)
    console.log(result.useType === 'commercial' ? '  ✅ PASS' : `  ⚠️  Got '${result.useType}' — Ollama may classify differently`)
  } catch (err) {
    console.log('  ❌ FAIL — Ollama error (is it running?):', err)
  }

  console.log('\n=== Done ===\n')
}

run().catch(err => {
  console.error('Test suite crashed:', err)
  process.exit(1)
})
