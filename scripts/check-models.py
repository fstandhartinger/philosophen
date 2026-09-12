import os,json,urllib.request,concurrent.futures,time,datetime
models=[('chutes','moonshotai/Kimi-K3-TEE'),('chutes','Qwen/Qwen3.8-27B-TEE'),('openrouter','openrouter/free'),('openrouter','openai/gpt-5.6-luna')]
def check(pair):
 p,m=pair;start=time.time();url='https://llm.chutes.ai/v1/chat/completions' if p=='chutes' else 'https://openrouter.ai/api/v1/chat/completions'
 body={'model':m,'messages':[{'role':'user','content':'Antworte auf Deutsch mit einem kurzen Satz: Was macht eine gute Frage aus?'}],'max_tokens':1400,'stream':False}
 if p=='chutes':body['chat_template_kwargs']={'enable_thinking':False}
 try:
  req=urllib.request.Request(url,data=json.dumps(body).encode(),headers={'Authorization':'Bearer '+(os.environ.get(p.upper()+'_API_KEY') or os.environ.get('OPEN_ROUTER_API_KEY','')),'Content-Type':'application/json'})
  with urllib.request.urlopen(req,timeout=80) as r:data=json.load(r)
  answer=data.get('choices',[{}])[0].get('message',{}).get('content','');return {'provider':p,'requested':m,'returned':data.get('model'),'ok':bool(answer),'answer':answer,'seconds':round(time.time()-start,2)}
 except Exception as e:return {'provider':p,'requested':m,'ok':False,'error':str(e),'seconds':round(time.time()-start,2)}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:results=list(ex.map(check,models))
report={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'catalogMatches':models,'completions':results};json.dump(report,open('evidence/model-catalog-and-completions.json','w'),ensure_ascii=False,indent=2);print(json.dumps(report,ensure_ascii=False,indent=2))
