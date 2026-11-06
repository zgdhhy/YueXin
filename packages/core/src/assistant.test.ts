import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "paper-assistant-"));
const { db, schema } = await import("./db");
const { dataPath } = await import("./env");
const policy = await import("./model-policy");
const topics = await import("./topics");
const assistant = await import("./assistant");
const lib = await import("./library");
const { rerankPrompt } = await import("./prompts/rerank");
const { reportSubject, getReadingDocument } = await import("./reading-document");
const { READING_CONVERSATION_TITLE_SYSTEM } = await import("./prompts/assistant");

const recent = new Date().toISOString();
db.insert(schema.papers)
  .values([
    { id: "2610.10001", title: "Robot Manipulation with Diffusion Policy", abstract: "We study robot manipulation.", authors: [], publishedAt: recent, upvotes: 5 },
    { id: "2610.10002", title: "Scaling Laws for Language Models", abstract: "Pretraining study.", authors: [], publishedAt: recent, upvotes: 50 },
    { id: "2610.10003", title: "Embodied Agents in Homes", abstract: "An embodied robot agent.", authors: [], publishedAt: recent, upvotes: 1, arxivCategories: ["cs.RO"] },
  ])
  .run();
const p = db.insert(schema.llmProviders).values({ name: "p", protocol: "openai", apiKey: "k", baseUrl: "https://p.invalid/v1" }).returning().get();
const m = db.insert(schema.llmModels).values({ providerId: p.id, modelId: "m" }).returning().get();
policy.saveModelPolicy({ ...policy.getModelPolicy(), confirmed: true, defaultModelId: m.id, fallbackModelId: null });

function stream(text: string) {
  return new Response(
    `data: ${JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 2, completion_tokens: 2 } })}\n\ndata: [DONE]\n\n`,
    { headers: { "content-type": "text/event-stream" } },
  );
}
/** 依次返回给定的回复，并记录发给模型的 prompt */
function mockLlm(t: { mock: { method: (o: object, k: string, f: unknown) => void } }, replies: string[], titleReplies: string[] = []) {
  const prompts: string[] = [];
  const titles: string[] = [];
  t.mock.method(globalThis, "fetch", async (_: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[] };
    if (body.messages.some(message => message.role === "system" && message.content === READING_CONVERSATION_TITLE_SYSTEM)) {
      titles.push(body.messages.filter(message => message.role !== "system").map(message => message.content).join("\n"));
      return stream(titleReplies.shift() ?? "机制背后的线索");
    }
    prompts.push(body.messages.filter((x) => x.role !== "system").map((x) => x.content).join("\n"));
    return stream(replies.shift() ?? "");
  });
  return Object.assign(prompts, { titles });
}

test("方向试选：按关键词与分类命中近期论文，按匹配度排序", () => {
  const r = topics.topicMatches({ keywords: ["robot", "embodied"], arxivCategories: ["cs.RO"] });
  assert.equal(r.total, 2);
  assert.deepEqual(r.top.map((x) => x.paperId), ["2610.10003", "2610.10001"]);
});

test("默认主题带描述；旧的默认主题补上描述，同名草稿更新已有主题", () => {
  topics.ensureTopics();
  const llm = topics.listTopics().find((t) => t.name === "大语言模型")!;
  assert.ok(llm.description);
  db.update(schema.topics).set({ description: "" }).run();
  topics.ensureTopics();
  assert.ok(topics.listTopics().every((t) => t.description));
  const before = topics.listTopics().length;
  const r = topics.saveTopicDraft({ name: "大语言模型", description: "新描述", arxivCategories: ["cs.CL", "cs.CL"], keywords: ["LLM"], weight: 9 });
  assert.equal(r.updated, true);
  const saved = topics.listTopics().find((t) => t.name === "大语言模型")!;
  assert.deepEqual([saved.description, saved.arxivCategories, saved.weight], ["新描述", ["cs.CL"], 3]);
  assert.equal(topics.listTopics().length, before);
});

test("收藏与不感兴趣成为精选的偏好样例", () => {
  db.insert(schema.paperMarks).values([{ paperId: "2610.10001", favorite: true }, { paperId: "2610.10002", notInterested: true }]).run();
  const s = topics.preferenceSamples();
  assert.deepEqual(s.liked.map((x) => x.paperId), ["2610.10001"]);
  assert.deepEqual(s.disliked.map((x) => x.paperId), ["2610.10002"]);
  const prompt = rerankPrompt({ picks: 1, notablePicks: 0, alternates: 0, topics: "", history: "", liked: "- 喜欢的", disliked: "- 不想看的", fresh: "", notable: "" });
  assert.match(prompt, /感兴趣：\n- 喜欢的\n不想看：\n- 不想看的/);
});

test("方向助手：多轮对话带上历史，草稿附带试选结果", async (t) => {
  const prompts = mockLlm(t, [
    JSON.stringify({ reply: "你更关心机器人的哪方面？", draft: null }),
    JSON.stringify({ reply: "给你一个草稿", draft: { name: "具身智能", description: "机器人在真实环境中完成任务", arxivCategories: ["cs.RO"], keywords: ["robot", "embodied"], weight: 1.2 } }),
  ]);
  const first = await assistant.askTopicAssistant("我想看机器人相关的");
  assert.equal(first.messages[1].data, null);
  const second = await assistant.askTopicAssistant("操作和家庭场景", first.conversationId);
  assert.match(prompts[1], /读者：我想看机器人相关的/);
  assert.match(prompts[1], /收藏：\n- /);
  const reply = second.messages[1];
  assert.equal(assistant.isTopicDraft(reply.data) && reply.data.name, "具身智能");
  assert.equal(reply.matches?.total, 2);
  assert.equal(assistant.topicConversation()?.messages.length, 4);
  assert.notEqual(assistant.newTopicConversation(), first.conversationId);
  assert.equal(assistant.topicConversation()?.messages.length, 0);
});

test("论文追问：带上原文与解读，记录保存，回答可存为笔记；删除解读时一并清除", async (t) => {
  db.insert(schema.digests).values({ paperId: "2610.10003", runId: 1, titleZh: "家庭具身智能体", oneLiner: "一句话", contentMd: "## 一句话总结\n解读正文" }).run();
  fs.mkdirSync(dataPath("papers", "2610.10003"), { recursive: true });
  fs.writeFileSync(dataPath("papers", "2610.10003", "content.json"), JSON.stringify({ text: "原文：成功率 87%", figures: [] }));
  const prompts = mockLlm(t, ["成功率是 87%（实验部分）。"]);
  const [q, a] = await assistant.askPaper("2610.10003", "成功率多少？");
  assert.equal(q.role, "user");
  assert.match(prompts[0], /原文：成功率 87%/);
  assert.match(prompts[0], /解读正文/);
  assert.equal(assistant.paperConversation("2610.10003").length, 2);
  lib.saveWholeNote("2610.10003", "已有笔记");
  const note = assistant.saveAnswerAsNote("2610.10003", a.id);
  assert.equal(note, "已有笔记\n\n问：成功率多少？\n答：成功率是 87%（实验部分）。");
  const d = db.select().from(schema.digests).all().find((x) => x.paperId === "2610.10003")!;
  lib.deleteDigests([d.id]);
  assert.equal(assistant.paperConversation("2610.10003").length, 0);
});

test("模型调用失败时撤回提问", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: { message: "boom" } }, { status: 400 }));
  const before = assistant.topicConversation()?.messages.length ?? 0;
  await assert.rejects(assistant.askTopicAssistant("失败的一句", assistant.topicConversation()?.id));
  assert.equal(assistant.topicConversation()?.messages.length ?? 0, before);
});

test("论文多会话隔离、归属校验、重命名、历史回答存笔记和删除", async (t) => {
  const paperId = "2610.10001";
  db.insert(schema.digests).values({ paperId, runId: 1, titleZh: "机器人", oneLiner: "机制", contentMd: "## 方法\n扩散策略" }).run();
  const a = assistant.newPaperConversation(paperId);
  const prompts = mockLlm(t, ["会话甲的回答", "会话乙的回答", "会话甲的后续"]);
  const [, answerA] = await assistant.askPaper(paperId, "甲独有问题", a);
  const b = assistant.newPaperConversation(paperId);
  await assistant.askPaper(paperId, "乙独有问题", b);
  await assistant.askPaper(paperId, "甲的后续问题", a);
  assert.doesNotMatch(prompts[1], /甲独有问题/);
  assert.match(prompts[2], /甲独有问题/);
  assert.doesNotMatch(prompts[2], /乙独有问题/);
  assert.equal(assistant.getPaperConversation(paperId, a).messages.length, 4);
  assistant.renamePaperConversation(paperId, a, "机制讨论");
  assert.equal(assistant.listPaperConversations(paperId).find(c => c.id === a)?.title, "机制讨论");
  assert.match(assistant.saveAnswerAsNote(paperId, answerA.id), /会话甲的回答/);
  const alien = "2610.10002";
  assert.throws(() => assistant.getPaperConversation(alien, a), /不属于/);
  assert.throws(() => assistant.renamePaperConversation(alien, a, "越权"), /不属于/);
  assert.throws(() => assistant.deletePaperConversation(alien, a), /不属于/);
  assert.throws(() => assistant.saveAnswerAsNote(alien, answerA.id), /不属于/);
  await assert.rejects(assistant.askPaper(alien, "越权", a));
  assistant.deletePaperConversation(paperId, a);
  assert.equal(assistant.listMessages(a).length, 0);
  assert.equal(assistant.getPaperConversation(paperId, b).messages.length, 2);
  assert.match(lib.listNotes(paperId)[0].content, /会话甲的回答/);
  assert.throws(() => assistant.getPaperConversation(paperId, a), /不存在/);
});

test("论文请求失败只撤回该会话的问题", async t => {
  const id = assistant.newPaperConversation("2610.10001");
  const before = assistant.listPaperConversations("2610.10001").find(c => c.id !== id)!;
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: { message: "boom" } }, { status: 400 }));
  await assert.rejects(assistant.askPaper("2610.10001", "失败", id));
  assert.equal(assistant.listMessages(id).length, 0);
  assert.equal(assistant.getPaperConversation("2610.10001", before.id).messages.length, before.messageCount);
});

test("新对话以用户问题为主命名，回答仅辅助，后续追问保留名称且不增加消息", async t => {
  const id = assistant.newReadingConversation("2610.10001");
  const prompts = mockLlm(t, ["策略通过逐步去噪得到动作。", "训练阶段学习噪声预测。"], ["扩散策略如何生成动作"]);
  assert.equal(assistant.listReadingConversations("2610.10001").find(c => c.id === id)?.title, "新对话");
  await assistant.askReading("2610.10001", "能解释一下论文里的扩散策略是怎么工作的吗？", id);
  assert.equal(assistant.listReadingConversations("2610.10001").find(c => c.id === id)?.title, "扩散策略如何生成动作");
  assert.match(prompts.titles[0], /能解释一下论文里的扩散策略是怎么工作的吗/);
  assert.match(prompts.titles[0], /策略通过逐步去噪得到动作/);
  assert.match(prompts.titles[0], /用户问题（命名的主要依据，按提问顺序）/);
  assert.match(prompts.titles[0], /回答（仅辅助理解问题，不作为标题结论）/);
  assert.ok(prompts.titles[0].indexOf("能解释一下") < prompts.titles[0].indexOf("策略通过逐步去噪"));
  await assistant.askReading("2610.10001", "它怎么训练？", id);
  assert.equal(prompts.titles.length, 1);
  assert.equal(assistant.listMessages(id).length, 4);
});

test("自动命名不会覆盖请求期间手动修改的名称，也不再请求已有名称", async t => {
  const id = assistant.newReadingConversation("2610.10001");
  let namingCalls = 0;
  t.mock.method(globalThis, "fetch", async (_: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    if (body.messages.some((message: { content: string }) => message.content === READING_CONVERSATION_TITLE_SYSTEM)) {
      namingCalls++;
      assistant.renamePaperConversation("2610.10001", id, "我自己的研究线索");
      return stream("模型生成的名字");
    }
    return stream("正常回答。");
  });
  await assistant.askReading("2610.10001", "解释策略", id);
  await assistant.askReading("2610.10001", "再展开", id);
  assert.equal(namingCalls, 1);
  assert.equal(assistant.listReadingConversations("2610.10001").find(c => c.id === id)?.title, "我自己的研究线索");
});

test("命名失败保留成功回答，下轮可重试；不截取首问作回退名称", async t => {
  const id = assistant.newReadingConversation("2610.10001");
  let namingCalls = 0;
  t.mock.method(globalThis, "fetch", async (_: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    if (body.messages.some((message: { content: string }) => message.content === READING_CONVERSATION_TITLE_SYSTEM)) {
      namingCalls++;
      return namingCalls === 1 ? Response.json({ error: { message: "naming failed" } }, { status: 400 }) : stream("去噪如何变成动作");
    }
    return stream("这条回答已经完成并保存。");
  });
  const messages = await assistant.askReading("2610.10001", "不要直接照搬这条很长的首次提问作为对话名字", id);
  assert.equal(messages[1].content, "这条回答已经完成并保存。");
  assert.equal(assistant.listMessages(id).length, 2);
  assert.equal(assistant.listReadingConversations("2610.10001").find(c => c.id === id)?.title, "新对话");
  await assistant.askReading("2610.10001", "继续解释动作生成", id);
  assert.equal(namingCalls, 2);
  assert.equal(assistant.listReadingConversations("2610.10001").find(c => c.id === id)?.title, "去噪如何变成动作");
});

test("提示词助手：带上当前写作要求与近期产出，草稿可保存为新版本（不启用）", async (t) => {
  const req = await import("./requirements");
  req.ensureRequirementVersions();
  const active = req.activeRequirementVersion("digest");
  db.insert(schema.digests).values({ paperId: "2610.10002", runId: 1, titleZh: "近期的一篇解读", oneLiner: "一句话", contentMd: "## 一句话总结\n这篇解读写得太长了" }).run();
  const prompts = mockLlm(t, [
    JSON.stringify({ reply: "我把篇幅要求收紧了。", draft: `${active.content}\n- 每节不超过 300 字。`, note: "收紧篇幅" }),
    JSON.stringify({ reply: "现在这样就挺好。", draft: active.content, note: null }),
  ]);
  const r = await assistant.askPromptAssistant("digest", active.id, "解读太长了");
  assert.match(prompts[0], /## 当前写作要求\n你是一位擅长/);
  assert.match(prompts[0], /这篇解读写得太长了/);
  const draft = r.messages[1].data;
  assert.ok(draft && "content" in draft && draft.content.endsWith("每节不超过 300 字。"));
  const v = assistant.saveRequirementDraft(r.messages[1].id);
  assert.deepEqual([v.note, v.active, v.number > active.number], ["收紧篇幅", false, true]);
  // 与当前内容相同的「草稿」不算草稿
  const same = await assistant.askPromptAssistant("digest", active.id, "还需要改吗", r.conversationId);
  assert.equal(same.messages[1].data, null);
  assert.equal(assistant.promptConversation("digest")?.messages.length, 4);
  await assert.rejects(assistant.askPromptAssistant("report", active.id, "x"), /版本不存在/);
});

test("月报共用阅读会话和笔记，按月份隔离，并且只将当前月报交给助手", async t => {
  db.insert(schema.trendReports).values([
    { month: "2026-09", title: "九月趋势", contentMd: "## 九月证据\n九月独有证据：机器人策略。" },
    { month: "2026-10", title: "十月趋势", contentMd: "## 十月证据\n十月独有证据：评测方法。" },
  ]).run();
  const september = reportSubject("2026-09"), october = reportSubject("2026-10");
  const first = assistant.newReadingConversation(september), second = assistant.newReadingConversation(october);
  const prompts = mockLlm(t, ["九月回答", "十月回答"]);
  const [, answer] = await assistant.askReading(september, "九月有哪些趋势？", first);
  await assistant.askReading(october, "十月有哪些趋势？", second);
  assert.match(prompts[0], /九月独有证据/);
  assert.doesNotMatch(prompts[0], /十月独有证据/);
  assert.match(prompts[1], /十月独有证据/);
  assert.doesNotMatch(prompts[1], /九月独有证据|九月有哪些趋势/);
  assert.equal(getReadingDocument(october)?.kind, "report");
  assert.match(assistant.saveAnswerAsNote(september, answer.id), /九月回答/);
  assert.equal(lib.listNotes(october).length, 0);
  assert.throws(() => assistant.getReadingConversation(october, first), /不属于/);
  assert.throws(() => assistant.saveAnswerAsNote(october, answer.id), /不属于/);
  assert.throws(() => assistant.getReadingConversation("2610.10001", first), /不属于/);
  assert.throws(() => assistant.newReadingConversation("report:2026-08"), /不存在/);
  assert.throws(() => reportSubject("2026-13"), /格式/);
  assert.equal(getReadingDocument("report:../../app.db"), null);
});

test("reader model choice routes the request and logs usage without changing default policy", async t => {
  const alternate = db.insert(schema.llmModels).values({ providerId: p.id, modelId: "reader-alternate" }).returning().get();
  const disabled = db.insert(schema.llmModels).values({ providerId: p.id, modelId: "reader-disabled", enabled: false }).returning().get();
  const sent: string[] = [];
  t.mock.method(globalThis, "fetch", async (_: unknown, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)).model);
    return stream("选定模型回答");
  });
  const id = assistant.newReadingConversation("2610.10001");
  await assistant.askReading("2610.10001", "引用正文：扩散策略\n\n快速解释", id, alternate.id);
  assert.deepEqual(sent, ["reader-alternate", "reader-alternate"], "Answer and title use the selected reading model");
  assert.equal(policy.getModelPolicy().defaultModelId, m.id);
  assert.ok(db.select().from(schema.llmCalls).all().some(call => call.modelRefId === alternate.id && call.stage === "chat"));
  for (const invalid of [disabled.id, -1, 999999]) {
    await assert.rejects(assistant.askReading("2610.10001", "无效模型", id, invalid), /模型/);
    assert.equal(assistant.listMessages(id).length, 2, "Invalid model requests leave no unanswered message");
  }
});
