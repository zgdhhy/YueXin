"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const settings = ["selection", "models", "video", "schedules", "notify"];
export function AdminFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const settingsPage = settings.some(p => pathname === `/admin/${p}`);
  return <main className="admin-main"><div className="admin-context"><span>{settingsPage ? "工作区 / 设置" : "工作区 / 内容与任务"}</span><Link href="/">查看阅读站</Link></div><div className={cn("admin-content", settingsPage && "admin-settings-content")}>{children}</div></main>;
}
