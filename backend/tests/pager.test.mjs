/**
 * Frontend sahifalash moduli (public/core/pager.js) mantiqini tekshirish.
 *   node tests/pager.test.mjs
 * Uchala portaldagi nusxa bir xil bo'lishi ham tekshiriladi.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const src = read("admin/public/core/pager.js");

let n = 0;
const t = (name, fn) => {
  fn();
  n++;
  console.log("✅", name);
};

function load() {
  const win = {};
  vm.runInNewContext(src, { window: win, document: { querySelector: () => null }, console });
  return win.Pager;
}
const range = (k) => Array.from({ length: k }, (_, i) => i + 1);

t("uchala portalda pager.js bir xil", () => {
  assert.equal(read("mentor/public/core/pager.js"), src);
  assert.equal(read("student/public/core/pager.js"), src);
});

t("47 ta element -> 5 sahifa, oxirgisida 7 ta", () => {
  const P = load();
  const items = range(47);
  let r = P.slice("s", items, { render() {} });
  assert.equal(r.pages, 5);
  assert.deepEqual(r.items, range(10));
  const seen = [];
  for (let p = 1; p <= 5; p++) {
    P._state.s.page = p;
    r = P.slice("s", items);
    seen.push(...r.items);
  }
  assert.equal(r.items.length, 7);
  assert.deepEqual(seen, items, "takrorlanmasin va yo'qolmasin");
});

t("chegaraviy holatlar: 1, 10, 11, 20, 21", () => {
  const P = load();
  for (const [k, pages] of [[1, 1], [10, 1], [11, 2], [20, 2], [21, 3], [0, 1]]) {
    assert.equal(P.slice("e" + k, range(k)).pages, pages, k + " ta");
  }
  P._state.e11.page = 2;
  assert.equal(P.slice("e11", range(11)).items.length, 1);
});

t("qidiruv/filtr o'zgarsa 1-sahifaga qaytadi (100 -> 14 ta)", () => {
  const P = load();
  P.slice("q", range(100), { sig: "" });
  P._state.q.page = 4;
  assert.equal(P.slice("q", range(100), { sig: "" }).page, 4, "sig o'zgarmasa sahifa saqlanadi");
  const r = P.slice("q", range(14), { sig: "ali" });
  assert.equal(r.page, 1);
  assert.equal(r.pages, 2);
  P._state.q.page = 2;
  assert.equal(P.slice("q", range(14), { sig: "ali" }).items.length, 4);
});

t("o'chirishdan keyin sahifa yo'qolsa — oxirgi mavjud sahifa", () => {
  const P = load();
  P.slice("d", range(21));
  P._state.d.page = 3;
  const r = P.slice("d", range(20));
  assert.equal(r.page, 2);
  assert.deepEqual(r.items, range(20).slice(10));
});

t("html: birinchi sahifada Orqaga, oxirgisida Keyingi nofaol", () => {
  const P = load();
  P.slice("h", range(25));
  let h = P.html("h");
  assert.match(h, /disabled onclick="event.stopPropagation\(\);Pager.go\('h',0\)">/);
  assert.match(h, /<b>1<\/b> \/ 3/);
  assert.doesNotMatch(h, /disabled onclick="event.stopPropagation\(\);Pager.go\('h',2\)/);
  P._state.h.page = 3;
  P.slice("h", range(25));
  h = P.html("h");
  assert.match(h, /disabled onclick="event.stopPropagation\(\);Pager.go\('h',4\)">/);
  assert.equal(P.html("none"), "");
});

t("go(): chegaradan chiqmaydi va render chaqiradi", () => {
  const P = load();
  let calls = 0;
  P.slice("g", range(30), { render: () => calls++ });
  P.go("g", 99);
  assert.equal(P.page("g"), 3);
  P.go("g", -5);
  assert.equal(P.page("g"), 1);
  assert.equal(calls, 2);
});

console.log(`\n${n} ta test o'tdi`);
