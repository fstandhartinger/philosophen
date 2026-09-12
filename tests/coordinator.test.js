import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {createApp} from '../server/index.js';
const body={version:'test',philosopher:'sokrates',messages:[{role:'user',content:'Was ist ein gutes Leben?'}]};
const reply=()=>new Response(JSON.stringify({choices:[{message:{content:'Eine geprüfte Antwort.'}}]}),{status:200,headers:{'Content-Type':'application/json'}});
const app=(opts={})=>createApp({version:'test',env:{CHUTES_API_KEY:'test',OPENROUTER_API_KEY:'test',GROQ_API_KEY:'test'},...opts});
test('Reject empty conversations, blank messages and trailing assistant',async()=>{
 const a=app({fetch:async()=>{throw Error('must not call')}});
 for(const messages of [[],[{role:'user',content:'  '}],[...body.messages,{role:'assistant',content:'a'}]])assert.equal((await request(a).post('/api/chat').send({...body,messages})).status,400);
});
test('Reject excess concurrent chat immediately, then release slot',async()=>{
 let unlock,entered;const started=new Promise(r=>entered=r);const pending=new Promise(r=>unlock=r);
 const a=app({maxConcurrency:1,fetch:async()=>{entered();await pending;return reply()}});
 const first=request(a).post('/api/chat').send(body).then(r=>r);
 await started;
 const second=await request(a).post('/api/chat').send(body);assert.equal(second.status,503);assert.equal(second.body.code,'SERVER_BUSY');
 unlock();assert.equal((await first).status,200);assert.equal((await request(a).post('/api/chat').send(body)).status,200);
});
test('Audio and chat share bounded global provider budget',async()=>{
 const a=app({globalPerDay:1,fetch:async()=>reply()});assert.equal((await request(a).post('/api/chat').send(body)).status,200);
 const r=await request(a).post('/api/transcribe').attach('audio',Buffer.from('audio'),{filename:'a.webm',contentType:'audio/webm'});assert.equal(r.status,503);assert.equal(r.body.code,'GLOBAL_BUDGET_EXHAUSTED');
});
test('No more than total deadline is spent on fallback attempts',async()=>{
 let calls=0;const a=app({perAttemptTimeoutMs:50,totalTimeoutMs:85,fetch:(_u,{signal})=>new Promise((_resolve,reject)=>{calls++;signal.addEventListener('abort',()=>reject(new Error('timeout')),{once:true})})});
 const start=Date.now();const r=await request(a).post('/api/chat').send(body);assert.equal(r.status,502);assert.ok(calls<=2);assert.ok(Date.now()-start<500);
});
test('System prompts never appear in public persona metadata',async()=>{
 const r=await request(app()).get('/api/personas');assert.equal(r.body.personas.length,8);assert.ok(r.body.personas.every(p=>!('systemPrompt' in p)));assert.ok(!JSON.stringify(r.body).includes('Wichtige Grenzen'));
});
