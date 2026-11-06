"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import {
  Bell,
  BookOpenText,
  CalendarClock,
  Clapperboard,
  Cpu,
  ExternalLink,
  LayoutDashboard,
  Menu,
  Loader2,
  SlidersHorizontal, ScrollText,
  X,
} from "lucide-react";
import { buttonCls, type ButtonVariant } from "./ui";
import { Notice, useConfirmSubmit } from "./feedback";
import { cn } from "@/lib/cn";
import { SiteMark } from "../site-mark";
import { SITE_NAME } from "@/lib/brand";

const NAV = [
  { group: "工作区", items: [
    { href: "/admin", label: "任务概览", icon: LayoutDashboard },
    { href: "/admin/digests", label: "内容管理", icon: BookOpenText },
  ] },
  { group: "设置", items: [
    { href: "/admin/selection", label: "选题与方向", icon: SlidersHorizontal },
    { href: "/admin/prompts", label: "提示词", icon: ScrollText },
    { href: "/admin/models", label: "模型", icon: Cpu },
    { href: "/admin/video", label: "视频", icon: Clapperboard },
    { href: "/admin/schedules", label: "定时计划", icon: CalendarClock },
    { href: "/admin/notify", label: "通知", icon: Bell },
  ] },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <SiteMark />
      <div>
        <div className="admin-brand-name">{SITE_NAME}</div>
      </div>
    </div>
  );
}

function WorkerDot({ online }: { online: boolean }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${online ? "bg-emerald-400" : "bg-red-400"}`} />
    </span>
  );
}

type SidebarProps = { workerOnline: boolean; workerSeen: string };

/** 桌面端固定侧边栏 + 手机端顶栏与抽屉 */
export function Sidebar(props: SidebarProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const current = NAV.flatMap(g => g.items).find(i => i.href === "/admin" ? pathname === "/admin" || pathname.startsWith("/admin/runs") : pathname.startsWith(i.href));
  return <>
    <header className="admin-mobile-header fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 text-slate-800 lg:hidden">
      <button type="button" onClick={() => dialog.current?.showModal()} className="-ml-1 rounded-md p-2.5 text-slate-600" aria-label="打开菜单" aria-haspopup="dialog"><Menu className="size-5" /></button>
      <span className="text-sm font-medium">{current?.label ?? "管理后台"}</span>
      <span className="ml-auto flex items-center gap-2 text-[13px] text-slate-500"><WorkerDot online={props.workerOnline} />{props.workerOnline ? "在线" : "离线"}</span>
    </header>
    <dialog ref={dialog} className="admin-nav-dialog" aria-label="后台导航" onClick={e => { if (e.target === dialog.current) dialog.current.close(); }}><SidebarBody {...props} onClose={() => dialog.current?.close()} /></dialog>
    <div className="admin-sidebar fixed inset-y-0 left-0 z-20 hidden lg:block"><SidebarBody {...props} /></div>
  </>;
}

function SidebarBody({ workerOnline, workerSeen, onClose }: SidebarProps & { onClose?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/admin" ? pathname === "/admin" || pathname.startsWith("/admin/runs") : pathname.startsWith(href));
  return (
    <aside className="flex h-full flex-col border-r border-slate-200 bg-white text-slate-600">
      <div className="flex items-center justify-between px-5 py-6">
        <Brand />
        {onClose && (
          <button onClick={onClose} className="rounded-md p-2.5 text-slate-500 hover:bg-slate-100" aria-label="关闭菜单">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
      <nav className="flex-1 space-y-7 overflow-y-auto px-3 py-2">
        {NAV.map((g) => (
          <div key={g.group}>
            <div className="px-3 pb-2 text-[13px] font-medium text-slate-500">{g.group}</div>
            <ul className="space-y-0.5">
              {g.items.map(({ href, label, icon: Icon }) => {
                const active = isActive(href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={onClose}
                      aria-current={active ? "page" : undefined}
                      className={cn("flex items-center gap-3 min-h-10 rounded-md px-3 py-2 text-sm", active ? "bg-indigo-50 font-medium text-indigo-700" : "hover:bg-slate-100 hover:text-slate-900")}
                    >
                      <Icon className={`h-4 w-4 ${active ? "text-indigo-600" : "text-slate-500"}`} />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="space-y-3 border-t border-slate-200 p-4">
        <div className="flex items-center gap-2.5 rounded-md bg-slate-100 px-3 py-2.5" title={`最近心跳：${workerSeen}`}>
          <WorkerDot online={workerOnline} />
          <div className="text-[13px]">
            <div className="text-slate-700">Worker {workerOnline ? "在线" : "离线"}</div>
            <div className="text-slate-500">{workerOnline ? "定时计划正常执行" : "定时计划不会执行"}</div>
          </div>
        </div>
        <Link href="/" className="flex items-center gap-2 px-1 text-[13px] text-slate-500 hover:text-slate-900">
          <ExternalLink className="h-3.5 w-3.5" />
          返回前台
        </Link>
      </div>
    </aside>
  );
}

export function NewRunLink() {
  return <a href="#new-run" className={buttonCls()} onClick={() => { const form = document.getElementById("new-run"); if (form instanceof HTMLDetailsElement) form.open = true; }}>新建解读任务</a>;
}

/** 提交时显示加载状态的按钮 */
export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  pendingText,
  confirm,
  className = "",
  formAction,
  formNoValidate,
  disabled,
}: {
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  pendingText?: string;
  /** 设置后提交前弹出确认框 */
  confirm?: string;
  className?: string;
  /** 同一表单内的其他操作（如删除、保存并测试） */
  formAction?: (f: FormData) => void | Promise<void>;
  formNoValidate?: boolean;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  const confirmation = useConfirmSubmit(confirm);
  return (
    <>
    <button
      type="submit"
      disabled={pending || disabled}
      className={`${buttonCls(variant, size)} ${className}`}
      onClick={confirmation.onClick}
      formAction={formAction}
      formNoValidate={formNoValidate}
    >
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {pending && pendingText ? pendingText : children}
    </button>
    {confirmation.confirmation}
    </>
  );
}

/** 反馈通过顶层 Popover 展示，到时自动关闭（见 Notice）。 */
export function Toast() {
  const params = useSearchParams();
  const pathname = usePathname();
  const msg = params.get("msg");
  const dismiss = () => {
    const rest = new URLSearchParams(window.location.search);
    rest.delete("msg");
    window.history.replaceState(null, "", `${pathname}${rest.size ? `?${rest}` : ""}${window.location.hash}`);
  };
  return msg ? <Notice message={msg} onClose={dismiss} /> : null;
}

/** 运行中的页面定时刷新 */
export function AutoRefresh({ seconds = 4 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
