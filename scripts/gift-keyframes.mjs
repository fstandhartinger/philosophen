import {chromium} from 'playwright';
import path from 'node:path';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1920,height:1080}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('file://'+path.resolve('scripts/gift-explainer/anim.html'));
for(const t of [3,9,16,22,28,34,40,47]){await page.evaluate(t=>window.seekTo(t),t);await page.screenshot({path:`evidence/video-frame-${t}.jpg`,type:'jpeg',quality:85})}
await browser.close();console.log(JSON.stringify({errors}));if(errors.length)process.exit(1);
