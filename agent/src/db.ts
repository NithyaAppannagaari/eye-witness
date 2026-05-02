import Database from 'better-sqlite3'
import path from 'path'
import { DetectionRow, LedgerEntry, RegisteredPhoto } from './types'

const DB_PATH = path.resolve(__dirname, '../../agent.db')

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH)
    db.pragma('journal_mode = WAL')
    initSchema()
  }
  return db
}

function initSchema() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS detections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pageUrl TEXT NOT NULL,
      imageUrl TEXT NOT NULL UNIQUE,
      pHash TEXT NOT NULL,
      matchedPhotoHash TEXT,
      ownerWallet TEXT,
      useType TEXT,
      licensePrice TEXT,
      disputeId INTEGER,
      publisherAddress TEXT,
      txHash TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      dmcaSentAt TEXT,
      resolvedAt TEXT,
      dmcaEmail TEXT
    );

    CREATE TABLE IF NOT EXISTS registered_photos (
      photoHash TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      pHash TEXT
    );

    -- Indexed mirror of on-chain PaymentDrawn events. Authoritative ledger
    -- for "where did the publisher's money go" / "what did the photographer earn".
    -- Keyed on (txHash, logIndex) so we never insert the same on-chain event twice.
    CREATE TABLE IF NOT EXISTS escrow_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      txHash TEXT NOT NULL,
      logIndex INTEGER NOT NULL,
      blockNumber INTEGER NOT NULL,
      photoId TEXT NOT NULL,
      publisher TEXT NOT NULL,
      photographer TEXT,
      pageUrl TEXT NOT NULL,
      amount TEXT NOT NULL,
      useType TEXT,
      blockTimestamp INTEGER,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(txHash, logIndex)
    );
    CREATE INDEX IF NOT EXISTS idx_ledger_publisher ON escrow_ledger(LOWER(publisher));
    CREATE INDEX IF NOT EXISTS idx_ledger_photographer ON escrow_ledger(LOWER(photographer));
    CREATE INDEX IF NOT EXISTS idx_ledger_photo ON escrow_ledger(photoId);
  `)

  for (const col of ['dmcaSentAt TEXT', 'resolvedAt TEXT', 'dmcaEmail TEXT']) {
    try { getDb().exec(`ALTER TABLE detections ADD COLUMN ${col}`) } catch { /* already exists */ }
  }
}

export function insertDetection(row: Omit<DetectionRow, 'id' | 'createdAt'>): number {
  const stmt = getDb().prepare(`
    INSERT OR IGNORE INTO detections
      (pageUrl, imageUrl, pHash, matchedPhotoHash, ownerWallet, useType, licensePrice, disputeId, status)
    VALUES
      (@pageUrl, @imageUrl, @pHash, @matchedPhotoHash, @ownerWallet, @useType, @licensePrice, @disputeId, @status)
  `)
  const result = stmt.run({
    ...row,
    licensePrice: row.licensePrice?.toString() ?? null,
  })
  return result.lastInsertRowid as number
}

export function updateDetection(id: number, fields: Partial<Omit<DetectionRow, 'id' | 'createdAt'>>): void {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined)
  if (entries.length === 0) return
  const sets = entries.map(([k]) => `${k} = @${k}`).join(', ')
  const params: Record<string, unknown> = { id }
  for (const [k, v] of entries) {
    params[k] = k === 'licensePrice' && typeof v === 'bigint' ? v.toString() : v
  }
  getDb().prepare(`UPDATE detections SET ${sets} WHERE id = @id`).run(params)
}

// licensePrice is stored as TEXT (SQLite has no native bigint). Every read path
// must hydrate the string back to a bigint to match the DetectionRow type, otherwise
// downstream code thinks `licensePrice` is bigint when it's actually a string at runtime.
function hydrateDetection(raw: unknown): DetectionRow {
  const r = raw as Omit<DetectionRow, 'licensePrice'> & { licensePrice: string | null }
  return { ...r, licensePrice: r.licensePrice == null ? null : BigInt(r.licensePrice) }
}

export function getDetectionByUrl(imageUrl: string): DetectionRow | undefined {
  const row = getDb()
    .prepare('SELECT * FROM detections WHERE imageUrl = ?')
    .get(imageUrl)
  return row ? hydrateDetection(row) : undefined
}

export function getPendingDetections(): DetectionRow[] {
  return getDb()
    .prepare("SELECT * FROM detections WHERE status = 'pending'")
    .all()
    .map(hydrateDetection)
}

export function getMatchedDetections(): DetectionRow[] {
  return getDb()
    .prepare("SELECT * FROM detections WHERE status = 'matched'")
    .all()
    .map(hydrateDetection)
}

export function getVerifiedDetections(): DetectionRow[] {
  return getDb()
    .prepare("SELECT * FROM detections WHERE status = 'verified'")
    .all()
    .map(hydrateDetection)
}

// Detections in the limbo state between "intent recorded" and "tx confirmed".
// On agent boot, these need to be reconciled against the on-chain chargedFor guard.
export function getPayingDetections(): DetectionRow[] {
  return getDb()
    .prepare("SELECT * FROM detections WHERE status = 'paying'")
    .all()
    .map(hydrateDetection)
}

export function getDetectionsByWallet(wallet: string): DetectionRow[] {
  return getDb()
    .prepare("SELECT * FROM detections WHERE LOWER(ownerWallet) = ? AND status NOT IN ('pending', 'no_match')")
    .all(wallet.toLowerCase())
    .map(hydrateDetection)
}

export function getDisputesByWallet(wallet: string): DetectionRow[] {
  return getDb()
    .prepare("SELECT * FROM detections WHERE LOWER(ownerWallet) = ? AND status = 'dmca_sent' ORDER BY createdAt DESC")
    .all(wallet.toLowerCase())
    .map(hydrateDetection)
}

// Serialize a DetectionRow for JSON: bigint → string (JSON has no bigint type).
// Clients can re-parse with BigInt() when they need numeric ops.
export function serializeDetection(row: DetectionRow): Record<string, unknown> {
  return { ...row, licensePrice: row.licensePrice == null ? null : row.licensePrice.toString() }
}

export function upsertRegisteredPhoto(photo: RegisteredPhoto): void {
  getDb().prepare(`
    INSERT INTO registered_photos (photoHash, owner, timestamp, pHash)
    VALUES (@photoHash, @owner, @timestamp, @pHash)
    ON CONFLICT(photoHash) DO UPDATE SET
      owner = excluded.owner,
      timestamp = excluded.timestamp,
      pHash = COALESCE(excluded.pHash, registered_photos.pHash)
  `).run({ ...photo, timestamp: Number(photo.timestamp) })
}

export function getAllRegisteredPhotos(): RegisteredPhoto[] {
  return (getDb().prepare('SELECT * FROM registered_photos').all() as Array<{
    photoHash: string; owner: string; timestamp: number; pHash: string | null
  }>).map(r => ({ ...r, timestamp: BigInt(r.timestamp) }))
}

export function updateRegisteredPhotoPHash(photoHash: string, pHash: string): void {
  getDb().prepare('UPDATE registered_photos SET pHash = ? WHERE photoHash = ?').run(pHash, photoHash)
}

export function getLastSyncedBlock(): number | null {
  const row = getDb().prepare("SELECT value FROM meta WHERE key = 'lastSyncedBlock'").get() as { value: string } | undefined
  return row ? parseInt(row.value, 10) : null
}

export function setLastSyncedBlock(block: number): void {
  getDb().prepare("INSERT INTO meta (key, value) VALUES ('lastSyncedBlock', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(block.toString())
}

// --- Ledger ---

export function getLastLedgerBlock(): number | null {
  const row = getDb().prepare("SELECT value FROM meta WHERE key = 'lastLedgerBlock'").get() as { value: string } | undefined
  return row ? parseInt(row.value, 10) : null
}

export function setLastLedgerBlock(block: number): void {
  getDb()
    .prepare("INSERT INTO meta (key, value) VALUES ('lastLedgerBlock', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(block.toString())
}

function hydrateLedger(raw: unknown): LedgerEntry {
  const r = raw as Omit<LedgerEntry, 'amount'> & { amount: string }
  return { ...r, amount: BigInt(r.amount) }
}

function serializeLedgerEntry(entry: LedgerEntry): Record<string, unknown> {
  return { ...entry, amount: entry.amount.toString() }
}

export function insertLedgerEntry(entry: Omit<LedgerEntry, 'id' | 'createdAt'>): boolean {
  const result = getDb().prepare(`
    INSERT OR IGNORE INTO escrow_ledger
      (txHash, logIndex, blockNumber, photoId, publisher, photographer, pageUrl, amount, useType, blockTimestamp)
    VALUES
      (@txHash, @logIndex, @blockNumber, @photoId, @publisher, @photographer, @pageUrl, @amount, @useType, @blockTimestamp)
  `).run({
    ...entry,
    amount: entry.amount.toString(),
  })
  return result.changes > 0
}

export function getLedgerByPublisher(publisher: string): LedgerEntry[] {
  return getDb()
    .prepare('SELECT * FROM escrow_ledger WHERE LOWER(publisher) = ? ORDER BY blockNumber DESC, logIndex DESC')
    .all(publisher.toLowerCase())
    .map(hydrateLedger)
}

export function getLedgerByPhotographer(photographer: string): LedgerEntry[] {
  return getDb()
    .prepare('SELECT * FROM escrow_ledger WHERE LOWER(photographer) = ? ORDER BY blockNumber DESC, logIndex DESC')
    .all(photographer.toLowerCase())
    .map(hydrateLedger)
}

export function getLedgerForPhoto(photoId: string): LedgerEntry[] {
  return getDb()
    .prepare('SELECT * FROM escrow_ledger WHERE photoId = ? ORDER BY blockNumber DESC, logIndex DESC')
    .all(photoId)
    .map(hydrateLedger)
}

// Aggregate: { photoId → totalAmount, count } for a photographer.
// Used by the photographer dashboard to show per-photo earnings without a
// roundtrip per photo.
export function getEarningsByPhotographer(photographer: string): Map<string, { total: bigint; count: number }> {
  const rows = getDb()
    .prepare(`
      SELECT photoId, SUM(CAST(amount AS INTEGER)) as total, COUNT(*) as count
      FROM escrow_ledger
      WHERE LOWER(photographer) = ?
      GROUP BY photoId
    `)
    .all(photographer.toLowerCase()) as Array<{ photoId: string; total: number | string; count: number }>

  const map = new Map<string, { total: bigint; count: number }>()
  for (const r of rows) {
    map.set(r.photoId, { total: BigInt(r.total ?? 0), count: r.count })
  }
  return map
}

export function getRegisteredPhotosByOwner(owner: string): RegisteredPhoto[] {
  return (getDb()
    .prepare('SELECT * FROM registered_photos WHERE LOWER(owner) = ? ORDER BY timestamp DESC')
    .all(owner.toLowerCase()) as Array<{ photoHash: string; owner: string; timestamp: number; pHash: string | null }>)
    .map(r => ({ ...r, timestamp: BigInt(r.timestamp) }))
}

export { serializeLedgerEntry }
