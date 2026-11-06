"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveNoteAction } from "@/app/(site)/actions";

/** Debounced, serialized writes; the local draft also survives navigation or a failed request. */
export function useNotebookAutosave(subjectId: string, initialContent: string) {
  const router = useRouter();
  const key = `paper-notebook-draft:${subjectId}`;
  const [value, setValue] = useState(initialContent);
  const [status, setStatus] = useState<"saved" | "pending" | "saving" | "error">("saved");
  const [error, setError] = useState("");
  const current = useRef({ text: initialContent, saved: initialContent, saving: false, mounted: false });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const schedule = useCallback((delay = 600) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flushRef.current(), delay);
  }, []);

  const flush = useCallback(async () => {
    const state = current.current;
    clearTimeout(timer.current);
    if (state.saving || state.text === state.saved) return;
    state.saving = true;
    if (state.mounted) { setStatus("saving"); setError(""); }
    try {
      while (state.text !== state.saved) {
        const snapshot = state.text;
        await saveNoteAction(subjectId, snapshot);
        state.saved = snapshot;
        // Never clear a newer local edit when an older request completes.
        if (state.text === snapshot) {
          try { if (localStorage.getItem(key) === state.text) localStorage.removeItem(key); } catch { /* Storage is optional. */ }
        }
      }
      if (state.mounted) { setStatus("saved"); router.refresh(); }
    } catch (e) {
      if (state.mounted) {
        if (state.text === state.saved) { setStatus("saved"); setError(""); return; }
        setStatus("error");
        setError(e instanceof Error ? e.message : "自动保存失败");
        schedule(5000);
      }
    } finally { state.saving = false; }
  }, [key, router, schedule, subjectId]);
  flushRef.current = flush;

  useEffect(() => {
    const state = current.current;
    state.mounted = true;
    try {
      const draft = localStorage.getItem(key);
      if (draft !== null && draft !== state.saved) {
        state.text = draft;
        setValue(draft); setStatus("pending"); schedule();
      }
    } catch { /* Private/storage-disabled browsers keep drafts in memory. */ }
    return () => {
      state.mounted = false;
      clearTimeout(timer.current);
      void flushRef.current();
    };
  }, [key, schedule]);

  useEffect(() => {
    const state = current.current;
    if (!state.saving && state.text === state.saved) {
      state.saved = initialContent;
      state.text = initialContent;
      setValue(initialContent);
    }
  }, [initialContent]);

  const onChange = (text: string) => {
    const state = current.current;
    state.text = text;
    setValue(text);
    try { localStorage.setItem(key, text); } catch { /* Saving to the server still works. */ }
    setStatus(state.saving ? "saving" : text === state.saved ? "saved" : "pending");
    setError("");
    schedule();
  };
  return { value, onChange, status, error };
}
