// Copy reviewed brand assets from CC Switch; never fetch favicons from provider websites.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
const root=process.argv[2] ?? "data/upstream-cc-switch-20261026";
const dir=path.join(root,"src/icons/extracted");
function load(file,key){const source=fs.readFileSync(path.join(dir,file),"utf8");const exports={};vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:id=>{if(!id.startsWith("./"))throw Error("Unexpected icon dependency");return {default:id.replace(/\?url$/,"")};}},{timeout:2000});return exports[key];}
const assets={...load("index.ts","icons"),...load("index.ts","iconUrls")},metadata=load("metadata.ts","iconMetadata");
const wanted=new Set();
for(const file of ["claudeProviderPresets.ts","codexProviderPresets.ts","geminiProviderPresets.ts"])for(const m of fs.readFileSync(path.join(root,"src/config",file),"utf8").matchAll(/\bicon:\s*"([\w-]+)"/g))wanted.add(m[1]);
const manifest={};
for(const name of wanted){
  const value=assets[name];if(typeof value!=="string")continue;
  let filename;
  if(value.trim().startsWith("<svg")){
    const color=metadata[name]?.defaultColor;
    const svg=value.replace(/currentColor/g,color && color!=="currentColor"?color:"#243447");
    if(/<script|<foreignObject|\bon\w+\s*=|(?:href|src)\s*=\s*["'](?:https?:|javascript:|data:text)/i.test(svg))throw Error(`Unsafe SVG: ${name}`);
    filename=`cc-${name}.svg`;fs.writeFileSync(path.join("apps/web/public/llm-icons",filename),svg);
  }else{
    const src=path.resolve(dir,value);if(!src.startsWith(path.resolve(dir)+path.sep)||!fs.existsSync(src))continue;
    filename=`cc-${name}${path.extname(src)}`;fs.copyFileSync(src,path.join("apps/web/public/llm-icons",filename));
  }
  manifest[name]={name:metadata[name]?.displayName ?? name,file:filename};
}
// Existing LobeHub assets remain the preferred version of already supported brands.
const legacy=fs.readFileSync("packages/core/src/llm/icons.ts","utf8").split("const ICON_IDS")[0];
for(const [,id,name]of legacy.matchAll(/\["([\w-]+)",\s*"([^"]+)"\]/g))if(fs.existsSync(`apps/web/public/llm-icons/${id}.svg`))manifest[id]={name,file:`${id}.svg`};
manifest.codex={name:"ChatGPT / Codex",file:"openai.svg"};
fs.writeFileSync("packages/core/src/llm/icon-assets.ts",`/** Local brand assets: CC Switch (MIT, Jason Young) and existing LobeHub icons.\n * Regenerate using scripts/sync-provider-icons.mjs. See public/llm-icons/LICENSE.txt.\n */\nexport const ICON_ASSETS = ${JSON.stringify(manifest,null,2)} as const;\n`);
console.log(`Registered ${Object.keys(manifest).length} local provider icons.`);
