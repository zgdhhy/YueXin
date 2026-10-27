"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Eye, EyeOff, RefreshCw } from "lucide-react";
import type { WorkspaceData, WorkspaceModel, WorkspaceProvider } from "@/lib/model-workspace";
import { LlmIconImg } from "@/components/llm-icon-img";
import { Dropdown } from "@/components/dropdown";
import { ConnectionFields, protocolLabels, type ConnectionDraft } from "./connection-fields";
import { supportsEffort } from "@paper/core/connection";
import type { Protocol, ProviderOptions } from "@paper/core/connection";
import type { RemoteModel } from "@paper/core";
import { ProviderCatalog } from "./provider-catalog";
import { VerificationPill, usable } from "./providers-section";
import { presetFamily } from "@/lib/provider-catalog";
import { PROVIDER_ICONS, guessProviderIcon, type LlmIcon } from "@paper/core/icons";
import { Action, Dialog, DraftHint, FormField, IconButton, SearchInput, TextInput, request, useDraft, type Act, type DraftStore } from "./workspace-ui";

type Common = { onClose: () => void; act: Act; store: DraftStore; data: WorkspaceData };
const host = (url: string) => { try { return ["http:", "https:"].includes(new URL(url).protocol); } catch { return false; } };

/** 编辑已有服务商时，onToggle / onDelete / onAccount 由页面提供，显示在弹窗内。 */
export function ProviderEditor({ provider, data, store, act, onClose, onSaved, onToggle, onDelete, onAccount }: Common & { provider?: WorkspaceProvider; onSaved: (id: number) => void; onToggle?: () => void; onDelete?: () => void; onAccount?: () => void }) {
  const key = provider ? `provider:${provider.id}` : "new-provider";
  const { draft: d, setDraft, discard, resumed, alive } = useDraft(store, key, () => ({
    presetId: provider?.preset ?? "", name: provider?.name ?? "", icon: provider?.customIcon ?? "", protocol: (provider?.protocol ?? "openai") as Protocol,
    baseUrl: provider?.baseUrl ?? "", apiKey: "", phase: provider ? "provider" : "template", providerId: provider?.id ?? null,
    family: "", modelsUrl: provider?.options?.modelsUrl ?? "", fullUrl: provider?.options?.fullUrl ?? false, authMode: (provider?.options?.authMode ?? "auto") as ConnectionDraft["authMode"], requestHeaders: "", clearHeaders: false, timeoutSec: String((provider?.options?.timeoutMs ?? 1800000)/1000), maxTokensField: (provider?.options?.maxTokensField ?? "max_tokens") as ConnectionDraft["maxTokensField"], reasoning: (provider?.options?.reasoning ?? "auto") as ConnectionDraft["reasoning"],
    clientRequestId: crypto.randomUUID(), search: "", category: "all", saving: false, error: "", fields: {} as Record<string,string>,
  }));
  const patch = (next: Partial<typeof d>) => setDraft((prev) => ({ ...prev, ...next }));
  const [visible, setVisible] = useState(false);
  const preset = data.presets.find((p) => p.id === d.presetId);
  const choose = (id: string) => {
    const p = data.presets.find((x) => x.id === id)!;
    patch({ presetId: id, name: p.name, protocol: p.protocol, baseUrl: p.baseUrl ?? "", apiKey: "", modelsUrl:p.modelsUrl ?? p.options?.modelsUrl ?? "", fullUrl:p.options?.fullUrl ?? false, authMode:p.options?.authMode ?? "auto", requestHeaders:"", clearHeaders:false, timeoutSec:String((p.options?.timeoutMs ?? 1800000)/1000), maxTokensField:p.options?.maxTokensField ?? "max_tokens", reasoning:p.options?.reasoning ?? "auto", phase: "provider", error: "", fields: {} });
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (d.saving || !preset) return;
    const fields: Record<string,string> = {};
    if (!d.name.trim()) fields.name = "请输入服务商名称";
    if (preset.authType !== "oauth" && !d.apiKey && !provider?.hasKey && !preset.keyOptional && d.authMode !== "none" && !d.requestHeaders.trim() && !(provider?.headerNames.length && !d.clearHeaders)) fields.apiKey = "请填写 API Key";
    if ((d.baseUrl && !host(d.baseUrl)) || (preset.id === "custom" && !d.baseUrl)) fields.baseUrl = "请填写完整的 http:// 或 https:// 地址";
    if (Object.keys(fields).length) { patch({ fields }); return; }
    let headers: Record<string,string> | undefined;
    try { headers = d.requestHeaders.trim() ? JSON.parse(d.requestHeaders) : undefined; } catch { patch({error:"自定义请求头需要是有效 JSON 对象"}); return; }
    const options:ProviderOptions={modelsUrl:d.modelsUrl,fullUrl:d.fullUrl,authMode:d.authMode,timeoutMs:Number(d.timeoutSec)*1000,maxTokensField:d.maxTokensField,reasoning:d.reasoning,...(headers?{headers}:{})};
    // Keep untouched connection options exactly as stored when only the name or icon changes.
    if(provider){
      const defaults:ProviderOptions={modelsUrl:"",fullUrl:false,authMode:"auto",timeoutMs:1800000,maxTokensField:"max_tokens",reasoning:"auto"};
      for(const key of Object.keys(defaults) as (Exclude<keyof ProviderOptions,"headers">)[])if(options[key]===(provider.options?.[key]??defaults[key]))delete options[key];
    }
    patch({ saving: true, error: "", fields: {} });
    const r = await act({ action: "save-provider", id: d.providerId ?? undefined, clientRequestId: d.clientRequestId,
      preset: preset.id, name: d.name, icon:d.icon || null, baseUrl: d.baseUrl, protocol: d.protocol, apiKey: d.apiKey, clearHeaders:d.clearHeaders, options }, "服务商配置已保存", (e) => { if (alive.current) patch({ error: e.message, fields: e.fields }); });
    if (r?.selectedId) {
      onSaved(r.selectedId);
      if (alive.current) { discard(); onClose(); }
    } else if (alive.current) patch({ saving: false });
  };
  const versions=preset?data.presets.filter(p=>presetFamily(p)===presetFamily(preset)):[];
  return <Dialog tall={d.phase==="template"} title={provider?"编辑服务商":"添加服务商"} subtitle={provider?.name}
    onClose={onClose} onBack={!provider&&d.phase==="provider"&&!d.saving?()=>patch({phase:"template"}):undefined}
    footerStart={provider&&<><button type="button" className="mw-text-action" onClick={onToggle}>{provider.enabled?"停用":"启用"}</button><button type="button" className="mw-text-action is-danger" onClick={onDelete}>删除服务商</button></>}
    footer={d.phase==="template"?undefined:<Action form="provider-editor" type="submit" tone="primary" busy={d.saving}>{provider?"保存修改":"添加服务商"}</Action>}>
    {d.phase==="template"?<ProviderCatalog presets={data.presets} query={d.search} category={d.category} onQuery={search=>patch({search})} onCategory={category=>patch({category})} onChoose={choose}/>:preset&&<form noValidate id="provider-editor" onSubmit={submit}><fieldset disabled={d.saving} className="space-y-5">
      <DraftHint resumed={resumed&&store.has(key)} onDiscard={()=>{if(!d.saving)discard();}}/>
      {d.error&&<p role="alert" className="mw-error">{d.error}</p>}
      {provider?.authType==="oauth"&&<div className="mw-status-block"><span className={provider.connected?"mw-pill is-good":"mw-pill is-warn"}>{provider.connected?"已授权":"待登录"}</span><span className="min-w-0 flex-1 break-all">{provider.connected?`${provider.account ?? "ChatGPT 账号"}${provider.plan ? ` · ${provider.plan}` : ""}`:"登录后才能添加和使用模型"}</span><Action onClick={onAccount}>{provider.connected?"管理账号":"登录账号"}</Action></div>}
      {preset.id!=="custom"&&<div className="mw-preset"><span className="catalog-logo"><LlmIconImg icon={d.icon as LlmIcon || preset.icon || guessProviderIcon({name:d.name,baseUrl:d.baseUrl})} name={preset.name} size={26}/></span><div className="min-w-0 flex-1"><strong>{preset.familyName??preset.name}</strong>{preset.note&&<p>{preset.note}</p>}</div>{preset.keyUrl&&<a href={preset.keyUrl} target="_blank" rel="noreferrer">{preset.authType==="oauth"?"服务商平台":"获取 API Key"}<ExternalLink size={14}/></a>}</div>}
      {!provider&&versions.length>1&&<FormField label="服务版本"><Dropdown value={preset.id} onChange={choose} options={versions.map(p=>({value:p.id,label:p.name,text:p.name+" / "+protocolLabels[p.protocol]+(p.region==="intl"?" / 海外":p.region==="cn"?" / 国内":"")}))}/></FormField>}
      <FormField label="服务商名称"><TextInput name="name" autoFocus value={d.name} maxLength={100} onChange={e=>patch({name:e.target.value})}/>{d.fields.name&&<span role="alert" className="mw-field-error">{d.fields.name}</span>}</FormField>
      {preset.authType!=="oauth"&&<FormField label="API Key" hint={d.authMode==="none"?"不自动添加认证头，可在高级设置中填写自定义请求头。":undefined}><div className="mw-secret"><TextInput name="apiKey" autoComplete="new-password" type={visible?"text":"password"} value={d.apiKey} onChange={e=>patch({apiKey:e.target.value})} placeholder={provider?.hasKey?"留空保留当前 Key":preset.keyOptional?"本地服务可留空":"填写 API Key"}/><IconButton label={visible?"隐藏密钥":"显示密钥"} onClick={()=>setVisible(!visible)}>{visible?<EyeOff size={17}/>:<Eye size={17}/>}</IconButton></div>{d.fields.apiKey&&<span role="alert" className="mw-field-error">{d.fields.apiKey}</span>}</FormField>}
      <ConnectionFields d={d} patch={patch} headerNames={provider?.headerNames??[]} basicOnly/>
      <details className="mw-details"><summary>高级设置</summary><div className="space-y-5">
        <FormField label="服务商图标"><Dropdown value={d.icon} onChange={icon=>patch({icon:icon as typeof d.icon})} options={[{value:"",label:"自动识别",text:"自动识别"},...PROVIDER_ICONS.map(item=>({value:item.id,text:item.name,label:<span className="flex items-center gap-3"><LlmIconImg icon={item.id} name={item.name} size={20}/>{item.name}</span>}))]}/></FormField>
        <ConnectionFields d={d} patch={patch} headerNames={provider?.headerNames??[]} omitBase/>
      </div></details>
    </fieldset></form>}
  </Dialog>;
}

export function ModelsPicker({ provider, data, store, act, onClose, onAdded }: Common & { provider:WorkspaceProvider; onAdded:(id:number,showResult?:boolean)=>void }) {
  const key = `models:${provider.id}`;
  const { draft:d, setDraft, discard, resumed, alive } = useDraft(store,key,()=>({ batch:"", batchMessage:"", query:"", manual:"", chosen:"", metadata:[] as RemoteModel[], remote:[] as string[], loaded:false, error:"", loadError:"" }));
  const patch = (next:Partial<typeof d>) => setDraft((prev)=>({...prev,...next}));
  const [loading,setLoading] = useState(false);
  const [saving,setSaving] = useState(false);
  const controller = useRef<AbortController|null>(null);
  const load = async()=>{
    controller.current?.abort(); const c=new AbortController(); controller.current=c; setLoading(true); patch({loadError:""});
    try { const r=await request({action:"remote-models",id:provider.id},c.signal); if(!c.signal.aborted) patch({remote:r.models?.map(m=>m.modelId)??[],metadata:r.models??[],loaded:true}); }
    catch(e){if(!c.signal.aborted)patch({loadError:e instanceof Error?e.message:"获取失败"});}
    finally{if(alive.current&&!c.signal.aborted)setLoading(false);}
  };
  useEffect(()=>{if(!d.loaded)void load();return()=>controller.current?.abort();},[provider.id]);
  const added=new Set(data.models.filter(m=>m.providerId===provider.id).map(m=>m.modelId));
  const preset=data.presets.find(p=>p.id===provider.preset);
  const candidates=[...new Set([...(preset?.models??[]),...d.remote])].filter(id=>!added.has(id));
  const chosen=(d.chosen||d.manual).trim();
  const add=async()=>{
    if(!chosen||saving)return;
    if(/[,，\n]/.test(chosen)){patch({error:"每次先添加一个模型，请填写单个模型 ID"});return;}
    setSaving(true);patch({error:""});
    const submitted=store.get(key);
    const r=await act({action:"add-models",id:provider.id,models:[chosen],metadata:d.metadata.filter(m=>m.modelId===chosen)},"模型已添加",e=>{if(alive.current)patch({error:e.message});});
    const id=r?.addedModelIds?.[0];
    if(!alive.current){if(id){if(store.get(key)===submitted)store.delete(key);onAdded(id,false);}return;}
    setSaving(false);
    if(id){discard();onAdded(id);}
  };
  const addBatch=async()=>{
    if(saving)return;
    const ids=[...new Set(d.batch.split(/[,，\n]+/).map(id=>id.trim()).filter(Boolean))];
    if(ids.length>200){patch({error:"一次最多添加 200 个模型"});return;}
    setSaving(true);patch({error:"",batchMessage:""});
    const r=await act({action:"add-models",id:provider.id,models:ids,metadata:d.metadata.filter(m=>ids.includes(m.modelId))},undefined,e=>{if(alive.current)patch({error:e.message});});
    if(alive.current){setSaving(false);if(r)patch({batch:"",batchMessage:`已登记 ${r.addedModelIds?.length ?? 0} 个模型，请在列表中按需测试。`});}
  };
  const filter=d.manual.trim().toLowerCase();
  const shown=candidates.filter(id=>id.toLowerCase().includes(filter));
  return <Dialog tall title="添加模型" subtitle={provider.name} onClose={onClose}
    footer={<><Action onClick={onClose}>取消</Action><Action tone="primary" busy={saving} disabled={!chosen} onClick={add}>添加并测试</Action></>}>
    <div className="space-y-4">
    <DraftHint resumed={resumed&&store.has(key)} onDiscard={()=>{if(!saving)discard();}} />
    {d.error&&<p role="alert" className="mw-error">{d.error}</p>}
      <div className="flex items-center gap-2"><SearchInput autoFocus value={d.manual} onChange={manual=>patch({manual,chosen:""})} label="模型 ID" placeholder="搜索或直接填写模型 ID"/><IconButton label="刷新列表" disabled={loading} onClick={load}><RefreshCw size={17} className={loading?"animate-spin":undefined}/></IconButton></div>
      {d.loadError&&<div role="alert" className="mw-warning"><p>无法获取模型列表，可直接填写模型 ID。</p><details className="mt-2"><summary>查看原因</summary><p className="mt-2 break-words">{d.loadError}</p></details></div>}
      <div className="space-y-2">{shown.map(id=><label key={id} className={`mw-choice ${d.chosen===id?"is-selected":""}`}><input type="radio" name="model-choice" value={id} checked={d.chosen===id} onChange={()=>patch({chosen:id})} className="accent-[#126f82]"/><code className="min-w-0 flex-1 break-all text-sm">{id}</code></label>)}
      {loading&&!shown.length&&[1,2,3].map(i=><div key={i} className="h-12 animate-pulse rounded-md bg-slate-50"/>)}
      {!loading&&!shown.length&&<p className="mw-empty">{filter?`列表中没有此模型，将直接添加「${d.manual.trim()}」`:"暂无可选模型，请直接填写模型 ID"}</p>}</div>
      <details className="mw-details"><summary>批量添加</summary><div className="space-y-4"><FormField label="模型 ID，一行一个或用逗号分隔"><textarea className="mw-input min-h-24" value={d.batch} onChange={e=>patch({batch:e.target.value})} placeholder={(candidates.length?candidates.slice(0,2):["model-a","model-b"]).join("\n")}/></FormField><Action disabled={saving || !d.batch.trim()} busy={saving} onClick={addBatch}>保存批量模型</Action>{d.batchMessage&&<p role="status" className="text-sm text-[#126f82]">{d.batchMessage}</p>}</div></details>
    </div>
  </Dialog>;
}

/** 模型弹窗：顶部是验证状态，底部左侧停用/删除，右侧设为默认与保存。 */
export function ModelEditor({ model,provider,data,store,act,onClose,testing,onTest,onToggle,onDelete,onDefault }:Common&{model:WorkspaceModel;provider:WorkspaceProvider;testing:boolean;onTest:()=>void;onToggle:()=>void;onDelete:()=>void;onDefault?:()=>void}){
  const key=`model:${model.id}`;
  const {draft:d,setDraft,discard,resumed,alive}=useDraft(store,key,()=>({displayName:model.displayName??"",upstreamModelId:model.upstreamModelId??"",contextWindow:model.contextWindow?.toString()??"",maxOutputTokens:model.maxOutputTokens.toString(),effort:model.effort??"",priceInput:model.priceInput?.toString()??"",priceOutput:model.priceOutput?.toString()??"",saving:false,error:""}));
  const patch=(next:Partial<typeof d>)=>setDraft(prev=>({...prev,...next}));
  const reasoning=supportsEffort(provider, {...model, upstreamModelId:d.upstreamModelId || null});
  const v=model.verification;
  return <Dialog title={model.displayName||model.modelId} subtitle={model.displayName?`${provider.name} · ${model.modelId}`:provider.name} onClose={onClose}
    footerStart={<><button type="button" className="mw-text-action" onClick={onToggle}>{model.enabled?"停用":"启用"}</button><button type="button" className="mw-text-action is-danger" onClick={onDelete}>删除</button></>}
    footer={<>{onDefault&&<Action onClick={onDefault}>设为默认</Action>}<Action type="submit" form="model-editor" tone="primary" busy={d.saving}>保存修改</Action></>}>
    <div className="mw-status-block"><VerificationPill model={model} provider={provider} testing={testing}/><span className="min-w-0 flex-1">{!testing&&v.status==="passed"&&v.latencyMs!=null?`${(v.latencyMs/1000).toFixed(1)} 秒`:""}</span><Action busy={testing} disabled={!usable(provider)} onClick={onTest}>测试连接</Action></div>
    {!testing&&v.status==="failed"&&v.error&&<p className="mw-error mt-3 break-words">{v.error}</p>}
    <DraftHint resumed={resumed&&store.has(key)} onDiscard={()=>{if(!d.saving)discard();}}/>
    <form id="model-editor" className="mt-5 space-y-6" onSubmit={async e=>{
      e.preventDefault();if(d.saving)return;patch({saving:true,error:""});
      const r=await act({action:"save-model",id:model.id,displayName:d.displayName,upstreamModelId:d.upstreamModelId || null,contextWindow:d.contextWindow?Number(d.contextWindow):null,maxOutputTokens:Number(d.maxOutputTokens),effort:reasoning&&d.effort?d.effort:null,priceInput:d.priceInput?Number(d.priceInput):null,priceOutput:d.priceOutput?Number(d.priceOutput):null},"模型参数已保存",e=>patch({error:e.message}));
      patch({saving:false});if(r){discard();if(alive.current)onClose();}
    }}><fieldset disabled={d.saving} className="space-y-6">
      {d.error&&<p role="alert" className="mw-error">{d.error}</p>}
      <FormField label="显示名称"><TextInput autoFocus name="displayName" value={d.displayName} onChange={e=>patch({displayName:e.target.value})} placeholder={model.modelId}/></FormField>
      <FormField label="实际请求模型 ID" hint="留空则使用模型 ID。"><TextInput value={d.upstreamModelId} onChange={e=>patch({upstreamModelId:e.target.value})} placeholder={model.modelId}/></FormField>
      <details className="mw-details"><summary>高级设置</summary><div className="space-y-5">
        <FormField label="上下文窗口（tokens，可选）"><TextInput type="number" min={1} max={100000000} value={d.contextWindow} onChange={e=>patch({contextWindow:e.target.value})}/></FormField>
        {provider.protocol!=="codex"&&<FormField label="默认输出预算（tokens）"><TextInput name="maxOutputTokens" type="number" min={256} max={2000000} value={d.maxOutputTokens} onChange={e=>patch({maxOutputTokens:e.target.value})}/></FormField>}
        {reasoning&&<FormField label="默认思考强度"><Dropdown value={d.effort} onChange={effort=>patch({effort:effort as typeof d.effort})} options={[["","模型默认"],["low","低"],["medium","中"],["high","高"],["xhigh","很高"],["max","最高"]].map(([value,label])=>({value,label,text:label}))}/></FormField>}
        {provider.authType!=="oauth"&&<div className="grid gap-4 sm:grid-cols-2"><FormField label="输入价格（$/百万 tokens）"><TextInput type="number" min={0} step="any" value={d.priceInput} onChange={e=>patch({priceInput:e.target.value})} placeholder="可选"/></FormField><FormField label="输出价格（$/百万 tokens）"><TextInput type="number" min={0} step="any" value={d.priceOutput} onChange={e=>patch({priceOutput:e.target.value})} placeholder="可选"/></FormField></div>}
      </div></details>
    </fieldset></form>
  </Dialog>;
}
