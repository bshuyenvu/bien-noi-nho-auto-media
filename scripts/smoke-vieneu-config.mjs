import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8'),must=(ok,msg)=>{if(!ok)throw new Error(msg)};
const client=read('src/tts/vieneu.ts'),service=read('services/vieneu-tts/server.py'),compose=read('docker-compose.yml'),env=read('.env.example');
must(client.includes('voiceName:string'),'VieNeu client must accept explicit preset/custom voice');
must(service.includes('DEFAULT_VOICE=os.getenv("VIENEU_DEFAULT_VOICE","Minh Đức")'),'Service must default to Minh Đức');
must(service.includes('def enroll(self,data)')&&service.includes('/enroll'),'Personal voice enrollment endpoint missing');
must(service.includes('cloneSupported'),'Clone capability status missing');
must(compose.includes('vieneu-voices:/voices'),'Persistent personal voice volume missing');
must(env.includes('VIENEU_DEFAULT_VOICE=Minh Đức'),'Default voice env missing');
for(const [name,text] of [['client',client],['service',service],['compose',compose],['env',env]]){must(!text.includes('Adam'),`${name} still contains Adam`);must(!text.includes('REVID'),`${name} still contains Revid config`)}
console.log('VieNeu v3turbo + Personal Voice Clone configuration smoke OK');
