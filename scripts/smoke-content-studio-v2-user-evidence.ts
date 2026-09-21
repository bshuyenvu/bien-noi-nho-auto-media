import assert from 'node:assert/strict';
import { normalizeResearchUrl,researchSourceAuthority } from '../src/research/health.js';

const aha=normalizeResearchUrl('https://www.heart.org/en/health-topics/heart-attack/warning-signs-of-a-heart-attack?utm_source=chatgpt.com#top');
const cdc=normalizeResearchUrl('https://www.cdc.gov/heart-disease/about/heart-attack.html?utm_source=chatgpt.com&utm_medium=test');

assert.equal(aha,'https://www.heart.org/en/health-topics/heart-attack/warning-signs-of-a-heart-attack');
assert.equal(cdc,'https://www.cdc.gov/heart-disease/about/heart-attack.html');
assert.ok(researchSourceAuthority(aha)>=90);
assert.ok(researchSourceAuthority(cdc)>=90);
assert.equal(researchSourceAuthority('https://example.com/article'),72);

console.log(JSON.stringify({ok:true,aha,ahaAuthority:researchSourceAuthority(aha),cdc,cdcAuthority:researchSourceAuthority(cdc)},null,2));
