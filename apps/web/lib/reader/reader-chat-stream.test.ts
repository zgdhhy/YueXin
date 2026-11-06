import test from "node:test";
import assert from "node:assert/strict";
import { readChatStream } from "./reader-chat-stream";

const response = (text: string) => new Response(new ReadableStream({ start(controller) {
  // Deliberately split every UTF-8 code point and JSON frame.
  for (const byte of new TextEncoder().encode(text)) controller.enqueue(new Uint8Array([byte]));
  controller.close();
} }), { headers: { "content-type": "application/x-ndjson" } });

test("incremental replies survive UTF-8/frame splits and reset before a fallback", async () => {
  const received: unknown[] = [];
  const events = [{ type: "delta", text: "未完成" }, { type: "reset" }, { type: "delta", text: "完整回答" }, { type: "done", messages: [{ id: 2, role: "assistant", content: "完整回答" }] }];
  const result = await readChatStream(response(events.map(event => JSON.stringify(event)).join("\n")), (text, reset) => received.push([text, reset]));
  assert.deepEqual(received, [["未完成", undefined], ["", true], ["完整回答", undefined]]);
  assert.equal(result.messages[0].content, "完整回答");
});

test("a partial answer without done is a retryable interruption; explicit errors are surfaced", async () => {
  await assert.rejects(readChatStream(response('{"type":"delta","text":"partial"}\n'), () => {}), /连接中断/);
  await assert.rejects(readChatStream(response('{"type":"error","error":"模型失败"}\n'), () => {}), /模型失败/);
});

test("the first delta is delivered before the server finishes", { timeout: 3000 }, async () => {
  let finish!: () => void;
  const stream = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new TextEncoder().encode('{"type":"delta","text":"first"}\n'));
    finish = () => { controller.enqueue(new TextEncoder().encode('{"type":"done","messages":[]}\n')); controller.close(); };
  } });
  let seen = false;
  await readChatStream(new Response(stream, { headers: { "content-type": "application/x-ndjson" } }), () => { seen = true; finish(); });
  assert.ok(seen);
});
