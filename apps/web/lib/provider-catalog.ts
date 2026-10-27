import type { Preset } from "@paper/core";

export const CATALOG_GROUPS = [
  {id:"login",label:"账号登录"}, {id:"vendor",label:"模型厂商"},
  {id:"thirdparty",label:"第三方平台"}, {id:"cloud",label:"云服务商"}, {id:"local",label:"本地服务"},
] as const;
export type CatalogGroup = typeof CATALOG_GROUPS[number]["id"];
const legacyFamily: Record<string,string> = {moonshot:"kimi","kimi-coding":"kimi",qwen:"qianwen","bailian-coding":"qianwen",zhipu:"zhipu","glm-coding":"zhipu",minimax:"minimax","minimax-coding":"minimax",volcengine:"volcengine","volcengine-coding":"volcengine",gemini:"google","gemini-native":"google"};
const aliases: Record<string,string> = {kimi:"月之暗面 月亮之暗面 moonshot",zhipu:"智谱 GLM bigmodel",qianwen:"通义 千问 百炼 阿里 aliyun qwen",volcengine:"火山 豆包 字节 bytedance",google:"谷歌 gemini",siliconflow:"硅基流动 siliconcloud",deepseek:"深度求索",minimax:"海螺 稀宇",stepfun:"阶跃星辰",openai:"ChatGPT GPT",chatgpt:"ChatGPT Codex"};
const vendorIds=new Set(["anthropic","openai","deepseek","qwen","moonshot","zhipu","minimax","volcengine","gemini","gemini-native","kimi-coding","glm-coding","bailian-coding","minimax-coding","volcengine-coding"]);
export const presetFamily=(p:Preset)=>legacyFamily[p.id] ?? p.family ?? p.id;
export function presetGroup(p:Preset):CatalogGroup {
  if(p.authType==="oauth")return "login";
  if(p.id==="ollama")return "local";
  if(vendorIds.has(p.id))return "vendor";
  return p.group ?? "thirdparty";
}
export function presetDomain(p:Preset) {try{return new URL(p.keyUrl || p.baseUrl || "").hostname.replace(/^www\./,"");}catch{return p.authType==="oauth"?"ChatGPT 账号授权":"自定义接口";}}
export type CatalogRow={id:string;name:string;group:CatalogGroup;icon:Preset["icon"];versions:Preset[];domain:string;targetId:string};
export function catalogRows(presets:Preset[],query=""):CatalogRow[] {
  const groups=new Map<string,Preset[]>();
  for(const p of presets){if(p.id==="custom")continue;const id=presetFamily(p);groups.set(id,[...(groups.get(id)??[]),p]);}
  const words=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return [...groups].flatMap(([id,versions])=>{
    const first=versions.find(p=>p.familyName) ?? versions[0];
    const name=id==="google"?"Google Gemini":first.familyName ?? first.name;
    const shared=`${name} ${aliases[id]??""}`;
    const hits=versions.filter(p=>words.every(w=>`${shared} ${p.name} ${p.baseUrl??""} ${p.keyUrl??""}`.toLocaleLowerCase().includes(w)));
    if(!hits.length)return [];
    const group=versions.some(p=>presetGroup(p)==="login")?"login":versions.some(p=>presetGroup(p)==="vendor")?"vendor":presetGroup(first);
    return [{id,name,group,icon:versions.find(p=>p.icon)?.icon??null,versions,domain:presetDomain(first),targetId:hits[0].id} as CatalogRow];
  }).sort((a,b)=>a.name.localeCompare(b.name,"zh-CN",{numeric:true}));
}
