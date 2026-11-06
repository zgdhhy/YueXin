import type { ChatMessage } from "@/components/chat";

export async function readChatStream(response: Response, onText: (text: string, reset?: boolean) => void): Promise<{ messages: ChatMessage[] }> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || "请求失败，请重新登录或重试");
  }
  if (!response.body || !response.headers.get("content-type")?.includes("application/x-ndjson")) throw new Error("连接失效，请重新登录或重试");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "", result: { messages: ChatMessage[] } | undefined;
  function consume(line: string) {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === "error") throw new Error(event.error || "回答失败，请重试");
    if (event.type === "delta") onText(event.text);
    if (event.type === "reset") onText("", true);
    if (event.type === "done") result = { messages: event.messages };
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let end: number;
      while ((end = buffer.indexOf("\n")) >= 0) { consume(buffer.slice(0, end)); buffer = buffer.slice(end + 1); }
      if (done || result) break;
    }
    consume(buffer);
    if (!result) throw new Error("连接中断，回答未完成，请重试");
    return result;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
