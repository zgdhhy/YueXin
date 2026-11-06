import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "@/components/reading-icons";

export function CollectionHeader({ title, count, back }: { title: string; count?: string; back?: { href: string; label: string } }) {
  return <header className="collection-heading">
    {back && <Link href={back.href} className="collection-back"><ArrowLeft size={15} />{back.label}</Link>}
    <div className="collection-title-row"><h1>{title}</h1>{count && <span>{count}</span>}</div>
  </header>;
}

export function EmptyCollection({ title }: { title: string }) {
  return <div className="collection-empty"><h2>{title}</h2><Link href="/library">浏览论文库<ArrowUpRight size={16} /></Link></div>;
}
