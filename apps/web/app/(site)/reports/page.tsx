import Link from "next/link";
import { desc } from "drizzle-orm";
import { ArrowRight } from "@/components/reading-icons";
import { db, schema } from "@paper/core";
import { reportLead } from "@/lib/data";
import { CollectionHeader, EmptyCollection } from "@/components/site/reading-primitives";
export default function ReportsPage() {
    const reports = db.select().from(schema.trendReports).orderBy(desc(schema.trendReports.month)).all();
    return <div className="collection-page">
    <CollectionHeader title="趋势月报" count={reports.length + " 期月报"}/>
    <div className="report-list">{reports.map(r => {
            const [y, m] = r.month.split("-");
            return <Link key={r.id} href={"/reports/" + r.month} className="report-entry">
            <div className="report-date">
            <strong>{m}</strong>
            <span>{y}</span>
            </div>
            <div>
            <h2>{r.title}</h2>
            <p>{reportLead(r.contentMd)}</p>
            <span className="report-read-link">阅读月报<ArrowRight size={17}/>
            </span>
            </div>
            </Link>;
        })}</div>{!reports.length && <EmptyCollection title="还没有月报"/>}</div>;
}
