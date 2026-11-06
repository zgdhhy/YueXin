/** Reader-only window geometry. Persist preferences, never temporary viewport fallbacks. */
export type PanelView = "qa" | "notes" | "resources";
export type PanelMode = "left" | "right" | "floating" | "fullscreen";
export type WindowMode = Exclude<PanelMode, "fullscreen">;
export type Bounds = { x: number; y: number; width: number; height: number };
export type FloatingSize = Pick<Bounds, "width" | "height"> & Partial<Pick<Bounds, "x" | "y">>;
export type PanelPreferences = { version: 1; mode: WindowMode; dockWidth: number; floating: FloatingSize | null };
export type PanelViewport = { width: number; height: number; top: number; shellLeft: number; shellWidth: number };
export type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export const PANEL_STORAGE_KEY = "paper-reader-panel:v1";
export const DEFAULT_PANEL: PanelPreferences = { version: 1, mode: "right", dockWidth: 420, floating: null };
const PANEL_GAP = 24;
/** 168px directory + 24px gap + at least 520px of article text. */
const MIN_READING_WIDTH = 712;
export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export function parsePanelPreferences(raw: string | null): PanelPreferences {
  try {
    const p = JSON.parse(raw ?? "null");
    if (!p || p.version !== 1) return { ...DEFAULT_PANEL };
    const floating = p.floating && ["width", "height"].every(k => finite(p.floating[k]))
      ? { width: Math.max(360, p.floating.width), height: Math.max(360, p.floating.height) } : null;
    // Accept existing v1 storage, but discard its historical mode and coordinates.
    return { version: 1, mode: "right", dockWidth: finite(p.dockWidth) ? clamp(p.dockWidth, 360, 720) : 420, floating };
  } catch { return { ...DEFAULT_PANEL }; }
}

export function panelSizePreferences(preferences: PanelPreferences) {
  const { dockWidth, floating } = preferences;
  return { version: 1, dockWidth, floating: floating ? { width: floating.width, height: floating.height } : null };
}

export function dockLimit(viewport: PanelViewport) {
  return Math.min(720, viewport.shellWidth - MIN_READING_WIDTH - PANEL_GAP);
}
export function effectiveMode(mode: PanelMode, viewport: PanelViewport): PanelMode {
  return (mode === "left" || mode === "right") && dockLimit(viewport) < 360 ? "floating" : mode;
}
export function clampFloating(bounds: FloatingSize | null, viewport: PanelViewport): Bounds {
  const maxWidth = Math.max(0, viewport.width - 32);
  const maxHeight = Math.max(0, viewport.height - viewport.top - 16);
  const width = clamp(bounds?.width ?? 480, Math.min(360, maxWidth), maxWidth);
  const height = clamp(bounds?.height ?? 600, Math.min(360, maxHeight), maxHeight);
  return {
    x: clamp(bounds?.x ?? viewport.width - width - 16, 16, viewport.width - width - 16),
    y: clamp(bounds?.y ?? viewport.height - height - 16, viewport.top, viewport.height - height - 16),
    width, height,
  };
}
export function resizeFloating(start: Bounds, edge: ResizeEdge, dx: number, dy: number, viewport: PanelViewport): Bounds {
  let { x, y, width, height } = start;
  if (edge.includes("e")) width = clamp(width + dx, Math.min(360, viewport.width - 32), viewport.width - x - 16);
  if (edge.includes("s")) height = clamp(height + dy, Math.min(360, viewport.height - viewport.top - 16), viewport.height - y - 16);
  if (edge.includes("w")) { x = clamp(x + dx, 16, x + width - Math.min(360, viewport.width - 32)); width = start.x + start.width - x; }
  if (edge.includes("n")) { y = clamp(y + dy, viewport.top, y + height - Math.min(360, viewport.height - viewport.top - 16)); height = start.y + start.height - y; }
  return clampFloating({ x, y, width, height }, viewport);
}
