import assert from 'node:assert/strict';
import {
  copyrightPolicyStatus,
  evaluateOriginality,
  mediaRightsAllowed,
} from '../src/compliance/copyright.js';

process.env.COPYRIGHT_SAFE_MODE='true';
const policy=copyrightPolicyStatus();
assert.equal(policy.enabled,true);
assert.equal(mediaRightsAllowed({rights:'unverified',rightsVerified:false}),false);
assert.equal(mediaRightsAllowed({rights:'owned',rightsVerified:true}),true);
assert.equal(mediaRightsAllowed({rights:'generated',rightsVerified:true}),true);
assert.equal(mediaRightsAllowed({rights:'public-domain',rightsVerified:true}),true);
assert.equal(mediaRightsAllowed({rights:'cc0',rightsVerified:true}),true);
assert.equal(mediaRightsAllowed({rights:'cc-by',rightsVerified:true}),false);
assert.equal(mediaRightsAllowed({rights:'cc-by',rightsVerified:true,creator:'WHO',licenseUrl:'https://example.org/license'}),true);

const source='Bộ Y tế khuyến cáo người dân rửa tay thường xuyên, tiêm chủng đầy đủ và đến cơ sở y tế khi có dấu hiệu bất thường.';
const copied=evaluateOriginality('Bộ Y tế khuyến cáo người dân',source,[source]);
assert.equal(copied.safe,false);
const original=evaluateOriginality(
  'Ba việc nên làm để giảm nguy cơ lây nhiễm',
  'Để chủ động bảo vệ sức khỏe, hãy duy trì vệ sinh tay, cập nhật lịch tiêm phù hợp và đi khám khi xuất hiện triệu chứng đáng lo.',
  [source],
);
assert.equal(original.safe,true);
assert.ok(original.score>copied.score);

console.log('Copyright Safe Health smoke OK',JSON.stringify({
  enabled:policy.enabled,
  copiedScore:copied.score,
  originalScore:original.score,
  safeMedia:policy.safeMedia,
}));
