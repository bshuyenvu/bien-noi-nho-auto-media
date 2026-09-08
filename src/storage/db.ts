import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_PATH=process.env.DB_PATH||'data/auto-media.sqlite';
mkdirSync(dirname(DB_PATH),{recursive:true});
export const db=new DatabaseSync(DB_PATH);

db.exec(`
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS drafts (id TEXT PRIMARY KEY,title TEXT NOT NULL,body TEXT NOT NULL,source_url TEXT,source_name TEXT,image_url TEXT,format TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rss_sources (id TEXT PRIMARY KEY,name TEXT NOT NULL,url TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL,last_scan_at TEXT,last_error TEXT);
CREATE TABLE IF NOT EXISTS rss_items (id TEXT PRIMARY KEY,source_id TEXT NOT NULL,source_name TEXT NOT NULL,title TEXT NOT NULL,link TEXT NOT NULL UNIQUE,published_at TEXT,discovered_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS render_jobs (id TEXT PRIMARY KEY,draft_id TEXT NOT NULL,status TEXT NOT NULL,progress INTEGER NOT NULL DEFAULT 0,output TEXT,error TEXT,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY,clerk_user_id TEXT NOT NULL UNIQUE,email TEXT,role TEXT NOT NULL DEFAULT 'member',plan TEXT NOT NULL DEFAULT 'free',status TEXT NOT NULL DEFAULT 'active',created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS channels (id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,name TEXT NOT NULL,tagline TEXT,logo_url TEXT,primary_color TEXT NOT NULL DEFAULT '#075bc7',secondary_color TEXT NOT NULL DEFAULT '#061426',is_default INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS api_keys (id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,name TEXT NOT NULL,key_prefix TEXT NOT NULL,key_hash TEXT NOT NULL UNIQUE,last_used_at TEXT,revoked_at TEXT,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_channels_owner ON channels(owner_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_owner ON api_keys(owner_id);
CREATE TABLE IF NOT EXISTS autopilot_items (source_url TEXT PRIMARY KEY,status TEXT NOT NULL,draft_id TEXT,job_id TEXT,error TEXT,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS publish_jobs (id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,render_job_id TEXT NOT NULL,draft_id TEXT NOT NULL,platform TEXT NOT NULL,status TEXT NOT NULL,title TEXT NOT NULL,description TEXT,scheduled_at TEXT,published_at TEXT,remote_id TEXT,remote_url TEXT,error TEXT,attempts INTEGER NOT NULL DEFAULT 0,max_attempts INTEGER NOT NULL DEFAULT 3,dry_run INTEGER NOT NULL DEFAULT 1,deployment_test INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_publish_jobs_owner ON publish_jobs(owner_id);
CREATE INDEX IF NOT EXISTS idx_publish_jobs_status_schedule ON publish_jobs(status,scheduled_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_publish_jobs_unique_target ON publish_jobs(owner_id,render_job_id,platform) WHERE status NOT IN ('cancelled','failed');
CREATE TABLE IF NOT EXISTS publish_credentials (id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,platform TEXT NOT NULL,account_label TEXT NOT NULL,secret_encrypted TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(owner_id,platform));
CREATE INDEX IF NOT EXISTS idx_publish_credentials_owner ON publish_credentials(owner_id);
CREATE TABLE IF NOT EXISTS system_incidents (id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,incident_key TEXT NOT NULL,component TEXT NOT NULL,severity TEXT NOT NULL,message TEXT NOT NULL,metadata_json TEXT,opened_at TEXT NOT NULL,last_seen_at TEXT NOT NULL,resolved_at TEXT,acknowledged_at TEXT,acknowledged_by TEXT,ack_note TEXT,silenced_until TEXT,silenced_by TEXT,silence_reason TEXT);
CREATE INDEX IF NOT EXISTS idx_system_incidents_owner_seen ON system_incidents(owner_id,last_seen_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_system_incidents_active_key ON system_incidents(owner_id,incident_key) WHERE resolved_at IS NULL;
CREATE TABLE IF NOT EXISTS system_runtime_state (state_key TEXT PRIMARY KEY,value_json TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS system_alert_deliveries (id TEXT PRIMARY KEY,incident_id TEXT NOT NULL,owner_id TEXT NOT NULL,channel TEXT NOT NULL,kind TEXT NOT NULL,severity TEXT NOT NULL,status TEXT NOT NULL,error TEXT,sent_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_system_alert_incident_channel ON system_alert_deliveries(incident_id,channel,sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_alert_sent ON system_alert_deliveries(sent_at DESC);
CREATE TABLE IF NOT EXISTS system_maintenance_windows (id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,reason TEXT NOT NULL,created_by TEXT NOT NULL,started_at TEXT NOT NULL,ends_at TEXT NOT NULL,ended_at TEXT);
CREATE INDEX IF NOT EXISTS idx_system_maintenance_active ON system_maintenance_windows(ended_at,ends_at DESC);
`);
try{db.exec('ALTER TABLE rss_sources ADD COLUMN locked INTEGER NOT NULL DEFAULT 0')}catch{}
try{db.exec('ALTER TABLE rss_sources ADD COLUMN managed INTEGER NOT NULL DEFAULT 0')}catch{}
try{db.exec('ALTER TABLE rss_items ADD COLUMN summary TEXT')}catch{}
try{db.exec('ALTER TABLE rss_items ADD COLUMN image_url TEXT')}catch{}
try{db.exec('ALTER TABLE drafts ADD COLUMN owner_id TEXT')}catch{}
try{db.exec('ALTER TABLE render_jobs ADD COLUMN owner_id TEXT')}catch{}
try{db.exec('ALTER TABLE render_jobs ADD COLUMN payload_json TEXT')}catch{}
try{db.exec('ALTER TABLE render_jobs ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0')}catch{}
try{db.exec('ALTER TABLE render_jobs ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 3')}catch{}
try{db.exec('ALTER TABLE render_jobs ADD COLUMN next_attempt_at TEXT')}catch{}
try{db.exec('ALTER TABLE render_jobs ADD COLUMN updated_at TEXT')}catch{}
try{db.exec('ALTER TABLE render_jobs ADD COLUMN checkpoint_stage TEXT')}catch{}
try{db.exec('ALTER TABLE render_jobs ADD COLUMN interrupted_at TEXT')}catch{}
try{db.exec('ALTER TABLE publish_jobs ADD COLUMN deployment_test INTEGER NOT NULL DEFAULT 0')}catch{}
try{db.exec('ALTER TABLE rss_sources ADD COLUMN owner_id TEXT')}catch{}
try{db.exec('ALTER TABLE rss_items ADD COLUMN owner_id TEXT')}catch{}
try{db.exec('ALTER TABLE accounts ADD COLUMN daily_limit INTEGER')}catch{}
try{db.exec('ALTER TABLE accounts ADD COLUMN total_limit INTEGER')}catch{}
try{db.exec('ALTER TABLE system_incidents ADD COLUMN acknowledged_at TEXT')}catch{}
try{db.exec('ALTER TABLE system_incidents ADD COLUMN acknowledged_by TEXT')}catch{}
try{db.exec('ALTER TABLE system_incidents ADD COLUMN ack_note TEXT')}catch{}
try{db.exec('ALTER TABLE system_incidents ADD COLUMN silenced_until TEXT')}catch{}
try{db.exec('ALTER TABLE system_incidents ADD COLUMN silenced_by TEXT')}catch{}
try{db.exec('ALTER TABLE system_incidents ADD COLUMN silence_reason TEXT')}catch{}
try{db.exec("UPDATE drafts SET owner_id='legacy-admin' WHERE owner_id IS NULL")}catch{}
try{db.exec("UPDATE render_jobs SET owner_id='legacy-admin' WHERE owner_id IS NULL")}catch{}
try{db.exec("UPDATE render_jobs SET updated_at=created_at WHERE updated_at IS NULL")}catch{}
try{db.exec("UPDATE rss_sources SET owner_id='legacy-admin' WHERE owner_id IS NULL")}catch{}
try{db.exec("UPDATE rss_items SET owner_id='legacy-admin' WHERE owner_id IS NULL")}catch{}
try{db.exec('CREATE INDEX IF NOT EXISTS idx_drafts_owner ON drafts(owner_id)')}catch{}
try{db.exec('CREATE INDEX IF NOT EXISTS idx_render_jobs_owner ON render_jobs(owner_id)')}catch{}
try{db.exec('CREATE INDEX IF NOT EXISTS idx_render_jobs_status_next ON render_jobs(status,next_attempt_at)')}catch{}
db.exec(`CREATE TABLE IF NOT EXISTS rss_items_tenant (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, source_id TEXT NOT NULL, source_name TEXT NOT NULL,title TEXT NOT NULL, link TEXT NOT NULL, summary TEXT, image_url TEXT, published_at TEXT, discovered_at TEXT NOT NULL,UNIQUE(owner_id,link))`);
db.exec(`CREATE TABLE IF NOT EXISTS rss_sources_tenant (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, url TEXT NOT NULL,created_at TEXT NOT NULL, last_scan_at TEXT, last_error TEXT, locked INTEGER NOT NULL DEFAULT 0,managed INTEGER NOT NULL DEFAULT 0, UNIQUE(owner_id,url))`);
try{db.exec("INSERT OR IGNORE INTO rss_sources_tenant(id,owner_id,name,url,created_at,last_scan_at,last_error,locked,managed) SELECT id,COALESCE(owner_id,'legacy-admin'),name,url,created_at,last_scan_at,last_error,locked,managed FROM rss_sources")}catch{}
try{db.exec("INSERT OR IGNORE INTO rss_items_tenant(id,owner_id,source_id,source_name,title,link,summary,image_url,published_at,discovered_at) SELECT id,COALESCE(owner_id,'legacy-admin'),source_id,source_name,title,link,summary,image_url,published_at,discovered_at FROM rss_items")}catch{}
try{db.exec("UPDATE drafts SET owner_id=(SELECT id FROM accounts WHERE role='admin' ORDER BY created_at LIMIT 1) WHERE owner_id='legacy-admin' AND EXISTS(SELECT 1 FROM accounts WHERE role='admin')")}catch{}
try{db.exec("UPDATE render_jobs SET owner_id=(SELECT id FROM accounts WHERE role='admin' ORDER BY created_at LIMIT 1) WHERE owner_id='legacy-admin' AND EXISTS(SELECT 1 FROM accounts WHERE role='admin')")}catch{}
export function all<T=any>(sql:string,...params:any[]):T[]{return db.prepare(sql).all(...params) as T[];}
export function run(sql:string,...params:any[]){return db.prepare(sql).run(...params);}
