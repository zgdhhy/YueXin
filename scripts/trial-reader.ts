/** 为阅读改版生成一份待审阅试写；可重复运行，不发布、不启用。 */
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { db, schema, ensureRequirementVersions, BUILTIN_REQUIREMENTS, listRequirementVersions, activeRequirementVersion, enqueueTrial, listTrials, dataPath } from "@paper/core";
import { executeRun } from "@paper/core/run";

const paperId = "2610.22200";
const before = activeRequirementVersion("digest").id;
ensureRequirementVersions();
const candidate = listRequirementVersions("digest").find(v => v.content.trim() === BUILTIN_REQUIREMENTS.digest.trim())!;
if (activeRequirementVersion("digest").id !== before) throw new Error("启用版本发生变化，停止试写");
const existing = listTrials(candidate.id).find(t => t.target === paperId && (t.id != null || t.status === "queued" || t.status === "running"));
const runId = existing?.runId ?? enqueueTrial(candidate.id, paperId);
console.log(JSON.stringify({ runId, candidateVersion: candidate.number, activeVersionId: before }));
await executeRun(runId);
const run = db.select().from(schema.runs).where(eq(schema.runs.id, runId)).get()!;
const trial = db.select().from(schema.trials).where(eq(schema.trials.runId, runId)).get();
const result = { runId, status: run.status, trialId: trial?.id ?? null, candidateVersionId: candidate.id, activeVersionId: activeRequirementVersion("digest").id, url: trial ? `/admin/prompts/trials/${trial.id}` : `/admin/runs/${runId}`, error: run.error };
fs.mkdirSync(dataPath("reader-review"), { recursive: true });
fs.writeFileSync(dataPath("reader-review", "trial.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
if (run.status === "failed") process.exitCode = 1;
