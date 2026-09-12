#!/usr/bin/env python3
import requests,json,sys,time,datetime,pathlib
base=sys.argv[1] if len(sys.argv)>1 else 'https://philosophen.app.mintapis.com'
out={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'base':base,'checks':[]}
s=requests.Session()
for route in ['/healthz','/api/version','/api/personas','/manifest.webmanifest','/sw.js','/']:
 r=s.get(base+route,timeout=25);out['checks'].append({'path':route,'status':r.status_code,'cacheControl':r.headers.get('Cache-Control'),'contentType':r.headers.get('Content-Type')});r.raise_for_status()
 if route=='/api/version':version=r.json()['version'];out['version']=version
 if route=='/api/personas':personas=r.json()['personas']
out['conversations']=[]
for p in personas:
 start=time.time();r=s.post(base+'/api/chat',json={'philosopher':p['id'],'version':version,'messages':[{'role':'user','content':'Ich habe heute Geburtstag. Was ist aus deiner Sicht ein gutes Leben? Antworte bitte mit höchstens drei Sätzen und einer Frage an mich.'}]},headers={'Origin':base},timeout=115)
 d=r.json();item={'id':p['id'],'status':r.status_code,'seconds':round(time.time()-start,2),'model':d.get('model'),'reply':d.get('reply'),'error':d.get('error')};out['conversations'].append(item);print(p['id'],r.status_code,item['model'],item['seconds'],flush=True)
pathlib.Path('evidence/production-verification.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
assert len(out['conversations'])==8 and all(x['status']==200 and x['reply'] for x in out['conversations'])
if len(sys.argv)>2:
 with open(sys.argv[2],'rb') as f:r=s.post(base+'/api/transcribe',data={'version':version},files={'audio':('test-de.mp3',f,'audio/mpeg')},headers={'Origin':base},timeout=50)
 d=r.json();out['transcription']={'status':r.status_code,**d};pathlib.Path('evidence/production-verification.json').write_text(json.dumps(out,ensure_ascii=False,indent=2));print('transcription',r.status_code,d.get('text'));assert r.status_code==200 and len(d.get('text',''))>10
