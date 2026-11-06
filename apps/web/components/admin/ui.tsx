import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="admin-page-header mb-5 flex flex-wrap items-end justify-between gap-4 sm:mb-6">
      <div>
        <h1 className="text-[22px] font-semibold text-balance text-slate-900">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  description,
  children,
  extra,
  className = "",
  padded = true,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  extra?: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={cn("admin-section rounded-lg border border-slate-200 bg-white", className)}>
      {(title || extra) && (
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3.5 sm:px-6 sm:py-4">
          <div>
            {title && <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-slate-500">{description}</p>}
          </div>
          {extra}
        </div>
      )}
      <div className={padded ? "p-4 sm:p-6" : ""}>{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block space-y-1.5 ${className}`}>
      <span className="text-[13px] font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="block text-[13px] leading-relaxed text-slate-500">{hint}</span>}
    </label>
  );
}

const inputCls =
  "block w-full rounded-md border-0 bg-white px-3 py-2 text-base sm:text-sm text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-500 focus:ring-2 focus:ring-inset focus:ring-indigo-500 focus:outline-none transition";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputCls} ${props.className ?? ""}`} />;
}

export { Select } from "./select";

/** 纯 CSS 开关（本质是 checkbox，表单提交值为 "on"） */
export function Switch({ label, hint, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-3 select-none">
      <span className="relative inline-flex">
        <input type="checkbox" {...props} className="peer sr-only" />
        <span className="h-6 w-11 rounded-full bg-slate-200 transition peer-checked:bg-indigo-600 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500 peer-focus-visible:ring-offset-2" />
        <span className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
      <span className="text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        {hint && <span className="block text-[13px] text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

const buttonStyles = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-500 focus-visible:outline-indigo-600",
  secondary: "bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  danger: "text-red-600 hover:bg-red-50",
} as const;

export type ButtonVariant = keyof typeof buttonStyles;

export function buttonCls(variant: ButtonVariant = "primary", size: "sm" | "md" = "md") {
  const sizes = { sm: "px-2.5 py-1.5 text-[13px]", md: "px-3.5 py-2 text-sm" };
  return `inline-flex items-center justify-center gap-1.5 min-h-9 rounded-md font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${sizes[size]} ${buttonStyles[variant]}`;
}

const STATUS: Record<string, [string, string, string]> = {
  queued: ["排队中", "bg-slate-100 text-slate-600", "bg-slate-400"],
  running: ["运行中", "bg-sky-50 text-sky-700", "bg-sky-500 animate-pulse"],
  succeeded: ["成功", "bg-emerald-50 text-emerald-700", "bg-emerald-500"],
  failed: ["失败", "bg-red-50 text-red-700", "bg-red-500"],
  skipped: ["跳过", "bg-slate-100 text-slate-500", "bg-slate-400"],
  enabled: ["启用", "bg-emerald-50 text-emerald-700", "bg-emerald-500"],
  disabled: ["停用", "bg-slate-100 text-slate-500", "bg-slate-400"],
};

export function StatusBadge({ status }: { status: string }) {
  const [text, cls, dot] = STATUS[status] ?? [status, "bg-slate-100 text-slate-600", "bg-slate-400"];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[13px] font-medium ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {text}
    </span>
  );
}

export function Tag({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "indigo" | "amber" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-600",
    indigo: "bg-indigo-50 text-indigo-700 ring-indigo-600/10",
    amber: "bg-amber-50 text-amber-700",
  };
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[13px] ${tones[tone]}`}>{children}</span>;
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="rounded-full bg-slate-100 p-3 text-slate-500">
        <Icon className="h-6 w-6" />
      </div>
      <p className="mt-3 text-sm font-medium text-slate-700">{title}</p>
      {children && <div className="mt-1 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function fmtTime(iso: string | null) {
  return iso ? new Date(iso).toLocaleString("zh-CN", { hour12: false }) : "—";
}

export function fmtDuration(start: string | null, end: string | null) {
  if (!start || !end) return "—";
  const s = Math.round((Date.parse(end) - Date.parse(start)) / 1000);
  return s < 60 ? `${s} 秒` : `${Math.floor(s / 60)} 分 ${s % 60} 秒`;
}

export function fmtRelative(iso: string | null) {
  if (!iso) return "—";
  const diff = (Date.now() - Date.parse(iso)) / 1000;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
  return new Date(iso).toLocaleDateString("zh-CN");
}
