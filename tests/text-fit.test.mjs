import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function loadTs(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import("data:text/javascript;base64," + Buffer.from(outputText).toString("base64"));
}

const { MODES, MODE_CSS, classifyFit, serializeCss, serializeJson } = await loadTs("../src/text-fit/model.ts");
const { COPY, SAMPLES } = await loadTs("../src/text-fit/strings.ts");

const setup = {
  width: 256, height: 84, fontSize: 20, lineHeight: 1.35, mode: "ellipsis",
  text: '「装備」を回収\nVolver al último punto de control', sampleId: null, lang: "ja",
};

test("exports preserve the current settings and identify the browser preview", () => {
  assert.deepEqual(JSON.parse(serializeJson(setup)), { ...setup, preview: "browser-local" });
  const css = serializeCss(setup);
  for (const declaration of [
    "width: 256px;", "height: 84px;", "font-size: 20px;", "line-height: 1.35;",
    "overflow: hidden;", "white-space: nowrap;", "text-overflow: ellipsis;",
    "overflow-wrap: normal;", "word-break: normal;",
  ]) assert.ok(css.includes(`  ${declaration}\n`), declaration);
  assert.match(serializeCss({ ...setup, mode: "overflow-wrap" }), /overflow-wrap: break-word;/);
});

test("the mode map distinguishes clipping, wrapping, aggressive breaking and ellipsis", () => {
  const css = (mode) => {
    const style = MODE_CSS[mode];
    return [style.overflow, style["white-space"], style["overflow-wrap"], style["word-break"], style["text-overflow"]];
  };
  assert.deepEqual(MODES.map(css), [
    ["visible", "pre-wrap", "normal", "normal", "clip"],
    ["hidden", "pre-wrap", "normal", "normal", "clip"],
    ["visible", "pre-wrap", "break-word", "normal", "clip"],
    ["visible", "pre-wrap", "normal", "break-all", "clip"],
    ["hidden", "nowrap", "normal", "normal", "ellipsis"],
  ]);
});

test("switchable samples include each product language and an unbroken compound with CJK", () => {
  assert.deepEqual(SAMPLES.map(({ id }) => id), ["en", "zh", "ja", "ko", "es", "compound"]);
  const [compound, cjk] = SAMPLES.find(({ id }) => id === "compound").text.split("\n");
  assert.match(compound, /^\p{L}{40,}$/u);
  assert.match(cjk, /\p{Script=Han}/u);
});

test("all five locales supply translated titles, disclaimers and mode names", () => {
  assert.deepEqual(Object.keys(COPY), ["en", "zh", "ja", "ko", "es"]);
  for (const copy of Object.values(COPY)) {
    assert.ok(copy.title.trim().length > 10);
    assert.match(copy.disclaimer, /Unity TextMeshPro.*Godot TextServer.*Unreal/);
    for (const mode of MODES) assert.ok(copy.modes[mode].trim());
  }
  for (const field of ["title", "disclaimer"]) {
    assert.equal(new Set(Object.values(COPY).map((copy) => copy[field])).size, 5);
  }
});

test("fit measurement distinguishes horizontal overflow, clipping and vertical overflow after wrapping", () => {
  const narrow = { scrollWidth: 540, scrollHeight: 60, clientWidth: 110, clientHeight: 60, wraps: false };
  assert.deepEqual(classifyFit("visible", narrow), { outcome: "overflows", x: true, y: false, wraps: false });
  assert.deepEqual(classifyFit("hidden", narrow), { outcome: "clips", x: true, y: false, wraps: false });
  assert.deepEqual(classifyFit("ellipsis", narrow), { outcome: "clips", x: true, y: false, wraps: false });
  assert.deepEqual(classifyFit("visible", { ...narrow, clientWidth: 600 }), {
    outcome: "fits", x: false, y: false, wraps: false,
  });
  const wrapped = { ...narrow, scrollWidth: 110, scrollHeight: 120, wraps: true };
  assert.deepEqual(classifyFit("overflow-wrap", wrapped), { outcome: "overflows", x: false, y: true, wraps: true });
  assert.deepEqual(classifyFit("break-all", { ...wrapped, clientHeight: 120 }), {
    outcome: "fits", x: false, y: false, wraps: true,
  });
});
