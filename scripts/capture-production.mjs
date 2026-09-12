import {chromium} from 'playwright';
const b=await chromium.launch();
const base='https://philosophen.app.mintapis.com';
for(const [name,width,height] of [['desktop',1440,1000],['mobile',390,844]]){
 const c=await b.newContext({viewport:{width,height},isMobile:name==='mobile',hasTouch:name==='mobile'});const p=await c.newPage();await p.goto(base);await p.getByTestId('persona-card').first().waitFor();await p.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))});await p.screenshot({path:`evidence/production-${name}.png`,fullPage:true});await p.getByTestId('persona-card').first().click();await p.getByTestId('chat-input').fill('Was macht ein gutes Leben aus?');await p.evaluate(async()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>{}))));await p.screenshot({path:`evidence/production-${name}-chat.png`,fullPage:true});await c.close();
}
await b.close();
