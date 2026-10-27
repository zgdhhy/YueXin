"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { Stage } from "@paper/core";
import type { WorkspaceData } from "@/lib/model-workspace";
import { Notice } from "@/components/feedback";
import { PolicyEditor } from "./policy-editor";
import { ModelEditor, ModelsPicker, ProviderEditor } from "./workspace-panels";
import { ModelVerificationResult } from "./model-verification-result";
import { AccountPanel } from "./workspace-account";
import { ProvidersSection, roles, usable } from "./providers-section";
import { WorkflowSection } from "./workflow-section";
import { Action, ApiError, Dialog, DraftStore, request, type Act } from "./workspace-ui";
import "./workspace.css";

type PanelTarget={kind:"provider"|"models"|"model"|"verification"|"account"|"defaults"|"stage"|"delete-provider"|"delete-model"|"toggle-provider"|"toggle-model";providerId?:number;modelId?:number;stage?:Stage;
  /** 确认弹窗取消后回到的面板 */
  back?:PanelTarget};
type Panel=PanelTarget&{token:number};
const fmt=(n:number)=>n>=1e6?`${(n/1e6).toFixed(1)}M`:n>=1000?`${(n/1000).toFixed(1)}K`:String(n);

export function ModelWorkspace({initial}:{initial:WorkspaceData}){
  const [data,setData]=useState(initial);
  const [panel,setPanel]=useState<Panel|null>(null); const sequence=useRef(0);
  const store=useRef(new DraftStore()).current;
  const [notice,setNotice]=useState<{text:string;error:boolean;id:number}|null>(null);
  const [jobs,setJobs]=useState(new Set<string>());
  // 保存服务商连接后，等最新数据到达再重测其在用模型
  const [retest,setRetest]=useState<number|null>(null);
  const pending=useRef(new Set<string>());
  const apply=useCallback((next:WorkspaceData)=>setData(prev=>next.revision>=prev.revision?next:prev),[]);
  const notify=useCallback((text:string,error=false)=>setNotice({text,error,id:Date.now()}),[]);
  const act:Act=useCallback(async(command,message,onError)=>{
    const c=command as {action:string;id?:number;clientRequestId?:string};const key=`${c.action}:${c.id??c.clientRequestId??"config"}`;
    if(pending.current.has(key))return null;
    pending.current.add(key);setJobs(new Set(pending.current));
    try{const r=await request(command);if(r.data)apply(r.data);if(message)notify(message);return r;}
    catch(e){const error=e instanceof ApiError?e:new ApiError(e instanceof Error?e.message:"操作失败，请重试");if(error.data)apply(error.data);if(onError)onError(error);else notify(error.message,true);return null;}
    finally{pending.current.delete(key);setJobs(new Set(pending.current));}
  },[apply,notify]);
  const open=(next:PanelTarget)=>setPanel({...next,token:++sequence.current});
  // 添加服务商不保留草稿：关闭向导即丢弃，下次从目录重新开始
  const close=()=>{if(panel?.kind==="provider"&&!panel.providerId)store.delete("new-provider");setPanel(null);};
  const test=(id:number)=>act({action:"test",id},"模型验证完成");
  const modelAdded=(id:number,showResult=true)=>{if(showResult)open({kind:"verification",modelId:id});void test(id);};
  useEffect(()=>{
    const sp=new URLSearchParams(window.location.search);const providerId=Number(sp.get("provider"))||undefined;const modelId=Number(sp.get("model"))||undefined;
    const kinds:Record<string,Panel["kind"]>={add:"provider","edit-provider":"provider","add-models":"models",login:"account","edit-model":"model"};
    const kind=kinds[sp.get("modal")??""];if(kind)open({kind,providerId,modelId});
    if(sp.has("modal")){["modal","provider","model","preset"].forEach(k=>sp.delete(k));window.history.replaceState(null,"",`/admin/models${sp.size?`?${sp}`:""}${window.location.hash}`);}
  },[]);
  useEffect(()=>{
    if(retest===null)return;setRetest(null);
    const provider=data.providers.find(x=>x.id===retest);if(!provider||!usable(provider))return;
    for(const model of data.models)if(model.providerId===retest&&model.enabled&&roles(model,data).length&&!["passed","testing"].includes(model.verification.status))void test(model.id);
  },[retest,data]);
  const p=panel?.providerId?data.providers.find(x=>x.id===panel.providerId):undefined;
  const m=panel?.modelId?data.models.find(x=>x.id===panel.modelId):undefined;
  const mp=m?data.providers.find(x=>x.id===m.providerId):undefined;
  const available=data.models.filter(m=>m.enabled&&data.providers.some(p=>p.id===m.providerId&&usable(p)));
  const affected=panel?.kind.endsWith("provider")&&p?data.models.filter(m=>m.providerId===p.id).flatMap(m=>m.usage):m?.usage??[];
  const isToggle=panel?.kind.startsWith("toggle");
  const enabled=panel?.kind.endsWith("provider")?p?.enabled:m?.enabled;
  const targetName=panel?.kind.endsWith("provider")?p?.name:m?.displayName||m?.modelId;
  const operation=panel&&`${panel.kind}:${panel.kind.endsWith("provider")?panel.providerId:panel.modelId}`;
  /** 停用需要确认，启用直接生效；两者都从编辑弹窗发起。 */
  const toggle=(kind:"provider"|"model",id:number,on:boolean,back:PanelTarget)=>on?open({kind:`toggle-${kind}`,[kind==="provider"?"providerId":"modelId"]:id,back}):void act({action:`toggle-${kind}`,id,enabled:true},"已启用");
  const dismiss=()=>panel?.back?open(panel.back):close();
  return <div className="model-workspace">
    <header className="mw-page-header"><h1>模型配置</h1><Action tone="primary" onClick={()=>open({kind:"provider"})}><Plus size={16}/>添加服务商</Action></header>
    {!data.policy.confirmed&&<div className="mw-setup"><p>{available.length?"选择默认模型后即可开始运行。":"先连接一个服务商并添加模型。"}</p><Action tone="primary" onClick={()=>open({kind:available.length?"defaults":"provider"})}>{available.length?"选择默认模型":"添加服务商"}</Action></div>}
    <ProvidersSection data={data} jobs={jobs} open={open}/>
    <WorkflowSection data={data} onDefaults={()=>open({kind:"defaults"})} onStage={stage=>open({kind:"stage",stage})}/>
    <details className="mw-diagnostics"><summary>用量与诊断</summary><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{[["近 30 天调用",fmt(data.usage.calls)],["输入 tokens",fmt(data.usage.input)],["输出 tokens",fmt(data.usage.output)],["预估费用",`$${data.usage.cost.toFixed(2)}`]].map(([label,value])=><div key={label} className="mw-card p-4"><p className="text-[13px] text-slate-500">{label}</p><strong className="mt-2 block text-xl text-slate-800">{value}</strong></div>)}</div></details>

    {panel?.kind==="provider"&&<ProviderEditor key={panel.token} provider={p} data={data} store={store} act={act} onClose={close} onSaved={id=>{if(p)setRetest(id);}}
      onToggle={p?()=>toggle("provider",p.id,p.enabled,{kind:"provider",providerId:p.id}):undefined} onDelete={p?()=>open({kind:"delete-provider",providerId:p.id,back:{kind:"provider",providerId:p.id}}):undefined} onAccount={p?()=>open({kind:"account",providerId:p.id}):undefined}/>}
    {panel?.kind==="models"&&p&&<ModelsPicker key={panel.token} provider={p} data={data} store={store} act={act} onClose={close} onAdded={modelAdded}/>}
    {panel?.kind==="verification"&&m&&mp&&<ModelVerificationResult key={panel.token} model={m} provider={mp} policy={data.policy} act={act} testing={jobs.has(`test:${m.id}`)} onTest={()=>void test(m.id)} onClose={close}/>}
    {panel?.kind==="account"&&p&&<AccountPanel key={panel.token} provider={p} data={data} store={store} act={act} onClose={close}/>}
    {panel?.kind==="model"&&m&&mp&&<ModelEditor key={panel.token} model={m} provider={mp} data={data} store={store} act={act} onClose={close}
      testing={jobs.has(`test:${m.id}`)} onTest={()=>void test(m.id)} onToggle={()=>toggle("model",m.id,m.enabled,{kind:"model",modelId:m.id})}
      onDelete={()=>open({kind:"delete-model",modelId:m.id,back:{kind:"model",modelId:m.id}})}
      onDefault={m.enabled&&usable(mp)&&data.policy.defaultModelId!==m.id?()=>open({kind:"defaults",modelId:m.id}):undefined}/>}
    {(panel?.kind==="defaults"||panel?.kind==="stage")&&<PolicyEditor key={panel.token} data={data} stage={panel.stage} initialModelId={panel.modelId} store={store} act={act} onClose={close}/>}
    {panel&&(panel.kind.startsWith("delete")||panel.kind.startsWith("toggle"))&&<Dialog size="sm" title={`${isToggle?"停用":"删除"}${panel.kind.endsWith("provider")?"服务商":"模型"}`} subtitle={panel.kind==="delete-provider"?undefined:targetName} onClose={dismiss} footer={<><Action onClick={dismiss}>取消</Action><Action tone="danger" busy={!!operation&&jobs.has(operation)} onClick={async()=>{
      const token=panel.token;const r=await act({action:panel.kind,id:panel.kind.endsWith("provider")?panel.providerId:panel.modelId,...(isToggle?{enabled:!enabled}:{})},isToggle?"已停用":"已删除");
      if(r)setPanel(current=>current?.token===token?null:current);
    }}>{isToggle?"确认停用":"确认删除"}</Action></>}><div className="space-y-4"><p className="text-sm leading-relaxed text-slate-700">{isToggle?"新运行将不能使用，进行中的运行不受影响。":panel.kind==="delete-model"?`确定要删除模型 "${targetName}" 吗？此操作无法撤销。`:`确定要删除服务商 "${targetName}" 吗？此操作无法撤销。`}</p>{affected.length>0&&<p className="mw-warning">{panel.kind==="delete-model"?"以下环节需要重新选择模型：":"影响："}{[...new Set(affected)].join("、")}</p>}</div></Dialog>}
    {notice&&<Notice key={notice.id} message={notice.text} tone={notice.error?"error":"success"} onClose={()=>setNotice(null)}/>}
  </div>;
}
