"use client";

import type { Protocol, ProviderOptions } from "@paper/core/connection";
import { Dropdown } from "@/components/admin/dropdown";
import { FormField, TextInput } from "./workspace-ui";

export const protocolLabels: Record<Protocol,string> = { anthropic: "Anthropic Messages", openai: "OpenAI Chat Completions", responses: "OpenAI Responses", gemini: "Gemini 原生", codex: "ChatGPT 订阅" };
export type ConnectionValues = { baseUrl: string; protocol: Protocol; modelsUrl: string; fullUrl: boolean; authMode: NonNullable<ProviderOptions["authMode"]>; requestHeaders: string; clearHeaders: boolean; timeoutSec: string; maxTokensField: NonNullable<ProviderOptions["maxTokensField"]>; reasoning: NonNullable<ProviderOptions["reasoning"]>; fields: Record<string,string> };

export function ConnectionFields({ d, patch, headerNames, basicOnly=false, omitBase=false }: { d: ConnectionValues; patch: (p: Partial<ConnectionValues>) => void; headerNames: string[]; basicOnly?:boolean; omitBase?:boolean }) {
  return <div className="space-y-5">
    {!omitBase && <FormField label="接口地址"><TextInput name="baseUrl" value={d.baseUrl} onChange={e => patch({baseUrl:e.target.value})} placeholder="https://api.example.com/v1" />{d.fields.baseUrl && <span role="alert" className="mw-field-error">{d.fields.baseUrl}</span>}</FormField>}
    {d.protocol !== "codex" && <>{!omitBase && <><FormField label="接口格式"><Dropdown value={d.protocol} onChange={v => patch({protocol:v as Protocol,reasoning:"auto"})} options={Object.entries(protocolLabels).filter(([id]) => id !== "codex").map(([value,label]) => ({value,label,text:label}))} /></FormField>
      <label className="mw-inline-check"><input type="checkbox" checked={d.fullUrl} onChange={e => patch({fullUrl:e.target.checked})} /><span>完整端点模式：直接请求此 URL，不追加 API 路径</span></label></>}
      {!basicOnly && <><FormField label="认证方式"><Dropdown value={d.authMode} onChange={v => patch({authMode:v as ConnectionValues["authMode"]})} options={[["auto","按接口格式自动选择"],["bearer","Authorization: Bearer"],["x-api-key","x-api-key"],["x-goog-api-key","x-goog-api-key"],["none","不自动添加认证头"]].map(([value,label])=>({value,label,text:label}))} /></FormField>
      <FormField label="自定义请求头（JSON）" hint={headerNames.length ? `已保存 ${headerNames.join("、")}。留空保留；填写 JSON 会替换全部请求头。现有值不会回传。` : '例如 {"User-Agent":"my-app","api-key":"your-key"}；这些值只保存在服务端。'}><textarea className="mw-input min-h-24" autoComplete="off" spellCheck={false} value={d.requestHeaders} disabled={d.clearHeaders} onChange={e=>patch({requestHeaders:e.target.value})} placeholder='{"User-Agent":"my-app"}' /></FormField>
      {headerNames.length > 0 && <label className="mw-inline-check"><input type="checkbox" checked={d.clearHeaders} onChange={e=>patch({clearHeaders:e.target.checked})} /><span>清除已保存的自定义请求头</span></label>}
      <FormField label="思考参数兼容性"><Dropdown value={d.reasoning} onChange={v=>patch({reasoning:v as ConnectionValues["reasoning"]})} options={[["auto","自动：仅已知支持的接口"],["off","不发送思考参数"],["effort","支持 reasoning_effort / effort"],["thinking","仅发送 thinking 开关（Chat 接口）"]].filter(([value])=>!(value==="thinking" && d.protocol!=="openai") && !(value==="effort" && d.protocol==="gemini")).map(([value,label])=>({value,label,text:label}))} /></FormField>
      {d.protocol === "openai" && <FormField label="输出上限参数"><Dropdown value={d.maxTokensField} onChange={v=>patch({maxTokensField:v as ConnectionValues["maxTokensField"]})} options={[["max_tokens","max_tokens（兼容服务常用）"],["max_completion_tokens","max_completion_tokens"]].map(([value,label])=>({value,label,text:label}))} /></FormField>}
      </>}
    </>}
    {!basicOnly && <><FormField label="模型列表地址（可选）" hint="留空则按接口地址获取。"><TextInput value={d.modelsUrl} onChange={e=>patch({modelsUrl:e.target.value})} placeholder="https://api.example.com/v1/models" /></FormField>
    <FormField label="请求超时（秒）"><TextInput type="number" min={1} max={1800} value={d.timeoutSec} onChange={e=>patch({timeoutSec:e.target.value})} /></FormField></>}
  </div>;
}
