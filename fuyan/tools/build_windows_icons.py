from pathlib import Path
import struct, shutil
import resvg_py

source=Path(__file__).resolve().parents[1]
svg=(source/'assets/logo.svg').read_text(encoding='utf-8')
sizes=[16,20,24,28,32,40,48,64,80,96,128,256]
images=[resvg_py.svg_to_bytes(svg_string=svg,width=s,height=s) for s in sizes]
offset=6+16*len(sizes)
entries=[]
for size,png in zip(sizes,images):
    entries.append(struct.pack('<BBBBHHII',size if size<256 else 0,size if size<256 else 0,0,0,1,32,len(png),offset))
    offset+=len(png)
ico=struct.pack('<HHH',0,1,len(sizes))+b''.join(entries)+b''.join(images)
for root in [source]:
    for rel in ['assets/zai-lao-taskbar.ico','assets/zai-lao.ico','assets/icon.ico','web/brand/icon.ico']:
        (root/rel).write_bytes(ico)
    p=root/'web/index.html'
    s=p.read_text(encoding='utf-8').replace('/brand/icon.ico?v=5','/brand/icon.ico?v=6')
    p.write_text(s,encoding='utf-8')
print('Built 12 native ICO sizes directly from assets/logo.svg.')
