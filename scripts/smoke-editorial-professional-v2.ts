import assert from 'node:assert/strict';
import { mkdtempSync,readFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir=mkdtempSync(join(tmpdir(),'editorial-prof-v2-'));
process.env.DB_PATH=join(dir,'test.sqlite');
process.env.CREDENTIAL_VAULT_KEY='editorial-professional-v2-smoke-vault-key';
process.env.GEMINI_API_KEY='';process.env.AI_API_KEY='';process.env.OLLAMA_ENABLED='false';

const runtime=await import('../src/ai/runtime.js');
const storage=await import('../src/storage/db.js');
const provenance=await import('../src/media/provenance.js');
const editor=await import('../src/ai/editor.js');

const settings=runtime.saveAiProviderSettings('owner-prof',{preferredProvider:'openai',geminiModel:'gemini-test',geminiApiKey:'gem-secret-smoke',openaiBaseUrl:'https://example.ai/v1',openaiModel:'gpt-test',openaiProtocol:'responses',openaiApiKey:'sk-openai-secret-smoke'});
assert.equal(settings.preferredProvider,'openai');assert.equal(settings.gemini.keyConfigured,true);assert.equal(settings.openai.keyConfigured,true);
assert.equal(Object.prototype.hasOwnProperty.call(settings.gemini,'apiKey'),false);assert.equal(Object.prototype.hasOwnProperty.call(settings.openai,'apiKey'),false);
const row=storage.all<any>('SELECT * FROM ai_provider_settings WHERE owner_id=?','owner-prof')[0];
assert.ok(row.gemini_key_encrypted&&!String(row.gemini_key_encrypted).includes('gem-secret-smoke'));assert.ok(row.openai_key_encrypted&&!String(row.openai_key_encrypted).includes('sk-openai-secret-smoke'));
const candidates=runtime.providerCandidates('owner-prof');assert.deepEqual(candidates.slice(0,2).map(x=>x.id),['openai','gemini']);assert.equal(candidates[0].source,'saved');
const media=provenance.saveDraftMediaProvenance('draft-prof','owner-prof',[
 {url:'https://cdn.example.com/a.jpg',sourceName:'Nature Medicine',sourceUrl:'https://nature.com/article',kind:'image'},
 {url:'https://video.example.org/b.mp4',sourceName:'ECDC',sourceUrl:'https://ecdc.europa.eu/news',kind:'video'},
]);
assert.equal(media.length,2);assert.equal(provenance.mediaCredit(media[0]),'Ảnh: Nature Medicine');assert.equal(provenance.mediaCredit(media[1]),'Video: ECDC');

assert.equal(editor.stripPublisherAttribution('Ăn gì giúp trẻ tăng sức đề kháng? - Báo VnExpress','VnExpress'),'Ăn gì giúp trẻ tăng sức đề kháng?');
assert.equal(editor.stripPublisherAttribution('Theo VnExpress, rau xanh cung cấp vitamin.','VnExpress'),'rau xanh cung cấp vitamin.');
assert.equal(editor.stripPublisherAttribution('Theo nguồn y khoa, triệu chứng có thể không rõ ràng.','VnExpress'),'triệu chứng có thể không rõ ràng.');

const root=new URL('../',import.meta.url);
const server=readFileSync(new URL('src/server.ts',root),'utf8'),app=readFileSync(new URL('public/index.html',root),'utf8'),client=readFileSync(new URL('public/health-studio.js',root),'utf8'),ffmpeg=readFileSync(new URL('src/video/ffmpeg.ts',root),'utf8');
assert.match(server,/app\.patch\('\/api\/drafts\/:id\/content'/);assert.match(server,/mediaProvenance:getDraftMediaProvenance/);assert.match(server,/bindReviewRenderProfile/);
assert.match(app,/KỊCH BẢN CANONICAL • READ ONLY/);assert.match(app,/DURABLE REVIEW/);assert.match(client,/state\.review=x/);assert.match(client,/\/api\/drafts\/\$\{encodeURIComponent\(d\.id\)\}\/render/);
assert.doesNotMatch(ffmpeg,/text='NGUỒN'/);assert.doesNotMatch(ffmpeg,/sourceFile/);assert.match(ffmpeg,/sourceCredit/);assert.match(ffmpeg,/item\.kind==='video'\?'Video':'Ảnh'/);
console.log('Editorial Professional V2 contract smoke OK',{providers:candidates.slice(0,2).map(x=>x.id),mediaCredits:media.map(provenance.mediaCredit)});
rmSync(dir,{recursive:true,force:true});
