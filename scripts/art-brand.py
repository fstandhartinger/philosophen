from PIL import Image,ImageDraw
from pathlib import Path
import requests,json
root=Path(__file__).resolve().parent.parent;p=root/'public/icons';p.mkdir(exist_ok=True)
svg='''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#192c29"/><circle cx="256" cy="256" r="183" fill="none" stroke="#cfb887" stroke-width="3"/><ellipse cx="256" cy="256" rx="101" ry="78" fill="none" stroke="#f5f1e8" stroke-width="17"/><path d="M256 117v278M224 117h64M224 395h64" stroke="#cfb887" stroke-width="17"/><circle cx="385" cy="126" r="11" fill="#b6573d"/></svg>'''
(p/'logo.svg').write_text(svg)
def icon(size,mask=False):
 s=4;im=Image.new('RGB',(512*s,512*s),'#192c29');d=ImageDraw.Draw(im);scale=.8 if mask else 1
 def box(coords):return tuple(int((256+(x-256)*scale)*s) for x in coords)
 d.ellipse(box((73,73,439,439)),outline='#cfb887',width=3*s)
 d.ellipse(box((155,178,357,334)),outline='#f5f1e8',width=17*s)
 for coords in [(256,117,256,395),(224,117,288,117),(224,395,288,395)]:d.line(box(coords),fill='#cfb887',width=17*s)
 d.ellipse(box((374,115,396,137)),fill='#b6573d')
 return im.resize((size,size),Image.Resampling.LANCZOS)
for name,size,mask in [('icon-192',192,False),('icon-512',512,False),('maskable-512',512,True),('apple-touch-icon',180,False)]:icon(size,mask).save(p/(name+'.png'),optimize=True)
icon(64).save(p/'favicon.ico',sizes=[(16,16),(32,32),(48,48),(64,64)])
f=root/'public/fonts';f.mkdir(exist_ok=True)
fonts={'cormorant-garamond.ttf':'ofl/cormorantgaramond/CormorantGaramond[wght].ttf','dm-sans.ttf':'ofl/dmsans/DMSans[opsz,wght].ttf','Cormorant-Garamond-OFL.txt':'ofl/cormorantgaramond/OFL.txt','DM-Sans-OFL.txt':'ofl/dmsans/OFL.txt'}
for name,path in fonts.items():
 r=requests.get('https://raw.githubusercontent.com/google/fonts/main/'+path,timeout=30);r.raise_for_status();(f/name).write_bytes(r.content)
print('Designed phi brand and icons; local OFL fonts downloaded.')
