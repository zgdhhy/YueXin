import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DigestRow } from "@/components/DigestCard";
import { digestIdsByTag, listDigests } from "@/lib/data";

export default async function TagPage({ params }: { params: Promise<{ name: string }> }) {
  const name = decodeURIComponent((await params).name);
  const items = listDigests({ ids: digestIdsByTag(name) });
  return (
    <div className="collection-page mx-auto max-w-4xl">
      <Link href="/tags" className="mb-6 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-ink">
        <ArrowLeft className="h-4 w-4" />
        全部标签
      </Link>
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          <span className="text-indigo-400">#</span> {name}
        </h1>
        <p className="mt-2 text-stone-500">{items.length} 篇相关解读</p>
      </header>
      <div className="space-y-4">
        {!items.length && <div className="room-empty"><h2>这个方向还没有解读</h2><p>可以回到论文库，浏览其他已发布的研究。</p><Link className="room-text-button" href="/library">浏览论文库</Link></div>}
        {items.map((d) => (
          <DigestRow key={d.id} d={d} />
        ))}
      </div>
    </div>
  );
}
