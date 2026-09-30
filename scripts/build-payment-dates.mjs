// scripts/build-payment-dates.mjs — ทำรายการ "วันรับเงินที่ต้องลงในแอป" จากไฟล์ตรวจค่าคอม
//
// รัน: npx tsc lib/salesImport.ts --outDir tmp ... แล้ว node scripts/build-payment-dates.mjs
// (ต้องมี _si.mjs = lib/salesImport.ts ที่คอมไพล์แล้ว อยู่ในโฟลเดอร์โปรเจกต์)
// อ่านอย่างเดียว ไม่แตะฐานข้อมูล · ผลลัพธ์เป็นไฟล์ Excel ใน Downloads
//
// ที่มา: ไฟล์ผลตรวจสอบยอดชำระมี "วันที่รับเงินครบทุกงวด" ซึ่งรายงานภาษีขายรายเดือนไม่มี
// (เจอจริง IV-690729008 รายงานเดือนมีแค่ 27/07 แต่ของจริงผ่อนถึง 18/08 → งวดค่าคอมคือ ส.ค.)
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const X0 = await import("xlsx"); const XLSX = X0.default ?? X0;
const SI = await import("../_si.mjs");

const BASE = "D:/ai-agent/agents/ค่าคอม";
const clean = v => String(v ?? "").trim();
const pad = n => String(n).padStart(2, "0");
const toCE = y => (y < 100 ? y + 2500 - 543 : y > 2400 ? y - 543 : y);
/** "8/18/69" (ดด/วว/ปป พ.ศ.) · "18/08/2026" · "2026-08-18" → ISO ค.ศ. */
const toIso = s => {
  const t = clean(s); if (!t) return "";
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t); if (m) return `${toCE(+m[1])}-${pad(+m[2])}-${pad(+m[3])}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t); if (m) return `${toCE(+m[3])}-${pad(+m[2])}-${pad(+m[1])}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(t); if (m) return `${toCE(+m[3])}-${pad(+m[1])}-${pad(+m[2])}`;  // ดด/วว/ปป
  return "";
};

// ── 1) ดึงวันรับเงินทุกงวดจากไฟล์ตรวจค่าคอม (ชีต "รายละเอียดรายเอกสาร") ──
const pay = new Map();   // เลขที่เอกสาร → { dates[], last, month, staff, customer, base, comm }
for (const f of readdirSync(BASE).filter(n => /^ผลตรวจสอบยอดชำระ.*\.xlsx$/i.test(n) && !n.startsWith("~$"))) {
  const wb = XLSX.read(readFileSync(join(BASE, f)), { type: "buffer" });
  const sh = wb.SheetNames.find(n => n.includes("รายละเอียดรายเอกสาร"));
  if (!sh) continue;
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sh], { header: 1, raw: false, defval: "" });
  const hi = rows.findIndex(r => r.some(c => clean(c) === "เลขที่เอกสาร"));
  if (hi < 0) continue;
  const H = rows[hi].map(c => clean(c).replace(/\s+/g, ""));
  const col = (...names) => H.findIndex(h => names.some(n => h.startsWith(n)));
  const c = { doc: col("เลขที่เอกสาร"), paid: col("วันที่รับเงิน"), month: col("เดือนที่เงินเข้า"), staff: col("พนักงานขาย"), cust: col("ลูกค้า"), got: col("①รับเงิน"), comm: col("★ค่าคอมที่ได้") };
  for (let r = hi + 1; r < rows.length; r++) {
    const doc = clean(rows[r][c.doc]); if (!doc) continue;
    const dates = clean(rows[r][c.paid]).split(",").map(toIso).filter(Boolean).sort();
    if (!dates.length) continue;
    const prev = pay.get(doc);
    const merged = [...new Set([...(prev?.dates ?? []), ...dates])].sort();
    pay.set(doc, {
      dates: merged, last: merged[merged.length - 1],
      month: clean(rows[r][c.month]) || prev?.month || "",
      staff: clean(rows[r][c.staff]) || prev?.staff || "",
      customer: clean(rows[r][c.cust]) || prev?.customer || "",
      comm: clean(rows[r][c.comm]) || prev?.comm || "",
      src: f.includes("สิงหาคม") ? "ตรวจค่าคอม ส.ค." : "ตรวจค่าคอม ก.ค.",
    });
  }
}

// ── 2) เลขที่เอกสาร → SN (จากรายงานภาษีขายรายเดือน) ──
const snOf = new Map();
for (const dir of [join(BASE, "GOOD & RICH POWERPLUS 2569"), BASE]) {
  let names = [];
  try { names = readdirSync(dir).filter(n => /\.xlsx$/i.test(n) && !n.startsWith("~$") && /รายงาน/.test(n)); } catch { continue; }
  for (const n of names) {
    const wb = XLSX.read(readFileSync(join(dir, n)), { type: "buffer" });
    for (const s of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, raw: false, defval: "" });
      const hi = rows.findIndex(r => r.some(c => clean(c).replace(/\s+/g, "") === "เลขที่เอกสาร"));
      if (hi < 0) continue;
      const H = rows[hi].map(c => clean(c).replace(/\s+/g, ""));
      const cd = H.findIndex(h => h === "เลขที่เอกสาร"), ci = H.findIndex(h => h.startsWith("ชื่อสินค้า"));
      if (cd < 0 || ci < 0) continue;
      for (let r = hi + 1; r < rows.length; r++) {
        const doc = clean(rows[r][cd]); if (!doc) continue;
        const sns = SI.snsFrom(clean(rows[r][ci]));
        if (sns.length) snOf.set(doc, [...new Set([...(snOf.get(doc) ?? []), ...sns])]);
      }
    }
  }
}

// ── 3) เทียบกับรถในสต็อก ──
const stock = JSON.parse(readFileSync(process.env.TEMP + "/stock.json", "utf8"));
const k = v => clean(v).toUpperCase().replace(/\s+/g, "");
const bySn = new Map(); stock.forEach(f => { if (k(f.SN)) bySn.set(k(f.SN), f); });

const out = [];
for (const [doc, p] of pay) {
  const sns = snOf.get(doc) ?? [];
  if (!sns.length) { out.push({ doc, sn: "", ...p, inStock: "", model: "", note: "ไม่มี SN ในบิล (งานซ่อม/เช่า หรือบิลไม่ระบุ)" }); continue; }
  for (const sn of sns) {
    const f = bySn.get(k(sn));
    out.push({
      doc, sn, ...p,
      inStock: f ? "มี" : "ไม่มีรถคันนี้ในระบบ",
      model: f ? `${f.brand} ${f.model}` : "",
      note: p.dates.length > 1 ? `ผ่อน ${p.dates.length} งวด — ใช้งวดสุดท้าย` : "",
    });
  }
}
out.sort((a, b) => String(a.last).localeCompare(String(b.last)) || a.doc.localeCompare(b.doc));

const withSn = out.filter(o => o.sn);
console.log("เอกสารที่มีวันรับเงินในไฟล์ตรวจค่าคอม:", pay.size);
console.log("แตกเป็นรายคัน (มี SN):", withSn.length, "· ในนั้นมีรถในระบบ:", withSn.filter(o => o.inStock === "มี").length);
console.log("ผ่อนหลายงวด:", out.filter(o => o.dates.length > 1).length, "รายการ");
const byMonth = new Map(); withSn.forEach(o => byMonth.set(o.last.slice(0, 7), (byMonth.get(o.last.slice(0, 7)) ?? 0) + 1));
console.log("แยกตามเดือนที่เงินเข้า:", [...byMonth].sort().map(([m, n]) => m + "=" + n).join(" · "));

const ws = XLSX.utils.json_to_sheet(withSn.map(o => ({
  "SN (เลขตัวถัง)": o.sn, "รถ": o.model, "อยู่ในระบบ": o.inStock,
  "เลขที่บิล": o.doc, "ลูกค้า": o.customer, "เซลล์": o.staff,
  "★ วันรับเงินที่ต้องลง": o.last, "งวดค่าคอม": o.month || o.last.slice(0, 7),
  "วันรับเงินทุกงวด": o.dates.join(", "), "ค่าคอม": o.comm, "หมายเหตุ": o.note, "ที่มา": o.src,
})));
ws["!cols"] = [16, 26, 16, 16, 30, 18, 18, 12, 30, 10, 28, 16].map(wch => ({ wch }));
const wb2 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb2, ws, "วันรับเงินที่ต้องลง");
const OUT = "C:/Users/Ace/Downloads/วันรับเงินที่ต้องลงในแอป-2569-09-30.xlsx";
XLSX.writeFile(wb2, OUT);
console.log("\nไฟล์:", OUT);
console.log("\n--- ตัวอย่างที่ผ่อนข้ามเดือน (งวดค่าคอมเปลี่ยน) ---");
out.filter(o => o.sn && o.dates.length > 1 && o.dates[0].slice(0, 7) !== o.last.slice(0, 7))
  .slice(0, 12).forEach(o => console.log("   " + o.sn + " | " + o.doc + " | " + o.dates.join(", ") + " → งวด " + o.last.slice(0, 7) + " | " + o.staff));
