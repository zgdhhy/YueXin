import Link from "next/link";
import { BookOpen } from "lucide-react";

export default function NotFound() {
  return <section className="room-empty"><BookOpen size={30} /><h1>这篇内容暂时无法阅读</h1><p>链接可能有误，或内容已下线。回到论文库，查找其他已发布的解读。</p><Link href="/library" className="room-button">浏览论文库</Link></section>;
}
