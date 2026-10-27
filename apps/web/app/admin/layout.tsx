import "./admin.css";
import { Suspense } from "react";
import { getHeartbeat, seedDefaults } from "@paper/core";
import { requireAuth } from "@/lib/auth";
import { Sidebar, Toast } from "@/components/admin-client";
import { fmtRelative } from "@/components/ui";
import { AdminFrame } from "@/components/admin-frame";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  seedDefaults();
  const beat = getHeartbeat();
  // worker 每 30 秒写一次心跳，超过 90 秒视为离线
  const online = !!beat && Date.now() - beat.getTime() < 90_000;
  return (
    <div className="admin-shell min-h-screen">
      <Sidebar workerOnline={online} workerSeen={beat ? fmtRelative(beat.toISOString()) : "从未"} />
      <Suspense>
        <Toast />
      </Suspense>
      <AdminFrame>{children}</AdminFrame>
    </div>
  );
}
