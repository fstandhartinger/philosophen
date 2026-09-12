import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './styles.css';
import './brand.css';
import {useSpeech,SpeechButton} from './speech';

const VERSION=__APP_VERSION__;
window.__APP_VERSION__=VERSION;
const INSTALL_STORE='philosophen-install-v1';
const INSTALL_COOLDOWN=3*24*60*60*1000;
function readInstall(){try{return JSON.parse(localStorage.getItem(INSTALL_STORE)||'{}')||{}}catch{return {}}}
const STORE='philosophen-salon-v1';
function readStore(){try{const v=JSON.parse(localStorage.getItem(STORE)||'{}');return {active:typeof v.active==='string'?v.active:null,drafts:v.drafts&&typeof v.drafts==='object'?v.drafts:{},threads:v.threads&&typeof v.threads==='object'?v.threads:{},transcripts:v.transcripts&&typeof v.transcripts==='object'?v.transcripts:{}}}catch{return {active:null,drafts:{},threads:{},transcripts:{}}}}
const initial=readStore();
function Icon({kind}){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">{kind==='mic'?<><rect x="8" y="2" width="8" height="13" rx="4"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></>:kind==='send'?<path d="m4 12 16-8-5 16-3-7-8-1Zm8 1 8-9"/>:<path d="m15 5-7 7 7 7M8 12h13"/>}</svg>}
function Modal({title,onClose,children}){const ref=useRef();useEffect(()=>{ref.current?.showModal();return()=>ref.current?.close()},[]);return <dialog ref={ref} className="dialog native-dialog" aria-labelledby="modal-title" onCancel={onClose} onClick={e=>{if(e.target===ref.current)onClose()}}><h2 id="modal-title">{title}</h2>{children}</dialog>}
function App(){
 const speech=useSpeech(VERSION);
 const [data,setData]=useState(initial);const dataRef=useRef(data);
 const [personas,setPersonas]=useState([]),[loadError,setLoadError]=useState(''),[error,setError]=useState('');
 const [busy,setBusy]=useState(false),[pending,setPending]=useState(''),[phase,setPhase]=useState(''),[seconds,setSeconds]=useState(0);
 const [online,setOnline]=useState(navigator.onLine),[update,setUpdate]=useState(false),[refreshing,setRefreshing]=useState(false);
 const [installEvent,setInstallEvent]=useState(null),[modal,setModal]=useState(null),[storageWarning,setStorageWarning]=useState(false);
 const installMemory=useRef(readInstall()),nativePending=useRef(false),installStorageFailed=useRef(false);
 const [standalone,setStandalone]=useState(matchMedia('(display-mode: standalone)').matches||navigator.standalone===true);
 const registration=useRef(null),refreshApproved=useRef(false),busyRef=useRef(false),abortChat=useRef(null),abortAudio=useRef(null),recorder=useRef(null),recordTimer=useRef(null),recordCancelled=useRef(false),mounted=useRef(true),bottom=useRef(null),input=useRef(null);
 const active=personas.find(p=>p.id===data.active);const id=active?.id;
 const draft=typeof data.drafts[id]==='string'?data.drafts[id]:'';
 const transcript=typeof data.transcripts[id]==='string'?data.transcripts[id]:'';
 const messages=Array.isArray(data.threads[id])?data.threads[id].filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string'):[];
 const working=busy||!!phase;busyRef.current=working;
 function persist(next){dataRef.current=next;setData(next);try{localStorage.setItem(STORE,JSON.stringify(next));setStorageWarning(false)}catch{setStorageWarning(true)}}
 function patch(fields){persist({...dataRef.current,...fields})}
 function setDraft(value,personaId=id){patch({drafts:{...dataRef.current.drafts,[personaId]:value}})}
 function setTranscript(value,personaId=id){patch({transcripts:{...dataRef.current.transcripts,[personaId]:value}})}
 function select(personaId){if(busyRef.current)return;speech.reset();patch({active:personaId});setError('');setPending('');window.scrollTo(0,0)}
 const errors={RATE_LIMITED:'Für diesen Moment sind es genug Fragen. Versuche es in einer Minute erneut.',GLOBAL_BUDGET_EXHAUSTED:'Der Salon hat sein heutiges Nutzungslimit erreicht. Morgen ist wieder Raum für neue Fragen.',SERVER_BUSY:'Gerade finden viele Gespräche statt. Versuche es gleich noch einmal.',ALL_PROVIDERS_FAILED:'Unsere Gesprächspartner sind gerade nicht erreichbar. Deine Frage bleibt erhalten. Versuche es erneut.',TRANSCRIBE_FAILED:'Die Aufnahme konnte gerade nicht transkribiert werden. Bitte versuche es erneut oder tippe deine Frage.',TRANSCRIBE_EMPTY:'In der Aufnahme wurde keine Sprache erkannt. Bitte sprich etwas deutlicher oder tippe deine Frage.',TRANSCRIBE_UNAVAILABLE:'Die Spracheingabe ist gerade nicht verfügbar. Du kannst deine Frage eintippen.',UNSUPPORTED_MEDIA_TYPE:'Dieses Aufnahmeformat wird leider nicht unterstützt. Bitte tippe deine Frage.',PAYLOAD_TOO_LARGE:'Die Aufnahme ist zu groß. Bitte halte sie unter einer Minute.',INVALID_MESSAGES:'Das Gespräch ist zu lang. Beginne bitte ein neues Gespräch.',VERSION_MISMATCH:'Eine neue Version ist verfügbar. Deine Frage bleibt erhalten. Bitte aktualisiere die App.',MISSING_VERSION:'Bitte aktualisiere die App, um weiterzusprechen.'};
 async function checkedResponse(res){let j;try{j=await res.json()}catch{throw Error('Der Server ist gerade nicht erreichbar. Bitte versuche es erneut.')}if(res.status===409||j.code==='VERSION_MISMATCH'){setUpdate(true);throw Error(errors.VERSION_MISMATCH)}if(!res.ok)throw Error(errors[j.code]||'Das hat gerade nicht geklappt. Bitte versuche es erneut.');return j}
 async function loadPersonas(){setLoadError('');try{const r=await fetch('/api/personas',{cache:'no-store'});const j=await checkedResponse(r);if(!Array.isArray(j.personas)||j.personas.length!==8)throw Error('Die Bibliothek konnte nicht geladen werden.');setPersonas(j.personas)}catch(e){setLoadError(navigator.onLine?e.message:'Du bist offline. Verbinde dich mit dem Internet, um den Salon zu öffnen.')}}
 async function checkVersion(){if(!navigator.onLine)return;try{const r=await fetch('/api/version',{cache:'no-store',signal:AbortSignal.timeout(8000)});if(r.ok){const j=await r.json();if(j.version!==VERSION)setUpdate(true)}await registration.current?.update()}catch{}}
 useEffect(()=>{mounted.current=true;loadPersonas();checkVersion();
  const goOnline=()=>{setOnline(true);checkVersion()};const goOffline=()=>setOnline(false);const foreground=()=>{if(document.visibilityState==='visible')checkVersion()};
  const install=e=>{e.preventDefault();setInstallEvent(e)};const installed=()=>{saveInstall({installed:true});setStandalone(true);setInstallEvent(null);setModal(current=>['invite','install'].includes(current)?null:current)};
  window.addEventListener('online',goOnline);window.addEventListener('offline',goOffline);document.addEventListener('visibilitychange',foreground);window.addEventListener('beforeinstallprompt',install);window.addEventListener('appinstalled',installed);
  const timer=setInterval(checkVersion,60000);
  if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(reg=>{registration.current=reg;if(reg.waiting)setUpdate(true);reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)setUpdate(true)})});reg.update().catch(()=>{})}).catch(()=>{});}
  const controllerChange=()=>{if(refreshApproved.current&&!busyRef.current)location.reload();else if(navigator.serviceWorker.controller)checkVersion()};navigator.serviceWorker?.addEventListener('controllerchange',controllerChange);
  return()=>{mounted.current=false;clearInterval(timer);clearInterval(recordTimer.current);abortChat.current?.abort();abortAudio.current?.abort();if(recorder.current?.state==='recording'){recordCancelled.current=true;recorder.current.stop()}recorder.current?.stream.getTracks().forEach(t=>t.stop());window.removeEventListener('online',goOnline);window.removeEventListener('offline',goOffline);document.removeEventListener('visibilitychange',foreground);window.removeEventListener('beforeinstallprompt',install);window.removeEventListener('appinstalled',installed);navigator.serviceWorker?.removeEventListener('controllerchange',controllerChange)}
 },[]);
 useEffect(()=>{if(active)bottom.current?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'end'})},[messages.length,busy,phase,active?.id]);
 async function refresh(){if(busyRef.current||refreshing)return;setRefreshing(true);try{localStorage.setItem(STORE,JSON.stringify(dataRef.current))}catch{setRefreshing(false);setError('Dein Browser kann den Entwurf gerade nicht speichern. Kopiere ihn bitte vor dem Neuladen.');return}refreshApproved.current=true;
  try{await Promise.race([registration.current?.update(),new Promise(r=>setTimeout(r,5000))])}catch{}
  if(registration.current?.waiting){registration.current.waiting.postMessage({type:'SKIP_WAITING'});setTimeout(()=>{if(!busyRef.current)location.reload()},2500)}else location.reload();
 }
 function saveInstall(value){installMemory.current=value;try{localStorage.setItem(INSTALL_STORE,JSON.stringify(value));installStorageFailed.current=false}catch{installStorageFailed.current=true}}
 function dismissInstall(){saveInstall({...installMemory.current,dismissedAt:Date.now()});setModal(null)}
 useEffect(()=>{
  const check=()=>{
   const saved=readInstall();const state=installStorageFailed.current?installMemory.current:{...installMemory.current,...saved};
   const installed=standalone||matchMedia('(display-mode: standalone)').matches||navigator.standalone===true||state.installed;
   const phone=/iPhone|iPod|Android.*Mobile/i.test(navigator.userAgent);
   const editing=document.activeElement?.matches('textarea,input,[contenteditable="true"]');
   if(phone&&!installed&&!working&&!modal&&!nativePending.current&&!editing&&!update&&document.visibilityState==='visible'&&(!state.dismissedAt||Date.now()-state.dismissedAt>=INSTALL_COOLDOWN))setModal('invite');
  };
  const timer=setInterval(check,1000);window.addEventListener('focus',check);document.addEventListener('visibilitychange',check);
  return()=>{clearInterval(timer);window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check)};
 },[standalone,working,modal,update]);
 async function install(){
  dismissInstall();
  if(installEvent){
   nativePending.current=true;setInstallEvent(null);
   try{await installEvent.prompt();await installEvent.userChoice}
   catch{setModal('install')}
   finally{nativePending.current=false}
  }else setModal('install');
 }
 function requestMessages(text){let list=[...messages,{role:'user',content:text}];while(list.length>23||list.reduce((n,m)=>n+m.content.length,0)>12000){if(list.length<=1)break;list=list.slice(2)}return list}
 async function send(e){e?.preventDefault();const text=draft.trim();if(!text||working||!online||text.length>4000)return;
  setError('');setBusy(true);setPending(text);const who=id;const controller=new AbortController();abortChat.current=controller;const timer=setTimeout(()=>controller.abort('timeout'),110000);
  try{const res=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({philosopher:who,messages:requestMessages(text),version:VERSION}),signal:controller.signal});const j=await checkedResponse(res);if(!j.reply?.trim())throw Error('Die Antwort war leer. Deine Frage bleibt erhalten.');
   const old=dataRef.current;const history=[...(Array.isArray(old.threads[who])?old.threads[who]:[]),{role:'user',content:text},{role:'assistant',content:j.reply}].slice(-60);
   persist({...old,threads:{...old.threads,[who]:history},drafts:{...old.drafts,[who]:''}});
  }catch(e){setError(controller.signal.aborted?(controller.signal.reason==='timeout'?'Das Gespräch hat zu lange gedauert. Deine Frage bleibt erhalten.':'Anfrage abgebrochen. Deine Frage bleibt erhalten.'):(e.message||'Keine Verbindung. Deine Frage bleibt erhalten.'))}
  finally{clearTimeout(timer);setBusy(false);setPending('');abortChat.current=null;input.current?.focus()}
 }
 async function startRecording(){if(working||!online)return;setError('');if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){setError('Dein Browser unterstützt hier keine Mikrofonaufnahme. Bitte tippe deine Frage ein.');return}
  setPhase('requesting');const who=id;let stream;
  try{stream=await navigator.mediaDevices.getUserMedia({audio:true});if(!mounted.current){stream.getTracks().forEach(t=>t.stop());return}
   const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg;codecs=opus'].find(x=>MediaRecorder.isTypeSupported?.(x));const rec=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);recorder.current=rec;recordCancelled.current=false;const chunks=[];
   rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
   rec.onerror=()=>{recordCancelled.current=true;clearInterval(recordTimer.current);stream.getTracks().forEach(t=>t.stop());setPhase('');setError('Die Aufnahme wurde unterbrochen. Bitte versuche es erneut.')};
   rec.onstop=async()=>{clearInterval(recordTimer.current);stream.getTracks().forEach(t=>t.stop());if(recordCancelled.current||!mounted.current){setPhase('');return}
    const blob=new Blob(chunks,{type:rec.mimeType||mime||'audio/webm'});if(blob.size===0){setPhase('');setError('Die Aufnahme ist leer. Bitte versuche es erneut.');return}if(blob.size>12*1024*1024){setPhase('');setError(errors.PAYLOAD_TOO_LARGE);return}
    setPhase('transcribing');const controller=new AbortController();abortAudio.current=controller;const timer=setTimeout(()=>controller.abort(),45000);
    try{const fd=new FormData();fd.append('audio',blob,blob.type.includes('mp4')?'aufnahme.m4a':blob.type.includes('ogg')?'aufnahme.ogg':'aufnahme.webm');fd.append('version',VERSION);const r=await fetch('/api/transcribe',{method:'POST',body:fd,signal:controller.signal});const j=await checkedResponse(r);if(!j.text?.trim())throw Error(errors.TRANSCRIBE_EMPTY);setTranscript(j.text.trim(),who)}catch(e){setError(controller.signal.aborted?'Die Transkription wurde abgebrochen. Du kannst deine Frage eintippen.':e.message)}finally{clearTimeout(timer);setPhase('');abortAudio.current=null}
   };
   rec.start(250);setSeconds(0);setPhase('recording');const start=Date.now();recordTimer.current=setInterval(()=>{const elapsed=Math.floor((Date.now()-start)/1000);setSeconds(elapsed);if(elapsed>=60&&rec.state==='recording')rec.stop()},250);
  }catch(e){stream?.getTracks().forEach(t=>t.stop());setPhase('');setError(e.name==='NotAllowedError'?'Mikrofonzugriff wurde nicht erlaubt. Du kannst ihn in den Browser-Einstellungen freigeben oder deine Frage tippen.':e.name==='NotFoundError'?'Es wurde kein Mikrofon gefunden. Bitte tippe deine Frage.':'Das Mikrofon ist gerade nicht verfügbar. Bitte schließe andere Aufnahmen oder tippe deine Frage.')}
 }
 function stopRecording(cancel=false){recordCancelled.current=cancel;if(recorder.current?.state==='recording')recorder.current.stop()}
 function clear(){speech.reset();const old=dataRef.current;persist({...old,threads:{...old.threads,[id]:[]},drafts:{...old.drafts,[id]:''},transcripts:{...old.transcripts,[id]:''}});setError('');setModal(null)}
 const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 return <div className="shell">
  <a className="skip-link" href="#main">Zum Inhalt</a>
  {update&&<div className="update-banner" data-testid="update-available" role="status"><div className="txt"><strong>Eine neue Version ist verfügbar</strong>{working?<span className="busy-hint">Nach dem Gespräch oder der Aufnahme kannst du sicher aktualisieren.</span>:<span>Deine Entwürfe und Gespräche bleiben erhalten.</span>}</div><button className="act" data-testid="update-accept" disabled={working||refreshing} onClick={refresh}>{refreshing?'Wird geladen …':'Jetzt aktualisieren'}</button></div>}
  <header className="topbar"><div className="container topbar-inner"><button className="brand" aria-label="Armins und seine Philosophen Kumpels. — zur Auswahl" disabled={working} onClick={()=>select(null)}><img className="brand-icon" src="/icons/logo.svg" alt=""/><span className="brand-mark">Armins und seine Philosophen Kumpels.</span></button><div className="header-actions">{!online&&<span className="offline-pill" data-testid="offline" role="status"><span className="dot"/>Offline</span>}{!standalone&&<button className="install-link" onClick={install}>App installieren <span aria-hidden="true">↗</span></button>}</div></div></header>
  {storageWarning&&<div className="notice container" role="alert">Dein Browser kann Gespräche gerade nicht dauerhaft speichern. Halte diese Seite geöffnet oder kopiere wichtige Texte.</div>}
  {!active?<main id="main" className="container" tabIndex="-1"><section className="hero"><div className="hero-kicker"><span className="rule"/> EIN SALON FÜR DEINE GEDANKEN </div><h1>Was würde der<br/><span className="accent">Philosoph</span> sagen?</h1><p className="dedication"><span className="rule"/>Für Armin. Zum Geburtstag – und für die Neugier, die bleibt.</p></section>
   <section aria-labelledby="collection-title"><div className="section-head"><h2 className="section-title" id="collection-title">Mit wem möchtest du denken?</h2><span className="section-no">01 — 08 / ZEITLOSE PERSPEKTIVEN</span></div>
    {loadError?<div className="grid-status" role="alert">{loadError}<div><button className="btn-retry" onClick={loadPersonas}>Erneut versuchen</button></div></div>:personas.length===0?<div className="grid-status" role="status">Die Türen des Salons öffnen sich …</div>:<div className="grid">{personas.map((p,i)=><button className="card" data-testid="persona-card" key={p.id} onClick={()=>select(p.id)} aria-label={`Mit ${p.name} sprechen`}><div className="card-portrait"><img src={p.image} alt={`Künstlerisches KI-Porträt von ${p.name}`} width="640" height="640" loading={i<4?'eager':'lazy'}/></div><div className="card-body"><span className="card-order">{String(i+1).padStart(2,'0')} / {i<3?'ANTIKE':'MODERNE'}</span><h3 className="card-name">{p.name}</h3><span className="card-dates">{p.dates}</span><p className="card-worldview">{p.worldview}</p><span className="card-cta">Gespräch beginnen <span className="arr" aria-hidden="true">↗</span></span></div></button>)}</div>}
   </section><div className="landing-note"><span aria-hidden="true">✧</span> Keine fertigen Antworten. Neue Wege, deine Fragen zu betrachten.</div>
  </main>:<main id="main" className="chat-shell" tabIndex="-1"><div className="chat-header"><div className="chat-header-inner"><button className="btn-back" data-testid="back" disabled={working} onClick={()=>select(null)}><span aria-hidden="true">←</span> Auswahl</button><div className="chat-persona"><img src={active.image} alt=""/><div><h1 className="name">{active.name}</h1><div className="dates">{active.dates}</div></div></div><button className="btn-clear" data-testid="clear" disabled={working} onClick={()=>setModal('clear')}>Neu beginnen</button></div></div>
   <div className="chat-scroll"><div className="chat-flow"><div className="greeting-block"><p className="quote">{active.greeting}</p><p className="attrib">Eine imaginative Begegnung mit {active.name}</p></div>{messages.length===0&&!busy&&<div className="starters">{active.starters.slice(0,3).map(s=><button key={s} className="btn-starter" onClick={()=>{setDraft(s);input.current?.focus()}}>{s}</button>)}</div>}
    <div aria-live="polite" aria-relevant="additions text">{messages.map((m,i)=><div key={i} className={`msg-row ${m.role}`} data-testid="message"><article className={`msg ${m.role}`}><div className="who">{m.role==='user'?'DU':active.name}</div><div className="body"><Markdown remarkPlugins={[remarkGfm]} skipHtml components={{a:({children,...props})=><a {...props} target="_blank" rel="noopener noreferrer">{children}</a>,img:()=>null}}>{m.content}</Markdown></div>{m.role==='assistant'&&m.content.trim()&&<SpeechButton speech={speech} messageKey={id+':'+i+':'+m.content} philosopher={id}/>}</article></div>)}
    {busy&&<><div className="msg-row user"><article className="msg user"><div className="who">DU</div><div className="body">{pending}</div></article></div><div className="msg-row assistant"><article className="msg assistant" role="status"><div className="who">{active.name} denkt nach</div><div className="typing" aria-hidden="true"><span/><span/><span/></div></article></div></>}</div><div ref={bottom}/>
   </div></div>
   <div className="composer"><div className="composer-inner">{error&&<div className="notice" role="alert">{error}<button onClick={()=>setError('')} aria-label="Hinweis schließen">×</button></div>}
    {transcript&&<div className="transcript-box"><label className="label" htmlFor="transcript">Dein Transkript · prüfen und bearbeiten</label><textarea id="transcript" data-testid="transcript" value={transcript} maxLength={4000} onChange={e=>setTranscript(e.target.value)} rows="3" disabled={working}/><div className="row"><button className="drop" disabled={working} onClick={()=>setTranscript('')}>Verwerfen</button><button className="use" disabled={working} onClick={()=>{setDraft((draft?draft+'\n':'')+transcript);setTranscript('');input.current?.focus()}}>In die Frage übernehmen</button></div></div>}
    {!!phase&&<div className="rec-status" role="status"><span className="pulse"/>{phase==='recording'?`Aufnahme ${seconds} / 60 Sekunden`:phase==='requesting'?'Mikrofonfreigabe wird erwartet …':'Deine Worte werden transkribiert …'}<span className="spacer"/>{phase==='recording'&&<button onClick={()=>stopRecording(true)}>Verwerfen</button>}</div>}
    <form onSubmit={send}><div className="composer-box"><textarea ref={input} data-testid="chat-input" aria-label="Deine Frage" placeholder={`Was möchtest du ${active.name} fragen?`} rows="2" maxLength={4000} value={draft} disabled={working} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();send()}}}/><div className="composer-actions">{busy?<button type="button" className="icon-btn" onClick={()=>abortChat.current?.abort()} aria-label="Antwort abbrechen">■</button>:<><button type="button" className={`icon-btn ${phase==='recording'?'recording':''}`} data-testid="mic" aria-label={phase==='recording'?'Aufnahme stoppen':'Mikrofonaufnahme starten'} title={phase==='recording'?'Aufnahme stoppen':'Frage einsprechen'} disabled={!online||!!phase&&phase!=='recording'} onClick={()=>phase==='recording'?stopRecording():startRecording()}>{phase==='recording'?<span className="rec-dot"/>:<Icon kind="mic"/>}</button><button type="submit" className="send-btn" data-testid="send-button" aria-label="Frage senden" disabled={working||!online||!draft.trim()||draft.length>4000}><Icon kind="send"/></button></>}</div></div></form><div className="composer-meta"><span className="count">{draft.length} / 4000</span></div><p className="privacy-small">Verlauf auf diesem Gerät. Antworten: Chutes / OpenRouter. Spracheingabe: Groq. Vorlesen: ElevenLabs. <button onClick={()=>setModal('privacy')}>Datenschutz</button></p>
   </div></div>
  </main>}
  {!active&&<footer className="footer container"><p>Gespräche bleiben in deinem Browser; für Antworten werden Nachrichten an den Modellanbieter übermittelt.</p><div className="footer-row"><button onClick={()=>setModal('privacy')}>Datenschutz & Hinweise</button><span className="version-tag" data-testid="app-version">Version {VERSION}</span></div></footer>}
  {modal==='clear'&&<Modal title="Ein neues Gespräch?" onClose={()=>setModal(null)}><p>Dieses Gespräch, der Entwurf und das Transkript mit {active?.name} werden nur auf diesem Gerät gelöscht. Die anderen Gespräche bleiben erhalten.</p><div className="row"><button className="btn plain" onClick={()=>setModal(null)}>Behalten</button><button className="btn danger" onClick={clear}>Gespräch löschen</button></div></Modal>}
  {modal==='invite'&&<Modal title="Deinen Salon als App installieren?" onClose={dismissInstall}><p>So hast du deine Philosophen direkt auf dem Startbildschirm dabei.</p><div className="row install-answers"><button className="btn plain" onClick={dismissInstall}>Nein</button><button className="btn danger" onClick={install}>Ja</button></div></Modal>}
  {modal==='install'&&<Modal title="Dein Salon für unterwegs" onClose={dismissInstall}>{ios?<p>Öffne die Seite in Safari. Tippe auf <strong>Teilen</strong> und dann auf <strong>Zum Home-Bildschirm</strong>. Bestätige mit „Hinzufügen“. iOS bietet dafür keinen automatischen Installationsdialog.</p>:<p>Wenn dein Browser die Installation unterstützt, findest du im Browsermenü <strong>App installieren</strong> oder <strong>Zum Startbildschirm hinzufügen</strong>. Sobald ein direkter Installationsdialog verfügbar ist, öffnet unser Installationsknopf ihn. Du kannst die Seite auch als Lesezeichen speichern.</p>}<p>Für Gespräche und Spracheingabe brauchst du Internet.</p><div className="row"><button className="btn danger" onClick={()=>setModal(null)}>Verstanden</button></div></Modal>}
  {modal==='privacy'&&<Modal title="Ein offenes Wort" onClose={()=>setModal(null)}><p>Deine Gespräche, Entwürfe und Transkripte werden ausschließlich im Speicher dieses Browsers abgelegt. „Neu beginnen“ löscht das ausgewählte Gespräch. Gelöschte Browserdaten lassen sich nicht wiederherstellen.</p><p>Zum Antworten übermittelt der Server den relevanten Gesprächsverlauf an Chutes oder einen über OpenRouter ausgewählten Anbieter. Audio wird zur Transkription an Groq übertragen. Erst beim Tippen auf Vorlesen wird die ausgewählte Antwort an ElevenLabs übermittelt; die erzeugte Audiodatei bleibt vorübergehend im Arbeitsspeicher dieses Tabs. Die App führt keine Gesprächsdatenbank und protokolliert keine Inhalte; die Anbieter haben eigene Datenschutzregeln. Bitte teile keine vertraulichen Informationen.</p><p>Die öffentliche Nutzung ist begrenzt, damit der Salon für alle erreichbar bleibt.</p><div className="row"><button className="btn danger" onClick={()=>setModal(null)}>Zurück zum Salon</button></div></Modal>}
 </div>
}
createRoot(document.getElementById('root')).render(<App/>);
