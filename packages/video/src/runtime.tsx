import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import * as Remotion from "remotion";
import * as Kit from "./kit";
import type { ShotProps } from "./script";

/**
 * 运行模型写的镜头代码（ADR 0003）。代码在 Node 侧已经过静态检查并编译成 CommonJS，
 * 这里只允许它引用 react、remotion 与 @kit；出错的镜头退化为简单画面，并通过
 * console.error("SHOT_FAILED <序号> ...") 让渲染端记录下来。
 */
const MODULES: Record<string, unknown> = {
  react: React,
  "react/jsx-runtime": jsxRuntime,
  remotion: Remotion,
  "@kit": Kit,
};

const cache = new Map<string, React.ComponentType<ShotProps>>();

function loadShot(js: string): React.ComponentType<ShotProps> {
  const hit = cache.get(js);
  if (hit) return hit;
  const module = { exports: {} as Record<string, unknown> };
  const require = (name: string) => {
    if (!(name in MODULES)) throw new Error(`不允许引用 ${name}`);
    return MODULES[name];
  };
  new Function("require", "module", "exports", js)(require, module, module.exports);
  const C = module.exports.default;
  if (typeof C !== "function") throw new Error("镜头代码没有默认导出组件");
  cache.set(js, C as React.ComponentType<ShotProps>);
  return C as React.ComponentType<ShotProps>;
}

const failure = (index: number, e: unknown) => `SHOT_FAILED ${index} ${e instanceof Error ? e.message : String(e)}`;

class ShotBoundary extends React.Component<{ index: number; fallback: React.ReactNode; children: React.ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  componentDidCatch(error: unknown) {
    console.error(failure(this.props.index, error));
  }
  render() {
    return this.state.error ? this.props.fallback : this.props.children;
  }
}

/** 一个镜头的画面：有代码就运行代码，否则（或出错时）显示标题 + 文案 */
export function ShotView({ index, js, heading, lines, props }: { index: number; js: string | null; heading: string; lines: string[]; props: ShotProps }) {
  const fallback = <Kit.FallbackShot heading={heading} lines={lines} />;
  if (!js) return fallback;
  let C: React.ComponentType<ShotProps>;
  try {
    C = loadShot(js);
  } catch (e) {
    console.error(failure(index, e));
    return fallback;
  }
  return (
    <ShotBoundary index={index} fallback={fallback}>
      <C {...props} />
    </ShotBoundary>
  );
}
