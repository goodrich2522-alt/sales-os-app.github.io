// lib/paymentImport.ts — นำเข้าไฟล์ "รายงานภาษีขาย ... -รับเงิน" (Excel จากระบบบัญชี) แล้วจับคู่กับดีลที่รอรับเงิน
//
// ไฟล์จริงมีหลายชีต ใช้เฉพาะชีตที่มีหัวคอลัมน์ "เลขที่เอกสาร" + "วันที่รับเงิน":
//   รายงานใบเสร็จรับเงิน (IV-) · รายงานใบแจ้งหนี้ (R-) · รายงานใบรับมัดจำ (AI-)
// หัวตารางอยู่ราวแถว 8 (ด้านบนเป็นชื่อ/ที่อยู่บริษัท) → หาตำแหน่งจาก "ชื่อหัวคอลัมน์" ไม่ใช่เลขแถว/คอลัมน์ตายตัว
//
// ⚠️ วันที่ในไฟล์มี 2 แบบ (เจอจริง 14 ก.ย. 2569):
//   "วันที่ออก"     = ข้อความ "01/07/2026"  (วว/ดด/ปปปป ค.ศ.)
//   "วันที่รับเงิน" = วันที่ของ Excel แต่ **ปีเป็น พ.ศ. 2569** (ค่า 244529 · แสดง "6/29/69")
//                    ต้องลบ 543 ปี ไม่งั้นวันรับเงินเพี้ยนไปอีก 543 ปี
//
// อ่านในเบราว์เซอร์ 100% ไฟล์ไม่ออกนอกเครื่อง (มีชื่อลูกค้า/ยอดเงิน)

import type { Sale } from "./types";

/** เอกสารรับเงิน 1 ใบ (รวมหลายแถวของเลขที่เอกสารเดียวกัน = ผ่อนหลายงวด) */
export interface PaymentDoc {
  docNo: string;
  sheet: string;
  kind: string;          // ประเภทงาน (งานขาย/งานเช่า/งานซ่อม)
  isDeposit: boolean;    // ใบรับมัดจำ — เงินมัดจำไม่ใช่รับเงินครบ จึงไม่ใช้เป็นวันรับเงิน
  status: string;
  customer: string;
  item: string;
  net: number;           // ยอดก่อน VAT
  total: number;         // ทั้งหมด (รวม VAT)
  paidDates: string[];   // ISO ค.ศ. เรียงเก่า→ใหม่ (ผ่อนหลายงวดมีหลายวัน)
  paidDate: string;      // วันที่รับเงินงวดล่าสุด = วันที่รับเงินครบ
  channel: string;
  staff: string;
  sns: string[];
}

export interface PaymentReadResult {
  docs: PaymentDoc[];
  sheetsUsed: string[];
  warnings: string[];
}

const clean = (v: unknown) => String(v ?? "").trim();
const key = (v: unknown) => clean(v).replace(/\s+/g, "");
const num = (v: unknown) => (typeof v === "number" ? v : Number(clean(v).replace(/[^\d.-]/g, "")) || 0);
const pad = (n: number) => String(n).padStart(2, "0");

/** ปี พ.ศ. (> 2400) → ค.ศ. · ปี 2 หลักถือเป็น พ.ศ. 25xx (ระบบบัญชีไทย) */
const toCE = (y: number) => (y < 100 ? y + 2500 - 543 : y > 2400 ? y - 543 : y);
const iso = (y: number, m: number, d: number) =>
  y && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${toCE(y)}-${pad(m)}-${pad(d)}` : "";

/**
 * แปลงวันที่ทุกรูปแบบในไฟล์ → ISO ค.ศ.
 * - ตัวเลข = วันที่ของ Excel (ปีอาจเป็น พ.ศ.)
 * - "01/07/2026" 4 หลัก = วว/ดด/ปปปป (แบบไทย)
 * - "6/29/69"   2 หลัก = ดด/วว/ปป (รูปแบบที่ Excel แสดง · ปี พ.ศ. 2 หลัก)
 * - "2569-07-01" = ปปปป-ดด-วว
 */
export function toIsoDate(v: unknown, parseSerial?: (n: number) => { y: number; m: number; d: number } | null): string {
  if (typeof v === "number" && v > 0) {
    const p = parseSerial?.(v);
    return p ? iso(p.y, p.m, p.d) : "";
  }
  const t = clean(v);
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return iso(+m[3], +m[2], +m[1]);            // วว/ดด/ปปปป
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (m) return iso(+m[3], +m[1], +m[2]);            // ดด/วว/ปป
  return "";
}

/** SN ในชื่อสินค้า — "SN : A,SN : B" หรือ "SN : A / EN : x" */
const snsFrom = (text: string) => {
  const out: string[] = [];
  for (const m of text.matchAll(/SN\s*[:：]\s*([A-Za-z0-9][A-Za-z0-9-]{4,})/g)) {
    const sn = m[1].toUpperCase();
    if (!out.includes(sn)) out.push(sn);
  }
  return out;
};

/** อ่านไฟล์ Excel รับเงิน (ทุกชีตที่มีคอลัมน์ วันที่รับเงิน) */
export async function readPaymentWorkbook(file: File): Promise<PaymentReadResult> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
  const parseSerial = (n: number) => {
    const d = XLSX.SSF.parse_date_code(n);
    return d ? { y: d.y, m: d.m, d: d.d } : null;
  };

  const byDoc = new Map<string, PaymentDoc>();
  const sheetsUsed: string[] = [];
  const warnings: string[] = [];

  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: "" }) as unknown[][];
    const hi = rows.findIndex((r) => r.some((c) => key(c) === "เลขที่เอกสาร"));
    if (hi < 0) continue;
    const H = rows[hi].map(key);
    const col = (...names: string[]) => H.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
    const c = {
      doc: col("เลขที่เอกสาร"), issue: col("วันที่ออก"), status: col("สถานะ"),
      cust: col("ชื่อลูกค้า"), item: col("ชื่อสินค้า/บริการ", "ชื่อสินค้า"),
      net: col("ยอดก่อนVAT"), total: col("ทั้งหมด"), paidDate: col("วันที่รับเงิน"),
      channel: col("ช่องทางการชำระเงิน"), kind: col("ประเภทงาน"), staff: col("เซลล์ดูแล"),
    };
    if (c.paidDate < 0) continue;                     // ชีตที่ไม่มีวันรับเงิน (เช่น สรุปยอดขาย) ข้าม
    sheetsUsed.push(name);
    const g = (r: unknown[], i: number) => (i >= 0 ? r[i] : "");

    for (const r of rows.slice(hi + 1)) {
      const docNo = clean(g(r, c.doc)).toUpperCase();
      if (!docNo || /^รวม|^ลำดับ/.test(docNo)) continue;
      const status = clean(g(r, c.status));
      if (/ยกเลิก/.test(status)) continue;
      const paid = toIsoDate(g(r, c.paidDate), parseSerial);
      const item = clean(g(r, c.item));
      const d = byDoc.get(docNo) ?? {
        docNo, sheet: name,
        kind: clean(g(r, c.kind)),
        isDeposit: /มัดจำ/.test(name) || /^AI-/.test(docNo),
        status, customer: clean(g(r, c.cust)), item,
        net: num(g(r, c.net)), total: num(g(r, c.total)),
        paidDates: [], paidDate: "",
        channel: clean(g(r, c.channel)), staff: clean(g(r, c.staff)),
        sns: snsFrom(item),
      };
      if (paid && !d.paidDates.includes(paid)) d.paidDates.push(paid);
      d.net = Math.max(d.net, num(g(r, c.net)));
      d.total = Math.max(d.total, num(g(r, c.total)));
      if (!d.sns.length) d.sns = snsFrom(item);
      if (!d.channel) d.channel = clean(g(r, c.channel));
      byDoc.set(docNo, d);
    }
  }

  const docs = [...byDoc.values()].map((d) => {
    const sorted = [...d.paidDates].sort();
    return { ...d, paidDates: sorted, paidDate: sorted[sorted.length - 1] ?? "" };
  });
  if (!sheetsUsed.length) warnings.push("ไม่พบชีตที่มีคอลัมน์ \"เลขที่เอกสาร\" และ \"วันที่รับเงิน\" — ใช่ไฟล์รายงานภาษีขาย-รับเงินหรือไม่?");
  return { docs, sheetsUsed, warnings };
}

// ───────────────────────── จับคู่กับดีล ─────────────────────────

export type MatchLevel = "สูง" | "กลาง" | "ต่ำ";
export interface PaymentMatch {
  sale: Sale;
  doc: PaymentDoc;
  level: MatchLevel;
  reason: string;
}
export interface MatchResult {
  matches: PaymentMatch[];
  unmatched: Sale[];
  skipped: { deposit: number; otherKind: number; noDate: number };
}

/** ชื่อลูกค้าเหลือแต่แก่น — ตัดคำนำหน้า/ประเภทนิติบุคคล/สาขา/ช่องว่าง */
export function normName(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/บริษัท|บจก\.?|จำกัด|มหาชน|ห้างหุ้นส่วนจำกัด|หจก\.?|ห้างหุ้นส่วน|ร้าน|สำนักงานใหญ่|สาขา\S*/g, "")
    .replace(/นางสาว|น\.ส\.|นาย|นาง|คุณ|co\.?,?|ltd\.?|limited|company/g, "")
    .replace(/[\s.,'"()-]/g, "");
}

const sameName = (a: string, b: string) => {
  const x = normName(a), y = normName(b);
  if (x.length < 3 || y.length < 3) return false;
  return x === y || (Math.min(x.length, y.length) >= 5 && (x.includes(y) || y.includes(x)));
};

/** ยอดใกล้กัน — เทียบทั้งยอดก่อน VAT และรวม VAT (หารตามจำนวนคันถ้าใบเดียวหลายคัน) · คลาด ≤ 1% หรือ 500 บาท */
const closeAmount = (sale: Sale, doc: PaymentDoc) => {
  const amt = Number(sale.actual_sale) || 0;
  if (!amt) return false;
  const share = Math.max(1, doc.sns.length);
  return [doc.net, doc.total, doc.net / share, doc.total / share]
    .filter((v) => v > 0)
    .some((v) => Math.abs(v - amt) <= Math.max(500, amt * 0.01));
};

const invoiceOf = (s: Sale) =>
  clean(s.custom_fields?.["เลขที่ใบกำกับภาษี"] || s.custom_fields?.["เลขที่เอกสาร"]).toUpperCase().replace(/\s+/g, "");

/**
 * จับคู่เอกสารรับเงินกับดีลที่รอรับเงิน — เรียงความมั่นใจ:
 *   สูง = เลขที่เอกสารตรง · หรือ SN ในใบตรงกับรถของดีล
 *   กลาง = ชื่อลูกค้าตรง + ยอดเงินใกล้กัน
 *   ต่ำ = ชื่อลูกค้าตรงอย่างเดียว (มีเอกสารเดียวที่เข้าข่าย)
 * ใช้เฉพาะเอกสาร "งานขาย" ที่มีวันรับเงิน · ข้ามใบรับมัดจำ (เงินมัดจำยังไม่ใช่รับเงินครบ)
 */
export function matchPayments(pending: Sale[], allDocs: PaymentDoc[]): MatchResult {
  const skipped = { deposit: 0, otherKind: 0, noDate: 0 };
  const docs = allDocs.filter((d) => {
    if (d.isDeposit) { skipped.deposit++; return false; }
    if (d.kind && d.kind !== "งานขาย") { skipped.otherKind++; return false; }
    if (!d.paidDate) { skipped.noDate++; return false; }
    return true;
  });

  const byDocNo = new Map(docs.map((d) => [d.docNo.replace(/\s+/g, ""), d]));
  const bySn = new Map<string, PaymentDoc>();
  docs.forEach((d) => d.sns.forEach((sn) => bySn.set(sn, d)));

  const matches: PaymentMatch[] = [];
  const unmatched: Sale[] = [];
  const usedWeak = new Set<string>();   // เอกสารที่จับคู่ด้วยชื่อแล้ว — ไม่ให้ดีลอื่นใช้ซ้ำ

  // รอบ 1: หลักฐานแน่น (เลขที่เอกสาร / SN)
  const rest: Sale[] = [];
  for (const s of pending) {
    const inv = invoiceOf(s);
    const sn = clean(s.forklift_unit_no).toUpperCase();
    if (inv && byDocNo.has(inv)) { matches.push({ sale: s, doc: byDocNo.get(inv)!, level: "สูง", reason: `เลขที่เอกสารตรง (${inv})` }); continue; }
    if (sn && bySn.has(sn)) { matches.push({ sale: s, doc: bySn.get(sn)!, level: "สูง", reason: `SN ในใบตรงกับรถ (${sn})` }); continue; }
    rest.push(s);
  }
  const strongDocs = new Set(matches.map((m) => m.doc.docNo));

  // รอบ 2: ชื่อ + ยอด → ชื่ออย่างเดียว (เฉพาะเอกสารที่ยังไม่ถูกจับด้วยหลักฐานแน่น)
  for (const s of rest) {
    const cands = docs.filter((d) => !strongDocs.has(d.docNo) && !usedWeak.has(d.docNo) && sameName(d.customer, s.customer_name));
    const withAmt = cands.filter((d) => closeAmount(s, d));
    if (withAmt.length) {
      // หลายใบเข้าข่าย → เลือกใบที่รับเงินหลังวันปิดการขายและใกล้ที่สุด
      const close = clean(s.delivery_date || s.created_at).slice(0, 10);
      const best = [...withAmt].sort((a, b) =>
        Math.abs(Date.parse(a.paidDate) - Date.parse(close || a.paidDate)) - Math.abs(Date.parse(b.paidDate) - Date.parse(close || b.paidDate)))[0];
      usedWeak.add(best.docNo);
      matches.push({ sale: s, doc: best, level: "กลาง", reason: "ชื่อลูกค้าตรง + ยอดเงินใกล้กัน" });
      continue;
    }
    if (cands.length === 1) {
      usedWeak.add(cands[0].docNo);
      matches.push({ sale: s, doc: cands[0], level: "ต่ำ", reason: "ชื่อลูกค้าตรง แต่ยอดเงินไม่ตรง — ตรวจก่อน" });
      continue;
    }
    unmatched.push(s);
  }

  return { matches, unmatched, skipped };
}
