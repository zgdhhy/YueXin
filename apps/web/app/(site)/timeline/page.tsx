import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { DigestRow } from "@/components/DigestCard";
import { listDigests } from "@/lib/data";

export default function TimelinePage() {
  const all = listDigests();
  const byMonth = new Map<string, typeof all>();
  for (const d of all) {
    const m = d.createdAt.slice(0, 7);
    byMonth.set(m, [...(byMonth.get(m) ?? []), d]);
  }
  return (
    <div className="collection-page mx-auto max-w-4xl">
      <header className="mb-6 sm:mb-10"><Link className="reader-back" href="/library">返回论文库</Link>
        <h1 className="text-2xl font-bold  sm:text-3xl">时间线</h1>
        <p className="mt-2 text-stone-500">按时间回顾每一期推荐，看 AI 前沿如何一步步演进。共 {all.length} 篇。</p>
      </header>
      <div className="space-y-10 sm:space-y-12">
        {[...byMonth.entries()].map(([month, items]) => {
          const [y, m] = month.split("-");
          return (
            <section key={month} className="grid gap-4 sm:grid-cols-[120px_1fr] sm:gap-6">
              <div className="flex items-baseline gap-3 sm:sticky sm:top-24 sm:block sm:self-start">
                <div className="flex items-center gap-2 text-stone-400">
                  <CalendarDays className="h-4 w-4" />
                  <span className="text-sm">{y}</span>
                </div>
                <div className="text-2xl font-bold text-ink sm:mt-1 sm:text-3xl">{Number(m)} 月</div>
                <div className="mt-1 text-xs text-stone-400">{items.length} 篇</div>
              </div>
              <ol className="relative space-y-4 border-l border-stone-200 pl-4 sm:space-y-5 sm:pl-6">
                {items.map((d) => (
                  <li key={d.id} className="relative">
                    <span className="absolute top-6 -left-[21px] h-2.5 w-2.5 sm:-left-[29px] rounded-full bg-white ring-2 ring-indigo-400" />
                    <DigestRow d={d} />
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
      </div>
      {!all.length && <div className="room-empty"><h2>还没有发布的解读</h2><p>生成并发布第一篇论文解读后，可以在这里按月回顾。</p><Link href="/admin" className="room-text-button">前往后台生成解读</Link></div>}
    </div>
  );
}
