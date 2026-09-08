import { Router } from 'express';
import { accessOf } from '../auth/access.js';
import { getCredential, saveCredential } from './vault.js';
import { exchangeYouTubeCode, parseYouTubeOAuthState, youtubeAuthorizationUrl, youtubeReadiness } from './youtube.js';
import type { PublishCredential } from './providers.js';

export const publishOAuthRouter = Router();

publishOAuthRouter.get('/publish-oauth/youtube/start', (_req, res) => {
  try {
    const ownerId = accessOf(res).accountId;
    return res.json({ platform: 'youtube', authorizationUrl: youtubeAuthorizationUrl(ownerId) });
  } catch (e) {
    return res.status(409).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

publishOAuthRouter.get('/publish-oauth/youtube/callback', async (req, res) => {
  const code = String(req.query.code || ''), state = String(req.query.state || ''), oauthError = String(req.query.error || '');
  if (oauthError) return res.status(400).send(`YouTube OAuth bị từ chối: ${oauthError}`);
  if (!code || !state) return res.status(400).send('Thiếu code/state từ YouTube OAuth');
  try {
    const parsed = parseYouTubeOAuthState(state), current = accessOf(res).accountId;
    if (parsed.ownerId !== current) return res.status(403).send('OAuth state không thuộc tài khoản hiện tại');
    const token = await exchangeYouTubeCode(code);
    if (!token.refreshToken) throw new Error('Google không trả refresh token; hãy kết nối lại và cho phép quyền offline');
    const tempCredential: PublishCredential = {
      platform: 'youtube',
      accountLabel: 'YouTube',
      secret: {
        refreshToken: token.refreshToken,
        ...(token.accessToken ? { accessToken: token.accessToken } : {}),
        scope: token.scope,
        tokenType: token.tokenType,
      },
    };
    const readiness = await youtubeReadiness(tempCredential);
    if (!readiness.ok || !readiness.channelId) throw new Error(readiness.error || 'Không xác minh được kênh YouTube');
    saveCredential(current, 'youtube', readiness.channelTitle || readiness.channelId, {
      refreshToken: token.refreshToken,
      scope: token.scope,
      tokenType: token.tokenType,
      channelId: readiness.channelId,
      channelTitle: readiness.channelTitle || readiness.channelId,
      verifiedAt: new Date().toISOString(),
    });
    return res.status(200).send(`YouTube đã kết nối: ${readiness.channelTitle || readiness.channelId}. Có thể quay lại Stable Control / Channels.`);
  } catch (e) {
    return res.status(409).send(`Không thể kết nối YouTube: ${e instanceof Error ? e.message : String(e)}`);
  }
});

publishOAuthRouter.post('/publish-oauth/youtube/test', async (_req, res) => {
  const ownerId = accessOf(res).accountId;
  const credential = getCredential(ownerId, 'youtube');
  if (!credential) return res.status(404).json({ error: 'YouTube chưa được kết nối', platform: 'youtube', ok: false });
  const readiness = await youtubeReadiness(credential);
  return res.status(readiness.ok ? 200 : 409).json({
    platform: 'youtube',
    liveEnabled: process.env.PUBLISH_LIVE_ENABLED === 'true',
    ...readiness,
  });
});
