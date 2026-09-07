import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_PATH=process.env.DB_PATH||'data/auto-media.sqlite';
mkdirSync(dirname(DB_PATH),{recursive:true});
export const db=new DatabaseSync(DB_PATH);

db.exec(`
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS drafts (
 id TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 body TEXT NOT NULL,
 source_url TEXT,
 source_name TEXT,
 image_url TEXT,
 format TEXT NOT NULL,
 status TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rss_sources (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 url TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL,
 last_scan_at TEXT,
 last_error TEXT
);
CREATE TABLE IF NOT EXISTS rss_items (
 id TEXT PRIMARY KEY,
 source_id TEXT NOT NULL,
 source_name TEXT NOT NULL,
 title TEXT NOT NULL,
 link TEXT NOT NULL UNIQUE,
 published_at TEXT,
 discovered_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS render_jobs (
 id TEXT PRIMARY KEY,
 draft_id TEXT NOT NULL,
 status TEXT NOT NULL,
 progress INTEGER NOT NULL DEFAULT 0,
 output TEXT,
 error TEXT,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS autopilot_items (
 source_url TEXT PRIMARY KEY,
 status TEXT NOT NULL,
 draft_id TEXT,
 job_id TEXT,
 error TEXT,
 updated_at TEXT NOT NULL
);
`);

try{db.exec('ALTER TABLE rss_sources ADD COLUMN locked INTEGER NOT NULL DEFAULT 0')}catch{}
try{db.exec('ALTER TABLE rss_sources ADD COLUMN managed INTEGER NOT NULL DEFAULT 0')}catch{}

export function all<T=any>(sql:string,...params:any[]):T[]{return db.prepare(sql).all(...params) as T[];}
export function run(sql:string,...params:any[]){return db.prepare(sql).run(...params);}
