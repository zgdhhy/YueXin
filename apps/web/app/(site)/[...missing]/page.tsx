import { notFound } from "next/navigation";

/** 未匹配的前台地址交给 (site)/not-found.tsx，让 404 也带站点导航与主题。 */
export default function Missing() {
  notFound();
}
