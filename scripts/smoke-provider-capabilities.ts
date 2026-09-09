import assert from 'node:assert/strict';
import { assertLivePlatformAllowed,isPublishPlatform,listPublishCapabilities,publishCapability } from '../src/publish/capabilities.js';

assert.equal(isPublishPlatform('youtube'),true);assert.equal(isPublishPlatform('threads'),false);
const caps=listPublishCapabilities();assert.equal(caps.length,3);
const yt=publishCapability('youtube'),fb=publishCapability('facebook'),tt=publishCapability('tiktok');
assert.equal(yt.liveImplemented,true);assert.equal(yt.productionApproved,true);assert.deepEqual(yt.supportedPrivacy,['private','unlisted','public']);
assert.equal(fb.liveImplemented,false);assert.equal(fb.productionApproved,false);assert.equal(fb.releaseMode,'dry_run_only');
assert.equal(tt.liveImplemented,false);assert.equal(tt.productionApproved,false);assert.equal(tt.requiresPerPostConsent,true);assert.equal(tt.releaseMode,'dry_run_only');assert.equal(tt.credentialMode,'none');
process.env.PUBLISH_LIVE_ENABLED='false';assert.throws(()=>assertLivePlatformAllowed('youtube'),/PUBLISH_LIVE_ENABLED/);
process.env.PUBLISH_LIVE_ENABLED='true';assert.doesNotThrow(()=>assertLivePlatformAllowed('youtube'));assert.throws(()=>assertLivePlatformAllowed('facebook'),/chưa được triển khai/);assert.throws(()=>assertLivePlatformAllowed('tiktok'),/chưa được triển khai/);
console.log('Unified Provider Capability Registry smoke OK');
