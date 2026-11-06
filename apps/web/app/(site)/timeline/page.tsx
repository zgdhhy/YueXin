import { DigestRow } from "@/components/site/DigestCard";
import { CollectionHeader, EmptyCollection } from "@/components/site/reading-primitives";
import { listDigests } from "@/lib/data";
export default function TimelinePage() {
    const all = listDigests();
    const months = new Map<string, typeof all>();
    for (const d of all) {
        const m = d.createdAt.slice(0, 7);
        months.set(m, [...(months.get(m) ?? []), d]);
    }
    return <div className="collection-page">
    <CollectionHeader title="研究归档" count={all.length + " 篇解读"} back={{ href: "/library", label: "返回论文库" }}/>
    <div className="research-timeline">{[...months].map(([month, items]) => <section key={month}>
        <div className="timeline-month">
        <span>{month.slice(0, 4)}</span>
        <h2>{Number(month.slice(5))} 月</h2>
        <small>{items.length} 篇解读</small>
        </div>
        <div className="paper-list">{items.map(d => <DigestRow key={d.id} d={d}/>)}</div>
        </section>)}</div>{!all.length && <EmptyCollection title="还没有解读"/>}</div>;
}
