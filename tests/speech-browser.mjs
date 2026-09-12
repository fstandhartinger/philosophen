import {chromium,webkit} from 'playwright';
import {expect} from '@playwright/test';
import fs from 'node:fs';
const base=process.env.BASE_URL||'http://localhost:3110';
const audio=fs.readFileSync('evidence/tts/live-male.mp3');
const results=[];
for(const [name,engine,mobile] of [['desktop',chromium,false],['mobile',chromium,true],['webkit',webkit,true]]){
 let browser;
 try{browser=await engine.launch(name==='webkit'?{}:{args:['--autoplay-policy=user-gesture-required']})}catch(e){results.push({name,skipped:e.message.split('\n')[0]});continue}
 try{
 const ctx=await browser.newContext({viewport:{width:mobile?390:1280,height:844},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
 await ctx.addInitScript(()=>{localStorage.setItem('philosophen-install-v1',JSON.stringify({dismissedAt:Date.now()}));const C=window.AudioContext||window.webkitAudioContext;if(C){const original=C.prototype.createBufferSource;C.prototype.createBufferSource=function(){const x=original.call(this),start=x.start.bind(x);x.start=(...args)=>{window.speechStarts=(window.speechStarts||0)+1;window.speechContextState=this.state;start(...args)};return x}}});
 const p=await ctx.newPage();let requests=[];let delay=1600;let fail=false;
 await p.route('**/api/speech',async r=>{requests.push(r.request().postDataJSON());await new Promise(x=>setTimeout(x,delay));await r.fulfill(fail?{status:502,json:{code:'SPEECH_FAILED'}}:{status:200,contentType:'audio/mpeg',body:audio}).catch(()=>{})});
 await p.route('**/api/chat',async r=>{await new Promise(x=>setTimeout(x,400));await r.fulfill({json:{reply:'**Freiheit** heißt: selbst denken.\n\n- Mut haben\n- [Fragen stellen](https://example.org)'}})});
 await p.goto(base);await p.getByTestId('persona-card').first().click();await p.getByTestId('chat-input').fill('Was ist Freiheit?');await p.getByTestId('send-button').click();await expect(p.getByTestId('speech-button')).toHaveCount(0);await expect(p.getByTestId('speech-button')).toHaveCount(1);expect(requests.length).toBe(0);
 await p.getByTestId('speech-button').click();await expect(p.locator('.speech-spinner')).toBeVisible();await p.screenshot({path:`evidence/tts/${name}-loading.png`});expect(requests[0].philosopher).toBe('sokrates');expect(requests[0].text).toContain('Freiheit');expect(requests[0].text).not.toMatch(/\*\*|https:|\]\(/);expect(requests[0].text).toContain('Fragen stellen');
 await expect(p.getByRole('button',{name:'Vorlesen pausieren'})).toBeVisible({timeout:10000});expect(await p.evaluate(()=>window.speechContextState)).toBe('running');await p.screenshot({path:`evidence/tts/${name}-playing.png`});
 await p.getByRole('button',{name:'Vorlesen pausieren'}).click();await p.getByRole('button',{name:'Vorlesen fortsetzen'}).click();expect(requests.length).toBe(1);await expect(p.getByRole('button',{name:'Antwort erneut vorlesen'})).toBeVisible({timeout:20000});await p.getByRole('button',{name:'Antwort erneut vorlesen'}).click();expect(requests.length).toBe(1);
 expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await p.getByTestId('back').click();await p.getByTestId('persona-card').nth(5).click();await p.getByTestId('chat-input').fill('Warum denken?');await p.getByTestId('send-button').click();await expect(p.getByTestId('speech-button')).toHaveCount(1);
 delay=2000;await p.getByTestId('speech-button').click();await expect(p.locator('.speech-spinner')).toBeVisible();const starts=await p.evaluate(()=>window.speechStarts);await p.getByTestId('back').click();await p.waitForTimeout(2300);expect(await p.evaluate(()=>window.speechStarts)).toBe(starts);expect(requests.at(-1).philosopher).toBe('arendt');
 await p.getByTestId('persona-card').nth(5).click();fail=true;delay=100;await p.getByTestId('speech-button').click();await expect(p.getByRole('button',{name:'Vorlesen erneut versuchen'})).toBeVisible();fail=false;await p.getByRole('button',{name:'Vorlesen erneut versuchen'}).click();await expect(p.getByRole('button',{name:'Vorlesen pausieren'})).toBeVisible();await p.getByTestId('clear').click();await p.getByRole('button',{name:'Gespräch löschen'}).click();await expect(p.getByTestId('speech-button')).toHaveCount(0);
 // Browser blocks/unavailable WebAudio: usable native controls are retained.
 await p.evaluate(()=>{window.AudioContext=undefined;window.webkitAudioContext=undefined});await p.getByTestId('chat-input').fill('Noch eine Frage');await p.getByTestId('send-button').click();await expect(p.getByTestId('speech-button')).toHaveCount(1);await p.getByTestId('speech-button').click();await expect(p.locator('audio[controls]')).toBeVisible();
 results.push({name,passed:true,requests:requests.length,autoplay:'real AudioBufferSource started with running context after delay; gesture policy enabled'});
 }finally{await browser.close()}
}
fs.writeFileSync('evidence/tts/browser-results.json',JSON.stringify(results,null,2));console.log(results);
