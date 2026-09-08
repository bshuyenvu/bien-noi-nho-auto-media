import { Router } from 'express';
import { accessOf } from '../auth/access.js';
import { saveCredential } from './vault.js';
import { exchangeYouTubeCode,parseYouTubeOAuthState,youtubeAuthorizationUrl } from './youtube.js';

export const publishOAuthRouter=Router();

publishOAuthRouter.get('/publish-oauth/youtube/start',(_req,res)=>{
  try{const ownerId=accessOf(res).accountId;return res.json({platform:'youtube',authorizationUrl:youtubeAuthorizationUrl(ownerId)})}
  catch(e){return res.status(409).json({error:e instanceof Error?e.message:String(e)})}
});

publishOAuthRouter.get('/publish-oauth/youtube/callback',async(req,res)=>{
  const code=String(req.query.code||''),state=String(req.query.state||''),oauthError=String(req.query.error||'');
  if(oauthError)return res.status(400).send(`YouTube OAuth bị từ chối: ${oauthError}`);
  if(!code||!state)return res.status(400).send('Thiếu code/state từ YouTube OAuth');
  try{
    const parsed=parseYouTubeOAuthState(state),current=accessOf(res).accountId;
    if(parsed.ownerId!==current)return res.status(403).send('OAuth state không thuộc tài khoản hiện tại');
    const token=await exchangeYouTubeCode(code);
    if(!token.refreshToken&&!token.accessToken)throw new Error('Google không trả credential hợp lệ');
    saveCredential(current,'youtube','YouTube',{
      ...(token.refreshToken?{refreshToken:token.refreshToken}:{}),
      ...(token.accessToken?{accessToken:token.accessToken}:{}),
      scope:token.scope,
      tokenType:token.tokenType
    });
    return res.status(200).send('YouTube đã kết nối thành công. Có thể quay lại Stable Control / Channels.')
  }catch(e){return res.status(409).send(`Không thể kết nối YouTube: ${e instanceof Error?e.message:String(e)}`)}
});
