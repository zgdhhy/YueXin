import Link from "next/link";
import { Settings } from "@/components/reading-icons";
import { requireAuth } from "@/lib/auth";
import { SiteNav } from "@/components/site/site-client";
import { SiteMark } from "@/components/site-mark";
import { SiteMenu } from "@/components/site/site-menu";
import { SITE_NAME } from "@/lib/brand";
import "./reading-site.css";
import "./theme.css";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return (
    <div className="reading-room">
      <a href="#main-content" className="skip-link">跳转到正文</a>
      <header className="room-header">
        <div className="room-header-inner">
          <Link href="/" className="room-brand" aria-label={`${SITE_NAME}首页`}><SiteMark size={30} /><span>{SITE_NAME}</span></Link>
          <SiteNav />
          <Link href="/admin" className="room-admin" aria-label="管理后台" title="管理后台"><Settings size={18} /></Link>
          <SiteMenu />
        </div>
      </header>
      <main id="main-content" className="room-main" tabIndex={-1}>{children}</main>
      <footer className="room-footer"><Link href="/" className="room-footer-brand"><SiteMark size={24} /><span>{SITE_NAME}</span></Link><small>解读由 AI 生成，研究结论请以原论文为准。</small></footer>
    </div>
  );
}
