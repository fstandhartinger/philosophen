import {chromium} from 'playwright';
import {expect} from '@playwright/test';
import fs from 'node:fs';
const base=process.env.BASE_URL||'http://127.0.0.1:3112';
const tag=process.env.EVIDENCE_TAG||'local';
const dir=`evidence/update-banner/${tag}`;fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch();const results=[];
try{for(const [width,height] of [[320,740],[360,800],[390,844],[430,932],[844,390],[1440,900]])for(const zoom of [1,2]){
 const ctx=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
 await ctx.addInitScript(()=>{localStorage.setItem('philosophen-install-v1',JSON.stringify({dismissedAt:Date.now()}));let calls=0;const reg={update:()=>++calls>1?new Promise(()=>{}):Promise.resolve(),addEventListener(){}};Object.defineProperty(navigator,'serviceWorker',{value:{register:()=>Promise.resolve(reg),addEventListener(){},removeEventListener(){}}});});
 const p=await ctx.newPage();await p.goto(base);
 if(tag!=='before'){await expect(p.locator('.brand')).toHaveText('Armins Philosophen Kumpels.');await expect(p.locator('.brand')).toHaveAttribute('aria-label','Armins Philosophen Kumpels. — zur Auswahl');}
 await p.evaluate(zoom=>document.documentElement.style.fontSize=`${zoom*100}%`,zoom);
 const baselineWidth=await p.evaluate(()=>document.documentElement.scrollWidth);
 await p.route('**/api/version',r=>r.fulfill({json:{version:'forced-banner-update'}}));
 // Sample every frame from the actual React insertion, including any entry animation.
 await p.evaluate(()=>{window.bannerFrames=[];const sample=()=>{const el=document.querySelector('.update-banner');if(el){const b=el.getBoundingClientRect(),a=el.querySelector('button').getBoundingClientRect();window.bannerFrames.push({x:b.x,right:b.right,y:b.y,bottom:b.bottom,center:b.x+b.width/2,button:{x:a.x,right:a.right,y:a.y,bottom:a.bottom},animations:el.getAnimations().length});}if(window.bannerFrames.length<30)requestAnimationFrame(sample)};requestAnimationFrame(sample);document.dispatchEvent(new Event('visibilitychange'));});
 const banner=p.getByTestId('update-available'),button=p.getByTestId('update-accept');await expect(banner).toBeVisible();await p.waitForFunction(()=>window.bannerFrames.length>=2);
 await p.screenshot({path:`${dir}/${width}-${zoom}-entry.png`});await p.waitForFunction(()=>window.bannerFrames.length===30);
 async function check(state){const data=await banner.evaluate(el=>{const r=el.getBoundingClientRect(),a=el.querySelector('button').getBoundingClientRect();return {x:r.x,right:r.right,y:r.y,bottom:r.bottom,center:r.x+r.width/2,button:{x:a.x,right:a.right,y:a.y,bottom:a.bottom},overflow:el.scrollWidth>el.clientWidth,pageOverflow:document.documentElement.scrollWidth>innerWidth,transform:getComputedStyle(el).transform,position:getComputedStyle(el).position}});results.push({width,height,zoom,state,...data});await p.screenshot({path:`${dir}/${width}-${zoom}-${state}.png`});if(tag==='before')return;for(const r of [data,...(state==='idle'?await p.evaluate(()=>window.bannerFrames):[])]){expect(r.x).toBeGreaterThanOrEqual(15);expect(r.right).toBeLessThanOrEqual(width-15);expect(Math.abs(r.center-width/2)).toBeLessThan(1);expect(r.y).toBeGreaterThanOrEqual(0);expect(r.bottom).toBeLessThanOrEqual(height);expect(r.button.x).toBeGreaterThanOrEqual(r.x);expect(r.button.right).toBeLessThanOrEqual(r.right);expect(r.button.y).toBeGreaterThanOrEqual(r.y);expect(r.button.bottom).toBeLessThanOrEqual(r.bottom);}expect(data.overflow).toBe(false);expect(await p.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(Math.max(width,baselineWidth));}
 await check('idle');if(tag==='before'){await ctx.close();continue;}
 await p.getByTestId('persona-card').first().focus();await p.keyboard.press('Enter');await p.getByTestId('chat-input').fill('Banner-Testentwurf');await p.route('**/api/chat',()=>{});await p.getByTestId('send-button').focus();await p.keyboard.press('Enter');await expect(button).toBeDisabled();await expect(banner).toContainText('Nach dem Gespräch');await check('busy');await p.getByRole('button',{name:'Antwort abbrechen'}).focus();await p.keyboard.press('Enter');await expect(button).toBeEnabled();
 // Hold the refresh timer, without changing the component or its React state.
 await p.evaluate(()=>{const original=window.setTimeout;window.setTimeout=(fn,ms,...args)=>ms===5000?0:original(fn,ms,...args)});
 await button.click();await expect(button).toHaveText('Wird geladen …');await expect(button).toBeDisabled();await check('refreshing');await ctx.close();
} }finally{fs.writeFileSync(`${dir}/results.json`,JSON.stringify({base,at:new Date().toISOString(),results},null,2));await browser.close();}
console.log(`${results.length} banner states checked: ${base}`);
