import Link from "next/link";
import { PaperGrid } from "@/components/site/DigestCard";
import { CollectionHeader, EmptyCollection } from "@/components/site/reading-primitives";
import { listDigests, tagCounts } from "@/lib/data";
export default async function LibraryPage({ searchParams }: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const params = await searchParams;
    const tag = typeof params.tag === "string" ? params.tag : "";
    const oldest = params.sort === "oldest";
    const items = listDigests().filter(d => !tag || d.tags.includes(tag));
    if (oldest)
        items.reverse();
    return <div className="collection-page">
    <CollectionHeader title="论文库" count={items.length + " 篇解读"}/>
    <nav className="library-directions" aria-label="研究方向筛选">
    <Link href="/library" aria-current={!tag ? "page" : undefined}>全部方向</Link>{tagCounts().map(t => <Link key={t.name} href={"/library?tag=" + encodeURIComponent(t.name)} aria-current={tag === t.name ? "page" : undefined}>{t.name}<span>{t.count}</span>
        </Link>)}</nav>
    <div className="collection-toolbar">
    <div>
    <Link href={"/library?" + (tag ? "tag=" + encodeURIComponent(tag) + "&" : "") + "sort=" + (oldest ? "newest" : "oldest")}>{oldest ? "最早发布" : "最新发布"} ↓</Link>
    <Link href="/timeline">按月回顾 ↗</Link>
    </div>
    </div>{items.length ? <PaperGrid items={items}/> : <EmptyCollection title="这个方向还没有解读"/>}</div>;
}
