import { test } from "node:test";
import assert from "node:assert/strict";
import { compileShot, extractCode } from "./compile";

const ok = `\`\`\`tsx
import { useCurrentFrame, interpolate } from "remotion";
import { Title, FadeIn } from "@kit";
export default function Shot({ cueStarts }: { cueStarts: number[] }) {
  const frame = useCurrentFrame();
  return <div style={{ opacity: interpolate(frame, [0, 10], [0, 1]) }}><Title>标题</Title><FadeIn delay={cueStarts[0]}>内容</FadeIn></div>;
}
\`\`\``;

test("合法的镜头代码编译成 CommonJS", () => {
  const r = compileShot(ok);
  assert.ok(r.js, r.error);
  assert.match(r.js!, /require\("remotion"\)/);
  assert.match(r.js!, /require\("@kit"\)/);
  assert.equal(extractCode("说明\n```tsx\nexport default 1\n```\n结尾"), "export default 1");
});

test("只允许引用 react、remotion 与 @kit", () => {
  assert.match(compileShot(`import fs from "node:fs";\nexport default () => null;`).error!, /不允许引用 node:fs/);
  assert.match(compileShot(`import x from "./other";\nexport default () => null;`).error!, /不允许引用/);
});

test("拒绝网络、全局对象与动态执行，即使藏在字符串技巧之后", () => {
  for (const body of [
    `fetch("https://x")`,
    `const u = "a//"; fetch(u)`,
    `"x".replace(/"/g, ""); window.open("x")`,
    `new Function("return 1")()`,
    `({}).constructor.constructor("return this")()`,
    `import("x")`,
    `const t = \`\${globalThis.process}\``,
  ]) {
    const r = compileShot(`export default function S() { ${body}; return null; }`);
    assert.ok(r.error, body);
  }
});

test("语法错误与缺少默认导出给出可读的原因", () => {
  assert.match(compileShot(`export default function S() { return <div> }`).error!, /第 \d+ 行/);
  assert.match(compileShot(`const a = 1;`).error!, /export default/);
});
