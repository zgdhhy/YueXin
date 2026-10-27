import { test } from "node:test";
import assert from "node:assert/strict";
import { ruleScore } from "./score";

const topics = [
  { name: "Agent", arxivCategories: ["cs.AI"], keywords: ["agent", "tool use"], weight: 1.5 },
  { name: "CV", arxivCategories: ["cs.CV"], keywords: ["segmentation"], weight: 1 },
];
const base = { abstract: "", upvotes: 0, citations: null, organization: null, arxivCategories: [], keywords: [], githubUrl: null };

test("主题匹配与热度都提高分数", () => {
  const plain = ruleScore({ ...base, title: "A study of soil" }, topics, []);
  const agent = ruleScore({ ...base, title: "Agent planning with tool use" }, topics, []);
  const popular = ruleScore({ ...base, title: "A study of soil", upvotes: 200 }, topics, []);
  assert.equal(plain.total, 0);
  assert.ok(agent.total > plain.total);
  assert.deepEqual(agent.matchedTopics, ["Agent"]);
  assert.ok(popular.popularity > 10);
});

test("关键词按整词匹配，机构命中加分", () => {
  const s = ruleScore({ ...base, title: "Reagents in chemistry", organization: "Google DeepMind" }, topics, ["DeepMind"]);
  assert.equal(s.topic, 0);
  assert.equal(s.institution, 2);
});

test("有引用数时用引用数衡量热度", () => {
  const s = ruleScore({ ...base, title: "x", upvotes: 1000, citations: 0 }, topics, []);
  assert.equal(s.popularity, 0);
});
