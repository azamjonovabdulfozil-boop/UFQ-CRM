// HTML/JS in'yeksiyasini zararsizlantirish: zararli matn teg bo'lmasin, oddiy matn o'zgarmasin
import assert from "node:assert/strict";
import { cleanStr, cleanDeep, cleanKvValue } from "../security/xssData.js";

assert.equal(cleanStr("Ali <img src=x onerror=alert(1)>"), "Ali ‹img src=x onerror=alert(1)›", "teg buziladi");
assert.equal(cleanStr('x" onmouseover="alert(1)'), "x” onmouseover=”alert(1)", "atributdan chiqib bo'lmaydi");
assert.equal(cleanStr("javascript:alert(1)"), "#alert(1)", "javascript: havola o'chadi");
assert.equal(cleanStr("  JavaScript:alert(1)"), "#alert(1)", "katta-kichik harf va bo'shliq bilan ham");
assert.ok(!/^data:text\/html/i.test(cleanStr("data:text/html,hello")), "data:text/html o'chadi");

// Oddiy ma'lumot o'zgarmaydi
for (const s of ["O'tkir G'ulomov", "data:image/png;base64,iVBORw0KGgo=", "https://youtu.be/abc?t=1&x=2", "+998 90 123 45 67", "1 200 000"])
  assert.equal(cleanStr(s), s, "o'zgarmasligi kerak: " + s);

// Chuqur: massiv, obyekt, kalitlar
const d = cleanDeep({ students: [{ name: "<b>A</b>", phone: "1" }], notes: { "s1<x>": "ok" } });
assert.equal(d.students[0].name, "‹b›A‹/b›");
assert.ok("s1‹x›" in d.notes);
const clean = { a: "toza", b: [1, "x"] };
assert.equal(cleanDeep(clean), clean, "o'zgarish bo'lmasa — o'sha obyekt");

// KV: JSON satr ichi tozalanadi, JSON o'zi buzilmaydi
const kv = cleanKvValue(JSON.stringify({ msgs: [{ text: "<script>x</script>", file: { data: "javascript:alert(1)" } }] }));
const parsed = JSON.parse(kv);
assert.equal(parsed.msgs[0].text, "‹script›x‹/script›");
assert.equal(parsed.msgs[0].file.data, "#alert(1)");

console.log("✅ HTML/JS in'yeksiyasi zararsizlanadi, oddiy ma'lumot o'zgarmaydi");
