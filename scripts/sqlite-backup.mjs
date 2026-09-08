import { DatabaseSync } from 'node:sqlite';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const source=resolve(String(process.env.DB_PATH||'data/auto-media.sqlite'));
const targetArg=String(process.argv[2]||'').trim();
if(!targetArg)throw new Error('Usage: node scripts/sqlite-backup.mjs <target.sqlite>');
const target=resolve(targetArg);
if(source===target)throw new Error('Backup target must differ from source database');
if(!target.endsWith('.sqlite'))throw new Error('Backup target must end with .sqlite');
mkdirSync(dirname(target),{recursive:true});
const escaped=target.replaceAll("'","''");
const db=new DatabaseSync(source);
try{
  db.exec(`VACUUM INTO '${escaped}'`);
}finally{
  db.close();
}
console.log(target);
