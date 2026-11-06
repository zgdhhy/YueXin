"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

/**
 * 由 URL 控制的弹窗：服务端按 ?modal= 渲染内容，关闭时回到 closeHref。
 * 用原生 <dialog>，自带焦点管理与 Esc 关闭。
 * size="xl" 为固定高度的大弹窗，内容自行布局（如左右分栏），不加内边距。
 * size="drawer" 为 560px 右侧抽屉（手机全屏），内容区独立滚动，表单可用 sticky 底栏。
 */
export function Modal({
  title,
  description,
  closeHref,
  size = "md",
  children,
}: {
  title: string;
  description?: React.ReactNode;
  closeHref: string;
  size?: "md" | "xl" | "drawer";
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  useEffect(() => {
    const d = ref.current;
    if (!d || d.open) return;
    d.showModal();
    // 聚焦弹窗本身，而不是自动聚焦到关闭按钮
    d.focus();
  }, []);

  const close = () => router.replace(closeHref, { scroll: false });
  const xl = size === "xl";
  const drawer = size === "drawer";

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      // 点遮罩关闭：点击落在 dialog 本身（而非内容）上
      onClick={(e) => e.target === ref.current && close()}
      className={`${
        drawer
          ? "my-0 mr-0 ml-auto h-dvh max-h-dvh w-full max-w-none sm:w-[560px]"
          : `m-auto w-[calc(100vw-2rem)] rounded-2xl ${xl ? "max-w-6xl" : "max-w-2xl"}`
      } bg-white p-0 shadow-2xl ring-1 ring-slate-200 outline-none backdrop:bg-slate-900/40 backdrop:backdrop-blur-[2px]`}
    >
      <div className={`flex flex-col ${xl ? "h-[88vh]" : drawer ? "h-full" : "max-h-[88vh]"}`}>
        <div className="flex items-start gap-4 border-b border-slate-100 px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {description && <div className="mt-0.5 text-sm text-slate-500">{description}</div>}
          </div>
          <button
            type="button"
            onClick={close}
            className="-mr-1.5 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            title="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {xl ? (
          <div className="min-h-0 flex-1">{children}</div>
        ) : (
          <div className={`overflow-y-auto px-6 ${drawer ? "min-h-0 flex-1 pt-6" : "py-6"}`}>{children}</div>
        )}
      </div>
    </dialog>
  );
}
