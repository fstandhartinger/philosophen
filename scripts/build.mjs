import {build} from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execSync} from 'node:child_process';
const hash=crypto.createHash('sha256');
function walk(dir){for(const name of fs.readdirSync(dir).sort()){const p=path.join(dir,name);if(fs.statSync(p).isDirectory())walk(p);else {hash.update(p);hash.update(fs.readFileSync(p))}}}
for(const dir of ['src','server','public'])walk(dir);
for(const p of ['package-lock.json','index.html','scripts/build.mjs'])hash.update(fs.readFileSync(p));
const version=process.env.BUILD_VERSION || hash.digest('hex').slice(0,16);
let revision='source-'+version;try{revision=execSync('git rev-parse HEAD',{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()}catch{}
fs.writeFileSync('version.json',JSON.stringify({version,revision,builtAt:new Date().toISOString()}));
await build({define:{__APP_VERSION__:JSON.stringify(version)}});
if(fs.existsSync('dist/sw.js'))fs.writeFileSync('dist/sw.js',fs.readFileSync('dist/sw.js','utf8').replaceAll('__BUILD_VERSION__',version));
console.log('Built version',version);
