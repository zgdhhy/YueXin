import Link from "next/link";
import { ArrowUpRight } from "@/components/reading-icons";
import { tagCounts } from "@/lib/data";
import { CollectionHeader, EmptyCollection } from "@/components/site/reading-primitives";
export default function TagsPage() {
    const tags = tagCounts();
    return <div className="collection-page">
    <CollectionHeader title="研究方向" count={tags.length + " 个方向"}/>{tags.length ? <div className="topic-directory">{tags.map(t => <Link key={t.name} href={"/tags/" + encodeURIComponent(t.name)} className="topic-card">
            <h2>{t.name}</h2>
            <div>
            <span>{t.count} 篇解读</span>
            <ArrowUpRight size={20}/>
            </div>
            </Link>)}</div> : <EmptyCollection title="还没有研究方向"/>}</div>;
}
