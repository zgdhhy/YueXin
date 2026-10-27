import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI 前沿论文精读",
  description: "每周一篇最值得读的 AI 论文：深度解读 + 讲解视频",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-slate-50 text-slate-800 antialiased">{children}</body>
    </html>
  );
}
