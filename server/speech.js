const MALE='JBFqnCBsd6RMkjVDRZzb',FEMALE='EXAVITQu4vr4xnSDxMaL';
export const SPEECH_VOICES=Object.freeze(Object.fromEntries(['sokrates','aristoteles','epikur','kant','nietzsche','camus','arendt','beauvoir'].map(id=>[id,['arendt','beauvoir'].includes(id)?FEMALE:MALE])));
export function splitSpeech(text,max=8000){
 const chunks=[];let rest=text;
 while(rest.length>max){let cut=rest.lastIndexOf(' ',max);if(cut<max/2)cut=max;if(/[\uD800-\uDBFF]/.test(rest[cut-1]))cut--;chunks.push(rest.slice(0,cut));rest=rest.slice(cut)}
 if(rest)chunks.push(rest);return chunks;
}
export function installSpeech(app,options={}){
 const version=options.version,fetchImpl=options.fetch||globalThis.fetch,env=options.env||process.env;
 const timeout=options.speechTimeoutMs??90000,maxBytes=options.speechMaxBytes??16*1024*1024;
 const maxConcurrency=options.speechConcurrency??3,ipChars=options.speechIpChars??60000,globalChars=options.speechGlobalChars??300000,perMinute=options.speechPerMinute??6;
 let day='',spent=0,active=0;const ips=new Map();
 app.post('/api/speech',async(req,res)=>{
  res.set('Cache-Control','no-store');res.set('X-App-Version',version);
  const fail=(status,code)=>{if(!res.destroyed)res.status(status).json({error:code,code,version})};
  const origin=req.get('origin')||req.get('referer');
  if(req.get('sec-fetch-site')==='cross-site')return fail(403,'FORBIDDEN_ORIGIN');
  if(origin){try{if(new URL(origin).origin!==`${req.protocol}://${req.get('host')}`)return fail(403,'FORBIDDEN_ORIGIN')}catch{return fail(403,'FORBIDDEN_ORIGIN')}}
  if(!req.is('application/json'))return fail(415,'UNSUPPORTED_MEDIA_TYPE');
  const b=req.body;
  if(!b||typeof b!=='object'||Array.isArray(b))return fail(400,'BAD_REQUEST');
  if(typeof b.version!=='string'||!b.version)return fail(400,'MISSING_VERSION');
  if(b.version!==version)return fail(409,'VERSION_MISMATCH');
  if(typeof b.philosopher!=='string'||!Object.hasOwn(SPEECH_VOICES,b.philosopher))return fail(400,'UNKNOWN_PHILOSOPHER');
  if(typeof b.text!=='string'||!b.text.trim()||b.text.length>16000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(b.text))return fail(400,'INVALID_TEXT');
  if(!env.ELEVENLABS_API_KEY)return fail(503,'SPEECH_UNAVAILABLE');
  const now=Date.now(),today=new Date(now).toISOString().slice(0,10);
  if(day!==today){day=today;spent=0;for(const [k,v] of ips)if(!v.active)ips.delete(k)}
  const ip=req.ip||'unknown';let rec=ips.get(ip);
  if(!rec){if(ips.size>=10000)return fail(503,'SERVER_BUSY');rec={day:today,chars:0,start:now,hits:0,active:0};ips.set(ip,rec)}
  if(rec.day!==today){rec.day=today;rec.chars=0}
  if(now-rec.start>=60000){rec.start=now;rec.hits=0}
  if(active>=maxConcurrency||rec.active)return fail(503,'SERVER_BUSY');
  if(rec.hits>=perMinute||rec.chars+b.text.length>ipChars){res.set('Retry-After','60');return fail(429,'RATE_LIMITED')}
  if(spent+b.text.length>globalChars)return fail(503,'GLOBAL_BUDGET_EXHAUSTED');
  rec.hits++;rec.chars+=b.text.length;spent+=b.text.length;rec.active++;active++;
  const ctrl=new AbortController();let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;ctrl.abort()},timeout);
  const disconnect=()=>{if(!res.writableEnded)ctrl.abort()};res.once('close',disconnect);
  try{
   const buffers=[];let bytes=0;
   for(const text of splitSpeech(b.text)){
    const r=await fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${SPEECH_VOICES[b.philosopher]}?output_format=mp3_44100_128`,{method:'POST',headers:{'xi-api-key':env.ELEVENLABS_API_KEY,'Content-Type':'application/json',Accept:'audio/mpeg'},signal:ctrl.signal,body:JSON.stringify({text,model_id:'eleven_multilingual_v2',language_code:'de'})});
    if(!r.ok||!/^audio\/(mpeg|mp3)(;|$)/i.test(r.headers.get('content-type')||'')){await r.body?.cancel();throw Error('PROVIDER')}
    const parts=[];if(!r.body)throw Error('EMPTY');
    for await(const chunk of r.body){bytes+=chunk.length;if(bytes>maxBytes){ctrl.abort();throw Error('MEDIA_SIZE')}parts.push(Buffer.from(chunk))}
    const buf=Buffer.concat(parts);
    if(buf.length<4||!(buf.subarray(0,3).toString()==='ID3'||(buf[0]===255&&(buf[1]&224)===224)))throw Error('INVALID_MEDIA');
    buffers.push(buf);
   }
   if(!ctrl.signal.aborted)res.type('audio/mpeg').send(Buffer.concat(buffers));
  }catch{fail(timedOut?504:502,timedOut?'SPEECH_TIMEOUT':'SPEECH_FAILED')}
  finally{clearTimeout(timer);res.off('close',disconnect);active--;rec.active--}
 });
}
