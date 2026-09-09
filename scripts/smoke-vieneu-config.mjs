import fs from 'node:fs';

const read=(p)=>fs.readFileSync(p,'utf8');
const client=read('src/tts/vieneu.ts');
const service=read('services/vieneu-tts/server.py');
const compose=read('docker-compose.yml');
const env=read('.env.example');
const check=read('scripts/check-vieneu.sh');

const must=(ok,msg)=>{if(!ok)throw new Error(msg)};

must(client.includes("?'Mai Anh':'Adam'"),'VieNeu client male preset must be Adam');
must(service.includes('os.getenv("VIENEU_MODE", "v3turbo")'),'VieNeu service must default to v3turbo');
must(service.includes('data.get("voice", "Adam")'),'VieNeu service default voice must be Adam');
must(compose.includes('VIENEU_MODE: ${VIENEU_MODE:-v3turbo}'),'Compose must default VieNeu to v3turbo');
must(env.includes('VIENEU_MODE=v3turbo'),'.env.example must default VieNeu to v3turbo');
must(check.includes('mode=v3turbo'),'VieNeu prerequisite check must report v3turbo');

for(const [name,text] of [['client',client],['service',service],['compose',compose],['env',env],['check',check]]){
  must(!text.includes('v3nano'),`${name} still contains unsupported v3nano`);
  must(!text.includes('Minh Quân'),`${name} still contains unavailable Minh Quân preset`);
}

console.log('VieNeu v3turbo + Adam configuration smoke OK');
