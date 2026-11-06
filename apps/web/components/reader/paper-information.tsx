import { TagChip } from "../site/DigestCard";
import { ExternalLink, FileText } from "../reading-icons";

/** Source metadata for the reading panel, kept separate from the interpretation. */
export function PaperInformation({ paper, tags, alternates }: {
  paper: { id: string; title: string; publishedAt: string; authors: string[]; organization?: string | null; githubUrl?: string | null };
  tags: string[];
  alternates: { paperId: string; title: string; reason: string | null }[];
}) {
  return <div className="reader-resources paper-information">
    <header className="paper-information-heading">
      <p className="paper-information-meta"><span>arXiv: {paper.id}</span><time dateTime={paper.publishedAt}>{paper.publishedAt.slice(0, 10)}</time></p>
      <h2>{paper.title}</h2>
      <div className="paper-information-links">
        <a className="paper-source-primary" href={`https://arxiv.org/abs/${paper.id}`} target="_blank" rel="noreferrer">arXiv 原论文<ExternalLink size={15}/></a>
        <a href={`https://arxiv.org/pdf/${paper.id}`} target="_blank" rel="noreferrer"><FileText size={15}/>PDF 全文<ExternalLink size={13}/></a>
        {paper.githubUrl && <a href={paper.githubUrl} target="_blank" rel="noreferrer">代码仓库<ExternalLink size={13}/></a>}
      </div>
    </header>
    <dl className="paper-information-people">
      <div><dt>作者</dt><dd className="paper-information-authors">{paper.authors.length ? paper.authors.map((author, i) => <span key={i}>{author}{i < paper.authors.length - 1 && ","}</span>) : "未提供"}</dd></div>
      {paper.organization && <div><dt>研究机构</dt><dd className="paper-information-organization">{paper.organization}</dd></div>}
    </dl>
    {tags.length > 0 && <section className="paper-information-topics"><h3>研究方向</h3><div className="reader-tags">{tags.map(tag => <TagChip key={tag} name={tag}/>)}</div></section>}
    {alternates.length > 0 && <section className="reader-alternates paper-information-alternates"><h2>同期值得关注的原论文</h2>{alternates.map(alternate => <a key={alternate.paperId} href={`https://arxiv.org/abs/${alternate.paperId}`} target="_blank" rel="noreferrer"><h3>{alternate.title}<ExternalLink size={14}/></h3><p>{alternate.reason}</p></a>)}</section>}
  </div>;
}
