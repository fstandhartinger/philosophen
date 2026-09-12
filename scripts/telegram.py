#!/usr/bin/env python3
"""Authorized gift deliveries; logs only message IDs and local filenames."""
import os,json,sys,requests,datetime,pathlib
method=sys.argv[1];value=sys.argv[2];caption=sys.argv[3] if len(sys.argv)>3 else ''
data={'chat_id':os.environ.get('TG_CHAT_ID','7367548582')};files=None
if method=='sendMessage':data['text']=value
else:
 field={'sendPhoto':'photo','sendDocument':'document','sendVideo':'video'}[method]
 files={field:open(value,'rb')};data['caption']=caption
 if method=='sendVideo':data['supports_streaming']='true'
try:
 r=requests.post('https://api.telegram.org/bot'+os.environ['TG_BOT_TOKEN']+'/'+method,data=data,files=files,timeout=120);body=r.json()
 if not body.get('ok'):raise RuntimeError(body.get('description','Telegram failed'))
 item={'time':datetime.datetime.now(datetime.timezone.utc).isoformat(),'method':method,'file':value if files else None,'text':caption if files else value,'message_id':body['result']['message_id']}
 p=pathlib.Path('evidence/telegram-deliveries.json');history=json.loads(p.read_text()) if p.exists() else [];history.append(item);p.write_text(json.dumps(history,ensure_ascii=False,indent=2));print(json.dumps({'ok':True,'message_id':item['message_id'],'file':item['file']}))
except Exception as e:
 print('Telegram delivery failed:',type(e).__name__);sys.exit(1)
finally:
 if files:
  for f in files.values():f.close()
