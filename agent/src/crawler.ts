import puppeteer from 'puppeteer'
import { insertDetection, getDetectionByUrl } from './db'
import { computePHash } from './hash'

interface CrawledImage {
  pageUrl: string
  imageUrl: string
  buffer: Buffer
  pageHtml: string
}

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.startsWith('image/')) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

function resolveUrl(src: string, base: string): string | null {
  try {
    return new URL(src, base).href
  } catch {
    return null
  }
}

export async function crawlPage(pageUrl: string): Promise<CrawledImage[]> {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.setUserAgent(
    'Mozilla/5.0 (compatible; EyeWitnessBot/1.0; +https://eyewitness.xyz/bot)'
  )

  try {
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    const pageHtml = await page.content()

    const rawSrcs: string[] = await page.evaluate(() => {
      const urls: string[] = []
      document.querySelectorAll('img[src]').forEach(el => {
        const src = (el as HTMLImageElement).src
        if (src) urls.push(src)
      })
      document.querySelectorAll('*').forEach(el => {
        const bg = window.getComputedStyle(el).backgroundImage
        const match = bg.match(/url\(["']?([^"')]+)["']?\)/)
        if (match) urls.push(match[1])
      })
      return urls
    })

    const results: CrawledImage[] = []

    for (const raw of rawSrcs) {
      const imageUrl = resolveUrl(raw, pageUrl)
      if (!imageUrl) continue
      if (getDetectionByUrl(imageUrl)) continue // already processed

      const buffer = await fetchImageBuffer(imageUrl)
      if (!buffer || buffer.length < 1024) continue // skip tiny images

      results.push({ pageUrl, imageUrl, buffer, pageHtml })
    }

    return results
  } finally {
    await browser.close()
  }
}

function isDirectImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|webp|gif)(\?.*)?$/i.test(url)
}

export async function crawlAndInsert(targets: string[]): Promise<void> {
  for (const target of targets) {
    console.log(`[crawler] Crawling ${target}`)
    try {
      let images: CrawledImage[]

      if (isDirectImageUrl(target)) {
        // Direct image URL — fetch buffer directly, skip Puppeteer
        const buffer = await fetchImageBuffer(target)
        if (!buffer || buffer.length < 1024) {
          console.log(`[crawler] Could not fetch image at ${target}`)
          continue
        }
        images = getDetectionByUrl(target)
          ? []
          : [{ pageUrl: target, imageUrl: target, buffer, pageHtml: '' }]
      } else {
        images = await crawlPage(target)
      }

      console.log(`[crawler] Found ${images.length} new images on ${target}`)

      for (const img of images) {
        try {
          const pHash = await computePHash(img.buffer)
          insertDetection({
            pageUrl: img.pageUrl,
            imageUrl: img.imageUrl,
            pHash,
            matchedPhotoHash: null,
            ownerWallet: null,
            useType: null,
            licensePrice: null,
            disputeId: null,
            status: 'pending',
          })
        } catch (err) {
          console.warn(`[crawler] Failed to process image ${img.imageUrl}:`, err)
        }
      }
    } catch (err) {
      console.error(`[crawler] Failed to crawl ${target}:`, err)
    }
  }
}
