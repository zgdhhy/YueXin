import Link from "next/link";
import { BookOpen, Settings } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { SiteNav } from "@/components/site-client";
import { SiteMark } from "@/components/site-mark";
import "./reading-room.css";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return (
    <div className="reading-room">
      <a href="#main-content" className="skip-link">跳转到正文</a>
      <header className="room-header">
        <div className="room-header-inner">
          <Link href="/" className="room-brand"><SiteMark size={34} /><span>论文精读<span>理解方法，追踪前沿</span></span></Link>
          <SiteNav />
          <Link href="/admin" className="room-admin" aria-label="管理后台" title="管理后台"><Settings size={18} /></Link>
        </div>
      </header>
      <main id="main-content" className="room-main" tabIndex={-1}>{children}</main>
      <footer className="room-footer"><div><BookOpen size={17} /><span>AI 前沿论文精读</span></div><p>解读由 AI 生成，研究结论请以原论文为准。</p><Link href="/admin">内容管理</Link></footer>
    </div>
  );
}
