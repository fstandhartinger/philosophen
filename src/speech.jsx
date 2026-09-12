import React,{useEffect,useRef,useState} from 'react';
import './speech.css';

// One controller for the whole salon. The AudioContext is resumed synchronously
// inside the actual click, before any fetch/decode awaits (including on iOS).
export function useSpeech(version){
 const [state,setState]=useState({});
 const ref=useRef(null);
 if(!ref.current)ref.current={epoch:0,cache:new Map(),bytes:0};
 const s=ref.current;
 function stop(){
  s.epoch++;s.abort?.abort();s.abort=null;
  if(s.source){s.source.onended=null;try{s.source.stop()}catch{}s.source.disconnect();s.source=null}
  if(s.audio){s.audio.pause();s.audio.removeAttribute('src');s.audio.load();s.audio=null}
 }
 function reset(){stop();for(const x of s.cache.values())URL.revokeObjectURL(x.url);s.cache.clear();s.bytes=0;s.key=null;s.offset=0;s.current=null;const ctx=s.ctx;s.ctx=null;ctx?.close().catch(()=>{});setState({})}
 useEffect(()=>()=>{stop();for(const x of s.cache.values())URL.revokeObjectURL(x.url);s.cache.clear();s.ctx?.close().catch(()=>{})},[]);
 function publish(status,extra={}){s.status=status;setState({key:s.key,status,...extra})}
 function fallback(entry){publish('fallback',{url:entry.url})}
 function play(entry,epoch){
  if(epoch!==s.epoch)return;
  if(!s.ctx||s.ctx.state!=='running'||!entry.buffer){fallback(entry);return}
  try{
   const source=s.ctx.createBufferSource();source.buffer=entry.buffer;source.connect(s.ctx.destination);s.source=source;
   if(s.offset>=entry.buffer.duration)s.offset=0;
   s.started=s.ctx.currentTime-s.offset;
   source.onended=()=>{if(epoch===s.epoch&&s.source===source){source.disconnect();s.source=null;s.offset=0;publish('ended')}};
   source.start(0,s.offset);publish('playing');
  }catch{fallback(entry)}
 }
 async function click(key,philosopher,text){
  // Pause/resume keep the decoded buffer and the same generation.
  if(s.key===key&&s.status==='playing'){
   s.offset=s.ctx.currentTime-s.started;stop();publish('paused');return;
  }
  if(s.key===key&&s.status==='loading'){stop();publish('idle');return}
  const same=s.key===key;stop();s.key=key;if(!same)s.offset=0;
  const epoch=s.epoch;
  try{
   const C=window.AudioContext||window.webkitAudioContext;
   if(!s.ctx&&C)s.ctx=new C();
   // Do not await resume here: Safari needs this call within the gesture.
   s.ctx?.resume().catch(()=>{});
  }catch{}
  let entry=s.cache.get(key);
  if(entry){s.cache.delete(key);s.cache.set(key,entry);s.current=entry;play(entry,epoch);return}
  publish('loading');s.offset=0;
  const ctrl=new AbortController();s.abort=ctrl;
  const timer=setTimeout(()=>ctrl.abort(),95000);
  try{
   const r=await fetch('/api/speech',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',signal:ctrl.signal,body:JSON.stringify({version,philosopher,text})});
   if(!r.ok){const j=await r.json().catch(()=>({}));throw Error(r.status===409?'Bitte aktualisiere die App.':r.status===429?'Vorlesen ist gerade ausgelastet. Bitte später erneut versuchen.':j.code==='GLOBAL_BUDGET_EXHAUSTED'?'Das heutige Vorleselimit ist erreicht.':'Vorlesen ist gerade nicht möglich. Bitte erneut versuchen.')}
   if(!r.headers.get('content-type')?.startsWith('audio/'))throw Error('Die Audioantwort war ungültig. Bitte erneut versuchen.');
   const blob=await r.blob();if(!blob.size||blob.size>16*1024*1024)throw Error('Die Audioantwort war ungültig. Bitte erneut versuchen.');
   if(epoch!==s.epoch)return;
   let buffer=null;
   if(s.ctx){try{buffer=await s.ctx.decodeAudioData(await blob.arrayBuffer())}catch{throw Error('Die Audioantwort konnte nicht abgespielt werden. Bitte erneut versuchen.')}}
   if(epoch!==s.epoch)return;
   if(buffer&&blob.size+buffer.length*buffer.numberOfChannels*4>64*1024*1024)buffer=null;
   const bytes=blob.size+(buffer?buffer.length*buffer.numberOfChannels*4:0);
   // Keep at most three answers / 64 MiB decoded+encoded audio. Very long
   // answers use native media playback to avoid retaining oversized PCM.
   while(s.cache.size&&(s.cache.size>=3||s.bytes+bytes>64*1024*1024)){const k=s.cache.keys().next().value;const old=s.cache.get(k);URL.revokeObjectURL(old.url);s.bytes-=old.bytes;s.cache.delete(k)}
   entry={url:URL.createObjectURL(blob),buffer,bytes};s.cache.set(key,entry);s.bytes+=bytes;s.current=entry;
   play(entry,epoch);
  }catch(e){if(epoch===s.epoch)publish('error',{error:ctrl.signal.aborted?'Das Vorlesen hat zu lange gedauert. Bitte erneut versuchen.':e.message})}
  finally{clearTimeout(timer);if(epoch===s.epoch)s.abort=null}
 }
 function nativePlay(audio){
  if(s.source){s.source.onended=null;try{s.source.stop()}catch{}s.source.disconnect();s.source=null}
  if(s.audio&&s.audio!==audio)s.audio.pause();s.audio=audio;
 }
 return {state,click,reset,nativePlay};
}
export function SpeechButton({speech,messageKey,philosopher}){
 const own=speech.state.key===messageKey?speech.state:{};
 const status=own.status;
 const label=status==='loading'?'Vorlesen wird vorbereitet – abbrechen':status==='playing'?'Vorlesen pausieren':status==='paused'?'Vorlesen fortsetzen':status==='ended'?'Antwort erneut vorlesen':status==='error'?'Vorlesen erneut versuchen':'Antwort vorlesen';
 return <div className="speech-tools">
  <button type="button" className="speech-button" data-testid="speech-button" aria-label={label} aria-busy={status==='loading'} onClick={e=>{
   // Read the rendered Markdown, so syntax, URL targets and hidden HTML are not spoken.
   const text=e.currentTarget.closest('article').querySelector('.body').innerText.replace(/\t+/g,', ').trim();
   speech.click(messageKey,philosopher,text);
  }}><span aria-hidden="true" className={status==='loading'?'speech-spinner':''}>{status==='loading'?'':status==='playing'?'Ⅱ':'▷'}</span><span>{status==='loading'?'Wird vorbereitet':status==='playing'?'Pause':status==='paused'?'Fortsetzen':status==='ended'?'Noch einmal':'Vorlesen'}</span></button>
  <span className="speech-status" role="status">{status==='error'?own.error:status==='fallback'?'Zum Abspielen bitte den Audioplayer starten.':''}</span>
  {status==='fallback'&&<audio className="speech-fallback" controls src={own.url} preload="metadata" aria-label="Antwort anhören" onPlay={e=>speech.nativePlay(e.currentTarget)}/>}
 </div>
}
