"""Build the shipped OFL font subsets; requires fonttools[woff] and brotli.

Run from the repository root. Supply --source-dir for a different installation
of the Noto SC variable TTFs. Shipping assets do not require Python at runtime.
"""
from pathlib import Path
import argparse
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.varLib.instancer import instantiateVariableFont
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-dir', type=Path, default=Path('C:/Windows/Fonts'))
args = parser.parse_args()
out=Path(__file__).resolve().parents[1] / 'apps/web/public/fonts'
out.mkdir(parents=True,exist_ok=True)
chars=set(range(0x20,0x7f))|set(range(0x2000,0x2070))|set(range(0x3000,0x3040))|set(range(0xff00,0xffef))
for high in range(0xa1,0xf8):
 for low in range(0xa1,0xff):
  try: chars.update(map(ord,bytes([high,low]).decode('gb2312')))
  except UnicodeDecodeError: pass
for name,source,weight in [('reading-sans','NotoSansSC-VF.ttf',(400,600)),('reading-display','NotoSerifSC-VF.ttf',600)]:
 f=TTFont(args.source_dir/source)
 license_text='\n\n'.join(filter(None,[f['name'].getDebugName(i) for i in [0,13,14]]))
 (out/(name+'-LICENSE.txt')).write_text(license_text,encoding='utf-8')
 options=subset.Options(); options.flavor='woff2'; options.recalc_timestamp=False
 sub=subset.Subsetter(options=options);sub.populate(unicodes=chars);sub.subset(f)
 print(name, 'subset ready', flush=True)
 f=instantiateVariableFont(f,{'wght':weight},inplace=True)
 f.flavor='woff2';f.save(out/(name+'.woff2'))
 print(name,(out/(name+'.woff2')).stat().st_size)
