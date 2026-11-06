import { test } from "node:test";
import assert from "node:assert/strict";
import { clampFloating, DEFAULT_PANEL, dockLimit, effectiveMode, panelSizePreferences, parsePanelPreferences, resizeFloating, type PanelViewport, type ResizeEdge } from "./reader-panel-layout";

const viewport: PanelViewport = { width: 1440, height: 900, top: 108, shellLeft: 40, shellWidth: 1304 };
test("preferences retain sizes but discard old modes and coordinates", () => {
  for (const raw of [null, "{", "null", "[]", '{"version":2}']) assert.deepEqual(parsePanelPreferences(raw), DEFAULT_PANEL);
  for (const mode of ["left", "right", "floating", "fullscreen"]) {
    const old = JSON.stringify({ version: 1, mode, dockWidth: 99999, floating: { x: 20, y: 120, width: 480, height: 600 } });
    assert.deepEqual(parsePanelPreferences(old), { version: 1, mode: "right", dockWidth: 720, floating: { width: 480, height: 600 } });
  }
  assert.deepEqual(panelSizePreferences({ ...DEFAULT_PANEL, mode: "left", floating: { x: 20, y: 120, width: 510, height: 450 } }), { version: 1, dockWidth: 420, floating: { width: 510, height: 450 } });
  assert.equal(parsePanelPreferences('{"version":1,"mode":"left","dockWidth":-4}').dockWidth, 360);
  assert.equal(parsePanelPreferences('{"version":1,"floating":{"x":null}}').floating, null);
});
test("docking reserves 520px for reading and falls back without mutating preferences", () => {
  assert.equal(dockLimit(viewport), 568);
  const narrow = { ...viewport, shellWidth: 1095 };
  assert.equal(effectiveMode("left", narrow), "floating");
  assert.equal(effectiveMode("left", { ...narrow, shellWidth: 1096 }), "left");
  assert.equal(effectiveMode("fullscreen", narrow), "fullscreen");
  assert.equal(DEFAULT_PANEL.mode, "right");
});
test("floating restores into the visible viewport after window shrink", () => {
  assert.equal(clampFloating({ width: 480, height: 1 }, viewport).height, 360, "Minimum height clears the four-button rail and header");
  assert.deepEqual(clampFloating(null, viewport), { x: 944, y: 284, width: 480, height: 600 });
  const small = { ...viewport, width: 800, height: 500 };
  const bounds = clampFloating({ x: 1800, y: 900, width: 1000, height: 800 }, small);
  assert.deepEqual(bounds, { x: 16, y: 108, width: 768, height: 376 });
});
test("all eight resize directions keep fixed opposite edges and enforce bounds", () => {
  const start = { x: 500, y: 200, width: 480, height: 500 };
  for (const edge of ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as ResizeEdge[]) {
    const result = resizeFloating(start, edge, 42, 36, viewport);
    if (edge.includes("w")) assert.equal(result.x + result.width, start.x + start.width);
    else assert.equal(result.x, start.x);
    if (edge.includes("n")) assert.equal(result.y + result.height, start.y + start.height);
    else assert.equal(result.y, start.y);
    for (const delta of [-10000, 10000]) {
      const limited = resizeFloating(start, edge, delta, delta, viewport);
      assert.ok(limited.width >= 360 && limited.height >= 320);
      assert.ok(limited.x >= 16 && limited.y >= viewport.top);
      assert.ok(limited.x + limited.width <= viewport.width - 16);
      assert.ok(limited.y + limited.height <= viewport.height - 16);
    }
  }
});
