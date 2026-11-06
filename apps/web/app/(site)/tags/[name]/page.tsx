import { PaperGrid } from "@/components/site/DigestCard";
import { CollectionHeader, EmptyCollection } from "@/components/site/reading-primitives";
import { digestIdsByTag, listDigests } from "@/lib/data";
export default async function TagPage({ params }: {
    params: Promise<{
        name: string;
    }>;
}) {
    const name = decodeURIComponent((await params).name);
    const items = listDigests({ ids: digestIdsByTag(name) });
    return <div className="collection-page">
    <CollectionHeader title={name} count={items.length + " 篇解读"} back={{ href: "/tags", label: "全部研究方向" }}/>{items.length ? <PaperGrid items={items}/> : <EmptyCollection title="这个方向还没有解读"/>}</div>;
}
