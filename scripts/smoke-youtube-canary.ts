const originalFetch=globalThis.fetch;
Object.assign(process.env,{YOUTUBE_CLIENT_ID:'canary-client',YOUTUBE_CLIENT_SECRET:'canary-secret',YOUTUBE_REDIRECT_URI:'https://example.test/api/publish-oauth/youtube/callback'});

try{
  const {verifyYouTubeUnlistedCanary}=await import('../src/publish/youtube-canary.js');
  const credential:any={platform:'youtube',accountLabel:'Canary Channel',secret:{refreshToken:'refresh-secret',channelId:'UC_CANARY',scope:'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly'}};
  let mode:'pass'|'processing'|'private'|'rejected'|'wrong-channel'='pass';
  globalThis.fetch=async(input:any)=>{
    const url=String(input instanceof Request?input.url:input);
    if(url.includes('oauth2.googleapis.com/token'))return new Response(JSON.stringify({access_token:'access-secret-should-never-escape'}),{status:200,headers:{'content-type':'application/json'}});
    if(url.includes('youtube/v3/videos')){
      const item:any={id:'video-canary',snippet:{channelId:mode==='wrong-channel'?'UC_OTHER':'UC_CANARY',title:'Remote Canary'},status:{privacyStatus:mode==='private'?'private':'unlisted',uploadStatus:mode==='rejected'?'rejected':'processed'},processingDetails:{processingStatus:mode==='processing'?'processing':'succeeded'}};
      if(mode==='rejected')item.status.rejectionReason='duplicate';
      return new Response(JSON.stringify({items:[item]}),{status:200,headers:{'content-type':'application/json'}});
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  const pass=await verifyYouTubeUnlistedCanary(credential,'video-canary');
  if(!pass.readyForPromotion||pass.channelId!=='UC_CANARY'||pass.privacyStatus!=='unlisted'||pass.uploadStatus!=='processed'||pass.processingStatus!=='succeeded')throw new Error(`valid Canary did not pass: ${JSON.stringify(pass)}`);
  if(JSON.stringify(pass).includes('access-secret')||JSON.stringify(pass).includes('refresh-secret'))throw new Error('Remote Canary result leaked OAuth secret');
  for(const bad of ['processing','private','rejected','wrong-channel'] as const){mode=bad;const r=await verifyYouTubeUnlistedCanary(credential,'video-canary');if(r.readyForPromotion)throw new Error(`${bad} Canary incorrectly passed promotion gate`);if(!r.reasons.length)throw new Error(`${bad} Canary did not expose sanitized reason`)}
  console.log('YouTube Remote Canary verification smoke OK');
}finally{globalThis.fetch=originalFetch}
