// scripts/build-payment-sql.mjs — สร้างคำสั่ง SQL เติม "วันรับเงิน" ให้ใบขายในแอป
//
// ที่มา (30 ก.ย. 2569): ไฟล์ SQL เดิม (เติมวันรับเงิน-ทั้งหมด.sql) จับคู่ด้วยรหัสดีลรูปแบบ
// 'sale_IV-xxx_%' ซึ่งไม่ตรงกับดีลที่นำเข้าใหม่ (รูปแบบ 'sale_bf_IV-xxx_') → ข้ามไปเงียบ ๆ
// ตัวนี้จับคู่ 3 ทางในคำสั่งเดียว จึงครอบคลุมทุกรูปแบบรหัส:
//   1) เลขที่บิลที่เก็บไว้ใน custom_fields->>'เลขที่เอกสาร'  (ดีลที่นำเข้าจากบิล)
//   2) เลขที่บิลที่ฝังอยู่ในรหัสดีล                          (ดีลนำเข้าชุดเก่า)
//   3) เลขตัวถัง (SN)                                        (ดีลที่เซลล์เปิดเอง)
//
// ความปลอดภัย: ทุกคำสั่งมี payment_received_date is null → ไม่ทับของที่กรอกไว้แล้ว รันซ้ำได้
//
// รัน: node scripts/build-payment-sql.mjs   (อ่านไฟล์ Excel ที่ build-payment-dates.mjs สร้างไว้)
import { readFileSync, writeFileSync } from "node:fs";
const X0 = await import("xlsx"); const XLSX = X0.default ?? X0;

const SRC = process.argv[2] || "C:/Users/Ace/Downloads/วันรับเงินที่ต้องลงในแอป-2569-09-30.xlsx";
const OUT = process.argv[3] || "C:/Users/Ace/Downloads/เติมวันรับเงิน-2569-09-30.sql";

const wb = XLSX.read(readFileSync(SRC), { type: "buffer" });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
const q = s => String(s ?? "").replace(/'/g, "''");

// SN ที่โผล่ในหลายบิล = อาจเป็นรถที่ขาย-คืน-ขายใหม่ → จับคู่ด้วย SN อาจไปโดนใบเก่า ต้องดูเอง
const seen = new Map();
rows.forEach(r => { const s = String(r["SN (เลขตัวถัง)"]).trim(); if (s) seen.set(s, (seen.get(s) ?? 0) + 1); });
const dup = [...seen].filter(([, n]) => n > 1).map(([s]) => s);

const ok = rows.filter(r => r["อยู่ในระบบ"] === "มี" && String(r["★ วันรับเงินที่ต้องลง"]).trim());
const skip = rows.filter(r => r["อยู่ในระบบ"] !== "มี");

const L = [];
L.push("-- =====================================================================");
L.push("-- เติม \"วันที่รับเงิน\" ให้ตาราง sales — สร้างจากไฟล์ตรวจค่าคอม");
L.push(`-- สร้างเมื่อ ${new Date().toISOString().slice(0, 10)} · ${ok.length} คำสั่ง`);
L.push("--");
L.push("-- ยึด \"งวดสุดท้ายที่ชำระ\" เป็นวันรับเงิน (ตรงกับกติกาจ่ายค่าคอมเมื่อเก็บเงินครบ)");
L.push("-- ทุกคำสั่งมี payment_received_date is null → ไม่ทับของที่กรอกไว้แล้ว รันซ้ำได้");
L.push("--");
L.push("-- ⚠️ ก่อนรันจริง แนะนำรันบรรทัด SELECT ข้างล่างก่อน เพื่อดูว่าจะกระทบกี่แถว");
L.push("-- =====================================================================");
L.push("");
L.push("-- ตรวจก่อนรัน: นับแถวที่จะถูกแก้ (ควรได้ใกล้เคียง " + ok.length + ")");
L.push("-- select count(*) from sales where payment_received_date is null and (");
L.push("--   custom_fields->>'เลขที่เอกสาร' in (" + [...new Set(ok.map(r => `'${q(r["เลขที่บิล"])}'`))].join(", ") + ")");
L.push("-- );");
L.push("");

if (dup.length) {
  L.push("-- ⚠️ เลขตัวถังที่โผล่ในหลายบิล (อาจเป็นรถที่ขาย-คืน-ขายใหม่) — ตรวจเองก่อน:");
  dup.forEach(s => L.push("--   " + s));
  L.push("");
}

let n = 0;
for (const r of ok) {
  const sn = q(String(r["SN (เลขตัวถัง)"]).trim());
  const doc = q(String(r["เลขที่บิล"]).trim());
  const date = String(r["★ วันรับเงินที่ต้องลง"]).trim();
  const note = [r["เซลล์"], r["ลูกค้า"], r["หมายเหตุ"]].filter(Boolean).join(" · ");
  n++;
  L.push(`-- ${n}. ${sn} · ${doc} · ${note}`);
  L.push(
    `update sales set payment_received_date='${date}' where payment_received_date is null` +
    // กันไปโดนดีลที่ไม่ควรมีงวดค่าคอม: ของที่ลูกค้าคืน และบิลที่เปิดให้ไฟแนนซ์
    ` and coalesce(sale_status,'') <> 'คืนสินค้า' and coalesce(custom_fields->>'ประเภทบิล','') <> 'เปิดบิลไฟแนนซ์' and (` +
    `custom_fields->>'เลขที่เอกสาร'='${doc}' or id like '%${doc}%'` +
    (dup.includes(String(r["SN (เลขตัวถัง)"]).trim()) ? "" : ` or upper(forklift_unit_no)=upper('${sn}')`) +
    `);`);
}

L.push("");
L.push(`-- ── ยังลงไม่ได้ ${skip.length} รายการ: ไม่มีรถคันนั้นในระบบ (ต้องบันทึกรถเข้าสต็อกก่อน) ──`);
skip.forEach(r => L.push(`--   ${r["SN (เลขตัวถัง)"]} · ${r["เลขที่บิล"]} · ${r["ลูกค้า"]} · ควรลง ${r["★ วันรับเงินที่ต้องลง"]}`));

writeFileSync(OUT, L.join("\n") + "\n", "utf8");
console.log("คำสั่งที่สร้าง:", n, "· ข้ามเพราะไม่มีรถในระบบ:", skip.length);
if (dup.length) console.log("เลขตัวถังซ้ำหลายบิล (ตัดการจับคู่ด้วย SN ออกให้แล้ว):", dup.join(", "));
console.log("ไฟล์:", OUT);
