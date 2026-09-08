import { Router } from 'express';
import { accessOf } from '../auth/access.js';
import { productionMonitorRouter } from '../system/monitor-routes.js';
import { releaseReadinessRouter } from '../system/release-routes.js';
import { activationWizardRouter } from './activation-routes.js';
import { publishReconcileRouter } from './reconcile-routes.js';
import { getCredential, saveCredential } from './vault.js';
import { exchangeYouTubeCode, parseYouTubeOAuthState, youtubeAuthorizationUrl, youtubeReadiness } from './youtube.js';
import type { PublishCredential } from './providers.js';

export const publishOAuthRouter=Router();
publishOAuthRouter.use(productionMonitorRouter);
publishOAuthRouter.use(releaseReadinessRouter);
publishOAuthRouter.use(activationWizardRouter);
publishOAuthRouter.use(publishReconcileRouter);
function esc(v:string){return v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]||c))}
function resultPage(ok:boolean,title:string,message:string){const tone=ok?'#16a34a':'#dc2626';return`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{margin:0;background:#07111f;color:#e5eefb;font-family:system-ui;display:grid;place-items:center;min-height:100vh}.card{max-width:620px;margin:24px;padding:28px;border-radius:18px;background:#111827;border:1px solid #334155}.state{font-weight:800;color:${tone};font-size:22px}.msg{margin:14px 0;color:#cbd5e1;line-height:1.6}.btn{display:inline-block;padding:10px 14px;border-radius:10px;background:#2563eb;color:#fff;text-decoration:none;font-weight:700}</style></head><body><main class="card"><div class="state">${ok?'✓':'⚠'} ${esc(title)}</div><div class="msg">${esc(message)}</div><a class="btn" href="/">QUAY LẠI BẢNG ĐIỀU KHIỂN</a></main></body></html>`}

publishOAuthRouter.get('/publish-oauth/youtube/start',(_req,res)=>{
  try{const ownerId=accessOf(res).accountId;return res.json({platform:'youtube',authorizationUrl:youtubeAuthorizationUrl(ownerId)})}
  catch(e){return res.status(409).json({error:e instanceof Error?e.message:String(e)})}
});

publishOAuthRouter.get('/publish-oauth/youtube/callback',async(req,res)=>{
  const code=String(req.query.code||''),state=String(req.query.state||''),oauthError=String(req.query.error||'');
  if(oauthError)return res.status(400).type('html').send(resultPage(false,'YouTube OAuth bị từ chối','Google không cấp quyền. Bạn có thể quay lại và thử kết nối lại.'));
  if(!code||!state)return res.status(400).type('html').send(resultPage(false,'Thiếu dữ liệu OAuth','Callback từ Google không có đủ code/state. Hãy bắt đầu lại từ nút KẾT NỐI YOUTUBE.'));
  try{
    const parsed=parseYouTubeOAuthState(state),current=accessOf(res).accountId;
    if(parsed.ownerId!==current)return res.status(403).type('html').send(resultPage(false,'OAuth không khớp tài khoản','Phiên OAuth không thuộc tài khoản hiện tại.'));
    const token=await exchangeYouTubeCode(code);
    if(!token.refreshToken)throw new Error('Google không trả refresh token; hãy kết nối lại và cho phép quyền offline');
    const tempCredential:PublishCredential={platform:'youtube',accountLabel:'YouTube',secret:{refreshToken:token.refreshToken,...(token.accessToken?{accessToken:token.accessToken}:{}),scope:token.scope,tokenType:token.tokenType}};
    const readiness=await youtubeReadiness(tempCredential);
    if(!readiness.ok||!readiness.channelId)throw new Error(readiness.error||'Không xác minh được kênh YouTube');
    saveCredential(current,'youtube',readiness.channelTitle||readiness.channelId,{refreshToken:token.refreshToken,scope:token.scope,tokenType:token.tokenType,channelId:readiness.channelId,channelTitle:readiness.channelTitle||readiness.channelId,verifiedAt:new Date().toISOString()});
    return res.status(200).type('html').send(resultPage(true,'Kết nối YouTube thành công',`Đã xác minh kênh ${readiness.channelTitle||readiness.channelId}. Hãy quay lại bảng điều khiển và chạy TEST KẾT NỐI trước khi xuất bản LIVE.`));
  }catch(e){return res.status(409).type('html').send(resultPage(false,'Không thể kết nối YouTube',e instanceof Error?e.message:String(e)))}
});

publishOAuthRouter.post('/publish-oauth/youtube/test',async(_req,res)=>{
  const ownerId=accessOf(res).accountId,credential=getCredential(ownerId,'youtube');
  if(!credential)return res.status(404).json({error:'YouTube chưa được kết nối',platform:'youtube',ok:false});
  const readiness=await youtubeReadiness(credential),storedChannelId=String(credential.secret.channelId||'');
  if(readiness.ok&&readiness.channelId&&storedChannelId&&readiness.channelId!==storedChannelId)return res.status(409).json({platform:'youtube',liveEnabled:process.env.PUBLISH_LIVE_ENABLED==='true',...readiness,ok:false,channelMismatch:true,error:'Channel ID hiện tại khác kênh đã xác minh. Hãy ngắt kết nối rồi OAuth lại để tránh đăng nhầm kênh.'});
  if(readiness.ok&&readiness.channelId){const verifiedAt=new Date().toISOString();saveCredential(ownerId,'youtube',readiness.channelTitle||readiness.channelId,{...credential.secret,channelId:readiness.channelId,channelTitle:readiness.channelTitle||readiness.channelId,verifiedAt});return res.json({platform:'youtube',liveEnabled:process.env.PUBLISH_LIVE_ENABLED==='true',...readiness,verifiedAt})}
  return res.status(409).json({platform:'youtube',liveEnabled:process.env.PUBLISH_LIVE_ENABLED==='true',...readiness});
});
