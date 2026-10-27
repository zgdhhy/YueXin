import Link from "next/link";
import { tagCounts } from "@/lib/data";

export default function TagsPage() {
  const tags = tagCounts();
  return (
    <div className="collection-page mx-auto max-w-4xl">
      <header className="mb-6 sm:mb-10">
        <h1 className="text-2xl font-bold">研究方向</h1>
        <p className="mt-2 text-stone-500">从一个方向开始，阅读相关论文与研究方法。共 {tags.length} 个方向。</p>
      </header>
      {tags.length ? (
        <div className="topic-directory">
          {tags.map((t) => {
            return (
              <Link
                key={t.name}
                href={`/library?tag=${encodeURIComponent(t.name)}`}
                className="topic-entry"
              >
                <span>{t.name}</span>
                <span className="topic-count">{t.count} 篇</span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="room-empty"><h2>研究方向将在解读发布后汇集</h2><p>先阅读精选论文，或前往后台生成新的解读。</p><Link className="room-text-button" href="/">阅读精选</Link></div>
      )}
    </div>
  );
}
