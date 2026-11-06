import Link from "next/link";
import { ArrowLeft } from "../reading-icons";

/** 阅读页只保留返回所属列表的入口。 */
export function ReaderTrail({ href, label }: { href: string; label: string }) {
  return <nav className="reader-trail" aria-label="返回">
    <Link href={href} className="reader-back"><ArrowLeft size={15} />返回{label}</Link>
  </nav>;
}
