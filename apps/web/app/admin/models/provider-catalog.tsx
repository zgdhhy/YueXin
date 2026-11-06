"use client";

import { useLayoutEffect, useRef } from "react";
import { SlidersHorizontal, Search } from "lucide-react";
import type { Preset } from "@paper/core";
import { catalogRows, CATALOG_GROUPS } from "@/lib/provider-catalog";
import { LlmIconImg } from "@/components/admin/llm-icon-img";
import { SearchInput } from "./workspace-ui";

export function ProviderCatalog({presets,query,category,onQuery,onCategory,onChoose}:{presets:Preset[];query:string;category:string;onQuery:(value:string)=>void;onCategory:(value:string)=>void;onChoose:(id:string)=>void}) {
  const results = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { results.current?.scrollTo(0, 0); }, [query, category]);
  const rows=catalogRows(presets,query);
  const visible=category==="all"?rows:rows.filter(row=>row.group===category);
  return <div className="provider-catalog">
    <div className="catalog-head">
      <SearchInput autoFocus value={query} onChange={onQuery} label="搜索服务商，如 DeepSeek、Codex" placeholder="搜索名称或网址，例如 Kimi、智谱、OpenRouter"/>
      <nav aria-label="服务商分类" className="catalog-categories">{[{id:"all",label:"全部"},...CATALOG_GROUPS].map(({id,label})=><button type="button" key={id} aria-pressed={category===id} onClick={()=>onCategory(id)}>{label}</button>)}</nav>
    </div>
    <div ref={results} className="catalog-results" aria-label="服务商目录">
      {category==="all"&&<button type="button" className="catalog-provider" onClick={()=>onChoose("custom")}><span className="catalog-logo"><SlidersHorizontal size={20}/></span><span className="catalog-provider-copy"><strong>自定义配置</strong><small>手动填写接口地址和 API Key</small></span></button>}
      {CATALOG_GROUPS.map(group=>{const items=visible.filter(row=>row.group===group.id);if(!items.length)return null;return <section key={group.id} className="catalog-section"><h3>{group.label}</h3><div className="catalog-grid">{items.map(row=><button type="button" key={row.id} className="catalog-provider" onClick={()=>onChoose(row.targetId)}><span className="catalog-logo"><LlmIconImg icon={row.icon} name={row.name} size={26}/></span><span className="catalog-provider-copy"><strong>{row.name}</strong><small>{row.group==="login"?"使用 ChatGPT 账号登录":row.domain}</small></span></button>)}</div></section>;})}
      {!visible.length&&<div className="mw-empty"><Search size={24}/><p>没有匹配的服务商</p><button type="button" className="mw-action" onClick={()=>{onQuery("");onCategory("all");}}>查看全部</button></div>}
    </div>
  </div>;
}
