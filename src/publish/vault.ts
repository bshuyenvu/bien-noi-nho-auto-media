import { createCipheriv,createDecipheriv,createHash,randomBytes } from 'node:crypto';
import { all,run } from '../storage/db.js';
import type { PublishCredential } from './providers.js';
import type { PublishPlatform } from './queue.js';

function key(){const raw=process.env.CREDENTIAL_VAULT_KEY;if(!raw)throw new Error('CREDENTIAL_VAULT_KEY chưa được cấu hình');return createHash('sha256').update(raw).digest()}
function encrypt(value:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv),body=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]),tag=cipher.getAuthTag();return Buffer.concat([iv,tag,body]).toString('base64')}
function decrypt(value:string){const buf=Buffer.from(value,'base64'),iv=buf.subarray(0,12),tag=buf.subarray(12,28),body=buf.subarray(28),dec=createDecipheriv('aes-256-gcm',key(),iv);dec.setAuthTag(tag);return Buffer.concat([dec.update(body),dec.final()]).toString('utf8')}

type Row={id:string;owner_id:string;platform:PublishPlatform;account_label:string;secret_encrypted:string;created_at:string;updated_at:string};
export function credentialStatus(ownerId:string){return all<Row>('SELECT * FROM publish_credentials WHERE owner_id=? ORDER BY platform,account_label',ownerId).map(x=>({id:x.id,platform:x.platform,accountLabel:x.account_label,configured:true,updatedAt:x.updated_at}))}
export function getCredential(ownerId:string,platform:PublishPlatform):PublishCredential|undefined{const r=all<Row>('SELECT * FROM publish_credentials WHERE owner_id=? AND platform=? ORDER BY updated_at DESC LIMIT 1',ownerId,platform)[0];if(!r)return undefined;return{platform:r.platform,accountLabel:r.account_label,secret:JSON.parse(decrypt(r.secret_encrypted))}}
export function saveCredential(ownerId:string,platform:PublishPlatform,accountLabel:string,secret:Record<string,string>){const now=new Date().toISOString(),id=`${ownerId}:${platform}`;run(`INSERT INTO publish_credentials(id,owner_id,platform,account_label,secret_encrypted,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET account_label=excluded.account_label,secret_encrypted=excluded.secret_encrypted,updated_at=excluded.updated_at`,id,ownerId,platform,accountLabel.trim()||platform,encrypt(JSON.stringify(secret)),now,now);return{id,platform,accountLabel:accountLabel.trim()||platform,configured:true,updatedAt:now}}
export function deleteCredential(ownerId:string,platform:PublishPlatform){return run('DELETE FROM publish_credentials WHERE owner_id=? AND platform=?',ownerId,platform)}
