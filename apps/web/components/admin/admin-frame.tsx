"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const settings = ["selection", "prompts", "models", "video", "schedules", "notify"];
export function AdminFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const settingsPage = settings.some(p => pathname === `/admin/${p}`);
  return <main className="admin-main"><div className={cn("admin-content", settingsPage && "admin-settings-content")}>{children}</div></main>;
}
