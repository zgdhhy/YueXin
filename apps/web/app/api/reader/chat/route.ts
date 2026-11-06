import { askReading, getReadingDocument, getPaperConversation } from "@paper/core";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 1800;

export async function POST(request: Request) {
  if (!(await getSession()).loggedIn) return Response.json({ error: "请重新登录" }, { status: 401 });
  // Match Server Actions' same-origin protection for this authenticated mutation.
  const origin = request.headers.get("origin");
  try {
    if (origin && new URL(origin).host !== request.headers.get("host")) return Response.json({ error: "请求来源无效" }, { status: 403 });
  } catch { return Response.json({ error: "请求来源无效" }, { status: 403 }); }
  let input: { subjectId: string; question: string; conversationId: number; modelId?: number | null };
  try {
    input = await request.json();
    if (typeof input.subjectId !== "string" || typeof input.question !== "string" || !input.question.trim() || input.question.length > 10000 || !Number.isSafeInteger(input.conversationId) || input.conversationId <= 0) throw new Error("问题或会话无效");
    if (input.modelId != null && (!Number.isSafeInteger(input.modelId) || input.modelId <= 0)) throw new Error("请选择有效的模型");
    if (!getReadingDocument(input.subjectId)) throw new Error("解读不存在");
    getPaperConversation(input.subjectId, input.conversationId);
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "请求无效" }, { status: 400 }); }
  const encoder = new TextEncoder();
  let connected = true;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (value: unknown) => { if (connected) { try { controller.enqueue(encoder.encode(JSON.stringify(value) + "\n")); } catch { connected = false; } } };
      send({ type: "start" });
      const heartbeat = setInterval(() => send({ type: "ping" }), 15000);
      try {
        const messages = await askReading(input.subjectId, input.question, input.conversationId, input.modelId, (text, reset) => send({ type: reset ? "reset" : "delta", text }));
        send({ type: "done", messages });
      } catch (error) { send({ type: "error", error: error instanceof Error ? error.message : "回答失败，请重试" }); }
      finally { clearInterval(heartbeat); if (connected) controller.close(); }
    },
    cancel() { connected = false; },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}
