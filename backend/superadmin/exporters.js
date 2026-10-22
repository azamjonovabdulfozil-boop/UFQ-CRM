/**
 * superadmin/exporters.js — hisobotni CSV / Excel (XLSX) / PDF faylga aylantirish.
 *
 * Tashqi kutubxona ishlatilmaydi: XLSX — standart Office Open XML + ZIP
 * (node:zlib), PDF — oddiy jadvalli PDF 1.4 (Helvetica). Fayl SERVERDA
 * quriladi — ya'ni ma'lumot faqat ruxsat tekshirilgandan va jurnalga
 * yozilgandan keyin tashqariga chiqadi.
 *
 * Hisobot shakli: { title, period, source, method, generatedAt, generatedBy,
 *                   filters, columns: [..], rows: [[..], ..] }
 */
import zlib from "node:zlib";

const cell = (v) => (v == null || (typeof v === "number" && !isFinite(v)) ? "" : v);

function headerRows(rep) {
  return [
    ["Hisobot", rep.title],
    ["Davr", rep.period],
    ["Filtrlar", rep.filters || "yo'q"],
    ["Ma'lumot manbasi", rep.source],
    ["Hisoblash usuli", rep.method],
    ["Eksport qilingan vaqt", rep.generatedAt + (rep.generatedBy ? " — " + rep.generatedBy : "")],
  ];
}

// ─── CSV ──────────────────────────────────────────────────────────────────────
export function toCsv(rep) {
  const q = (v) => {
    let s = String(cell(v));
    // CSV injection himoyasi: Excel formulasi sifatida ishga tushmasin
    if (/^[=+\-@\t\r]/.test(s) && typeof v !== "number") s = "'" + s;
    return /[",\n;\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [
    ...headerRows(rep).map((r) => r.map(q).join(",")),
    "",
    rep.columns.map(q).join(","),
    ...rep.rows.map((r) => r.map(q).join(",")),
  ];
  return Buffer.from("﻿" + lines.join("\r\n"), "utf8");
}

// ─── ZIP (XLSX uchun) ─────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, "utf8");
    const comp = zlib.deflateRawSync(data);
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6); // UTF-8 nomlar
    lh.writeUInt16LE(8, 8); // deflate
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0x21, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28);
    locals.push(lh, name, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0x21, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += lh.length + name.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// ─── XLSX ─────────────────────────────────────────────────────────────────────
const xmlEsc = (s) =>
  String(s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function colName(i) {
  let s = "";
  i++;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

export function toXlsx(rep) {
  const rows = [...headerRows(rep), [], rep.columns, ...rep.rows];
  const headerIdx = headerRows(rep).length + 1; // 0-based index of column row
  const widths = rep.columns.map((c, i) =>
    Math.min(50, Math.max(10, String(c).length + 2, ...rep.rows.slice(0, 200).map((r) => String(cell(r[i])).length + 2))),
  );
  widths[0] = Math.max(widths[0] || 10, 22);
  const sheetRows = rows
    .map((r, ri) => {
      const cells = r
        .map((v, ci) => {
          const ref = colName(ci) + (ri + 1);
          const val = cell(v);
          const bold = ri === headerIdx || (ri < headerIdx - 1 && ci === 0) ? ' s="1"' : "";
          if (typeof val === "number") return `<c r="${ref}"${bold}><v>${val}</v></c>`;
          if (val === "") return "";
          return `<c r="${ref}" t="inlineStr"${bold}><is><t xml:space="preserve">${xmlEsc(val)}</t></is></c>`;
        })
        .join("");
      return `<row r="${ri + 1}">${cells}</row>`;
    })
    .join("");
  const sheet =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerIdx + 1}" topLeftCell="A${headerIdx + 2}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` +
    `<sheetData>${sheetRows}</sheetData></worksheet>`;
  const files = [
    {
      name: "[Content_Types].xml",
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    },
    {
      name: "_rels/.rels",
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets><sheet name="Hisobot" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    {
      name: "xl/styles.xml",
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
        `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
        `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
        `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
        `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>` +
        `</styleSheet>`,
    },
    { name: "xl/worksheets/sheet1.xml", data: sheet },
  ];
  return zip(files);
}

// ─── PDF ──────────────────────────────────────────────────────────────────────
/** WinAnsi ga sig'maydigan belgilarni o'xshashiga almashtiradi. */
function pdfText(s) {
  const t = String(cell(s))
    .replace(/[ʻʼ‘’`´]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[—–−]/g, "-")
    .replace(/…/g, "...")
    .replace(/→/g, "->")
    .replace(/[≥]/g, ">=")
    .replace(/[≤]/g, "<=")
    .replace(/×/g, "x")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
  return t.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
const CHAR_W = 0.52; // Helvetica o'rtacha belgi kengligi (shrift o'lchamiga nisbatan)
function fitText(s, maxW, size) {
  const raw = String(cell(s));
  const maxChars = Math.max(1, Math.floor(maxW / (size * CHAR_W)));
  return raw.length > maxChars ? raw.slice(0, Math.max(1, maxChars - 2)) + ".." : raw;
}
function wrapText(s, maxW, size) {
  const words = String(cell(s)).split(/\s+/);
  const maxChars = Math.max(10, Math.floor(maxW / (size * CHAR_W)));
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars) {
      if (cur) lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}

export function toPdf(rep) {
  const W = 842, H = 595, M = 36; // A4 albom
  const pages = [];
  let ops = [];
  let y = H - M;
  const text = (x, yy, s, size = 9, bold = false) =>
    ops.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(1)} ${yy.toFixed(1)} Td (${pdfText(s)}) Tj ET`);
  const line = (x1, y1, x2, y2) => ops.push(`${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S`);
  const newPage = () => {
    pages.push(ops);
    ops = [];
    y = H - M;
  };

  text(M, y, rep.title, 15, true);
  y -= 22;
  for (const [k, v] of headerRows(rep).slice(1)) {
    const lines = wrapText(v, W - M * 2 - 120, 8.5);
    text(M, y, k + ":", 8.5, true);
    lines.forEach((ln, i) => text(M + 120, y - i * 11, ln, 8.5));
    y -= Math.max(1, lines.length) * 11 + 2;
  }
  y -= 8;

  const cols = rep.columns.length || 1;
  const usable = W - M * 2;
  const lens = rep.columns.map((c, i) =>
    Math.min(40, Math.max(String(c).length * 0.6, 4, ...rep.rows.slice(0, 100).map((r) => String(cell(r[i])).length))),
  );
  const total = lens.reduce((a, b) => a + b, 0) || cols;
  const widths = lens.map((l) => (l / total) * usable);
  const size = cols > 10 ? 7 : 8;
  const rowH = size + 6;

  const drawHeader = () => {
    ops.push("0.93 0.95 0.98 rg");
    ops.push(`${M} ${(y - rowH + 3).toFixed(1)} ${usable} ${rowH} re f`);
    ops.push("0 0 0 rg");
    let x = M;
    rep.columns.forEach((c, i) => {
      text(x + 2, y - size, fitText(c, widths[i] - 4, size), size, true);
      x += widths[i];
    });
    y -= rowH;
    ops.push("0.7 0.7 0.7 RG");
    line(M, y + 2, M + usable, y + 2);
  };
  drawHeader();
  if (!rep.rows.length) {
    text(M + 2, y - size - 2, "Ma'lumot yo'q (tanlangan davr va filtrlarda yozuv topilmadi)", size);
    y -= rowH;
  }
  for (const r of rep.rows) {
    if (y - rowH < M + 14) {
      newPage();
      drawHeader();
    }
    let x = M;
    r.forEach((v, i) => {
      const s = typeof v === "number" ? String(Math.round(v * 10) / 10) : v;
      text(x + 2, y - size, fitText(s, widths[i] - 4, size), size);
      x += widths[i];
    });
    y -= rowH;
    ops.push("0.88 0.88 0.88 RG");
    line(M, y + 2, M + usable, y + 2);
  }
  pages.push(ops);

  // ── PDF obyektlari ──
  const objs = [];
  const add = (s) => (objs.push(s), objs.length);
  const catalog = add(null);
  const pagesObj = add(null);
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids = [];
  pages.forEach((p, i) => {
    const footer = `BT /F1 7 Tf ${M} 18 Td (${pdfText(rep.title + " - " + (i + 1) + "/" + pages.length)}) Tj ET`;
    const content = Buffer.from([...p, footer].join("\n"), "latin1");
    const c = add({ stream: content });
    kids.push(
      add(
        `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`,
      ),
    );
  });
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => k + " 0 R").join(" ")}] /Count ${kids.length} >>`;

  const chunks = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1")];
  let len = chunks[0].length;
  const offsets = [];
  objs.forEach((o, i) => {
    offsets.push(len);
    let b;
    if (o && o.stream) {
      b = Buffer.concat([
        Buffer.from(`${i + 1} 0 obj\n<< /Length ${o.stream.length} >>\nstream\n`, "latin1"),
        o.stream,
        Buffer.from("\nendstream\nendobj\n", "latin1"),
      ]);
    } else b = Buffer.from(`${i + 1} 0 obj\n${o}\nendobj\n`, "latin1");
    chunks.push(b);
    len += b.length;
  });
  const xref =
    `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("") +
    `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${len}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(chunks);
}

export const MIME = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

export function render(rep, format) {
  if (format === "csv") return toCsv(rep);
  if (format === "xlsx") return toXlsx(rep);
  if (format === "pdf") return toPdf(rep);
  throw new Error("format");
}
