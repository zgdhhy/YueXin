import Link from "next/link";

export default function NotFound() {
  return <section className="room-empty"><h1>页面不存在</h1><Link href="/library" className="room-button">浏览论文库</Link></section>;
}
