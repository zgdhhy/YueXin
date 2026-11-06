import "./globals.css";
import type { Metadata } from "next";
import { SITE_NAME, SITE_TITLE, SITE_DESCRIPTION } from "@/lib/brand";
import { ImageLightbox } from "@/components/image-lightbox";

export const metadata: Metadata = {
  applicationName: SITE_NAME,
  title: { default: SITE_TITLE, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth">
      <body className="min-h-screen bg-white text-[var(--ds-ink)] antialiased">{children}<ImageLightbox /></body>
    </html>
  );
}
