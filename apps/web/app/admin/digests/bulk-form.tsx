"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 批量操作表单：统计勾选的 ids，提供全选本页；
 * actions 里的按钮在未勾选时禁用，并显示已选数量。
 */
export function BulkForm({ children, actions }: { children: React.ReactNode; actions: React.ReactNode }) {
  const form = useRef<HTMLFormElement>(null);
  const all = useRef<HTMLInputElement>(null);
  const [count, setCount] = useState(0);
  const [total, setTotal] = useState(0);
  useEffect(() => {
    const f = form.current!;
    const boxes = () => [...f.querySelectorAll<HTMLInputElement>('input[name="ids"]')];
    const sync = () => {
      const list = boxes();
      const n = list.filter((b) => b.checked).length;
      setCount(n);
      setTotal(list.length);
      if (all.current) {
        all.current.checked = n > 0 && n === list.length;
        all.current.indeterminate = n > 0 && n < list.length;
      }
    };
    sync();
    f.addEventListener("change", sync);
    return () => f.removeEventListener("change", sync);
  }, []);
  return (
    <form ref={form} className="admin-bulk">
      <div className="admin-bulk-bar">
        <label>
          <input
            ref={all}
            type="checkbox"
            aria-label="全选本页"
            disabled={!total}
            onChange={(e) => {
              for (const b of form.current!.querySelectorAll<HTMLInputElement>('input[name="ids"]')) b.checked = e.target.checked;
              form.current!.dispatchEvent(new Event("change"));
            }}
          />
          {count ? `已选 ${count} 篇` : "全选"}
        </label>
        <fieldset disabled={!count}>{actions}</fieldset>
      </div>
      {children}
    </form>
  );
}
