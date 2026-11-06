import { VideoGallery } from "@/components/reader/reader-client";
import { CollectionHeader, EmptyCollection } from "@/components/site/reading-primitives";
import { fileUrl, fmtVideo, listDigests } from "@/lib/data";
export default function VideosPage() {
    const items = listDigests().filter(d => d.videoPath && (d.videoSec ?? 0) > 0).map(d => ({ paperId: d.paperId, titleZh: d.titleZh, cover: d.cover ? fileUrl(d.cover) : null, src: fileUrl(d.videoPath!), duration: fmtVideo(d.videoSec!) }));
    return <div className="collection-page">
    <CollectionHeader title="视频讲解" count={items.length + " 支视频"}/>{items.length ? <VideoGallery items={items}/> : <EmptyCollection title="还没有视频讲解"/>}</div>;
}
