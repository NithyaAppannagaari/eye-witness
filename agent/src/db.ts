import Database from 'better-sqlite3'
import path from 'path'
import { DetectionRow, RegisteredPhoto } from './types'

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
  `)

  // Migrate existing tables — ALTER TABLE ignores "already exists" errors
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

export function getDetectionByUrl(imageUrl: string): DetectionRow | undefined {
  return getDb()
    .prepare('SELECT * FROM detections WHERE imageUrl = ?')
    .get(imageUrl) as DetectionRow | undefined
}

export function getPendingDetections(): DetectionRow[] {
  return getDb()
    .prepare("SELECT * FROM detections WHERE status = 'pending'")
    .all() as DetectionRow[]
}

export function getMatchedDetections(): DetectionRow[] {
  return getDb()
    .prepare("SELECT * FROM detections WHERE status = 'matched'")
    .all() as DetectionRow[]
}

export function getVerifiedDetections(): DetectionRow[] {
  return getDb()
    .prepare("SELECT * FROM detections WHERE status = 'verified'")
    .all() as DetectionRow[]
}

export function getClassifiedDetections(): DetectionRow[] {
  return getDb()
    .prepare("SELECT * FROM detections WHERE status = 'classified'")
    .all() as DetectionRow[]
}

export function getAwaitingEnforcement(): DetectionRow[] {
  return getDb()
    .prepare("SELECT * FROM detections WHERE status = 'awaiting_enforcement'")
    .all() as DetectionRow[]
}

export function getBlockedCategory(): DetectionRow[] {
  return getDb()
    .prepare("SELECT * FROM detections WHERE status = 'blocked_category'")
    .all() as DetectionRow[]
}

export function resetDetectionsForTargets(targets: string[]): void {
  if (targets.length === 0) return
  const placeholders = targets.map(() => '?').join(', ')
  getDb()
    .prepare(`DELETE FROM detections WHERE pageUrl IN (${placeholders})`)
    .run(targets)
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
