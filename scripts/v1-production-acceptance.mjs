import { readFileSync, existsSync } from 'node:fs';

const read=(p)=>readFileSync(p,'utf8');
const pkg=JSON.parse(read('package.json'));
const env=read('.env.example');
const compose=read('docker-compose.yml');
const workflow=read('.github/workflows/typecheck.yml');
const requiredDocs=[
  'docs/DURABLE-REVIEW-GATE.md',
  'docs/IMMUTABLE-ARTIFACT-PROVENANCE.md',
  'docs/END-TO-END-CONSISTENCY.md',
  'docs/PRODUCTION-ACTIVATION-WIZARD.md',
  'docs/REMOTE-CANARY-PUBLIC-PROMOTION.md',
  'docs/CONTROLLED-PUBLIC-ROLLOUT.md',
  'docs/GRADUAL-PUBLIC-RAMP.md',
  'docs/CONTENT-SAFETY-DUPLICATE-GUARD.md',
  'docs/V1-PRODUCTION-RELEASE.md',
];
const failures=[];
const must=(ok,msg)=>{if(!ok)failures.push(msg)};

must(/^6\.4\.0$/.test(String(pkg.version)),'package version must be 6.4.0 for V1 Production');
must(pkg.scripts?.['smoke:v1-acceptance']==='node scripts/v1-production-acceptance.mjs','V1 acceptance npm script missing');
must(env.includes('PUBLISH_LIVE_ENABLED=false'),'safe default PUBLISH_LIVE_ENABLED=false missing');
must(env.includes('YOUTUBE_PRIVACY_STATUS=private'),'safe default YouTube privacy=private missing');
must(env.includes('ARTIFACT_MANIFEST_WATCHER=true'),'artifact manifest watcher must default on');
must(env.includes('CONSISTENCY_AUDITOR_ENABLED=true'),'consistency auditor must default on');
must(compose.includes('PUBLISH_LIVE_ENABLED: ${PUBLISH_LIVE_ENABLED:-false}'),'Compose LIVE default is not locked');
must(compose.includes('YOUTUBE_PRIVACY_STATUS: ${YOUTUBE_PRIVACY_STATUS:-private}'),'Compose YouTube privacy default is not private');
must(compose.includes('ARTIFACT_MANIFEST_WATCHER: ${ARTIFACT_MANIFEST_WATCHER:-true}'),'Compose artifact watcher default missing');
must(compose.includes('CONSISTENCY_AUDITOR_ENABLED: ${CONSISTENCY_AUDITOR_ENABLED:-true}'),'Compose consistency auditor default missing');
for(const doc of requiredDocs)must(existsSync(doc),`required operations document missing: ${doc}`);
for(const script of ['smoke:review-gate','smoke:artifact-integrity','smoke:consistency','smoke:youtube-resumable','smoke:release-candidate','smoke:activation-wizard','smoke:youtube-canary','smoke:public-rollout','smoke:public-ramp','smoke:content-safety'])must(Boolean(pkg.scripts?.[script]),`required acceptance smoke missing: ${script}`);
must(workflow.includes('V1 Production final acceptance contract'),'CI does not run V1 final acceptance');

if(failures.length){console.error('V1 Production acceptance FAILED');for(const f of failures)console.error(` - ${f}`);process.exit(1)}
console.log(`V1 Production acceptance PASS • VietNewsFlow AI v${pkg.version}`);
console.log('Safe defaults: LIVE locked • YouTube private • Artifact watcher ON • Consistency auditor ON');
