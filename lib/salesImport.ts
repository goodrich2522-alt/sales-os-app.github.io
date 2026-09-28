// lib/salesImport.ts — อ่าน "รายงานภาษีขายรายเดือน / บิลเงินสด" เพื่อเติมใบขายย้อนหลัง
//
// ที่มา (25 ก.ย. 2569): รถหลายร้อยคันมีสถานะ "ปิดการขายแล้ว" แต่ไม่มีใบขายผูกอยู่
// (ยกประวัติเก่าเข้ามาแต่ตัวรถ หรือตั้งสถานะที่หน้าสต็อกโดยไม่เปิดดีล)
// → ไม่มีชื่อเซลล์/ลูกค้า ยอดขายและค่าคอมไม่ถูกนับ  เปิดดีลย้อนหลังทีละคันไม่ไหว
//
// ไฟล์ที่อ่านได้ (.xlsx จากระบบบัญชี):
//   ชีต "รายงานใบเสร็จรับเงิน" · "รายงานใบแจ้งหนี้" · "บิลเงินสด"
//
// หลักการ 3 ข้อ:
//   1. หาตำแหน่งคอลัมน์จาก "ชื่อหัวคอลัมน์" ไม่ใช่เลขคอลัมน์ตายตัว
//      (ไฟล์บางเดือนมีคอลัมน์เกินมา ตำแหน่งเลื่อนจากเดือนอื่น)
//   2. เอกสารใบเดียวมีได้หลายแถว (ผ่อนหลายงวด) → รวมเป็นใบเดียวด้วยเลขที่เอกสาร
//   3. จับคู่รถด้วย SN ที่เขียนอยู่ในช่องชื่อสินค้า ("HANGCHA CBD20-WS SN : M1BES02519")
//      ไม่เดาจากรุ่น/ราคา — ไม่เจอ SN ก็ไม่เดา ยกไปให้คนตรวจเอง

/** เอกสารขาย 1 ใบที่อ่านได้จากไฟล์ */
export interface InvoiceDoc {
  doc: string;          // เลขที่เอกสาร (IV-690107008)
  date: string;         // วันที่ออก (ISO ค.ศ.)
  customer: string;
  item: string;         // ข้อความรายการสินค้าเต็ม
  net: number;          // ยอดก่อน VAT
  total: number;        // ยอดรวม VAT
  kind: string;         // ประเภทงาน (งานขาย / งานเช่า / งานซ่อม)
  docStatus: string;    // สถานะเอกสาร (รับชำระแล้ว / ยกเลิก / ร่าง)
  staff: string;        // เซลล์ดูแล
  sns: string[];        // SN ที่พบในรายการ
  sheet: string;
  source: string;       // ชื่อไฟล์
}

const t = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => Number(t(v).replace(/[^\d.-]/g, "")) || 0;

/** ชีตที่ถือว่าเป็นเอกสารขาย */
export const SALES_SHEETS = ["รายงานใบเสร็จรับเงิน", "รายงานใบแจ้งหนี้", "บิลเงินสด"];
/** ประเภทงานที่นับเป็น "ขายรถ" — งานเช่า/งานซ่อมไม่ใช่การขาย */
export const SALE_KINDS = ["งานขาย"];
/** สถานะเอกสารที่ไม่นับเป็นการขายจริง */
export const DEAD_DOC_STATUS = ["ยกเลิก", "ร่าง"];
export const isLiveDoc = (d: InvoiceDoc) => !DEAD_DOC_STATUS.includes(t(d.docStatus));

/**
 * เลขที่เอกสารบอกปี/เดือนไว้ในตัว — IV-690107008 = ปี 69 เดือน 01 วันที่ 07 · CH6901-001 = ปี 69 เดือน 01
 * ใช้เป็น "ตัวเทียบ" ตอนวันที่ในช่องกำกวม (1/6/69 อ่านได้ทั้ง 6 ม.ค. และ 1 มิ.ย.)
 */
export function docHint(doc: unknown): { year?: number; month?: number } {
  const m = /^[A-Z]{2}-?(\d{2})(\d{2})/i.exec(t(doc));
  if (!m) return {};
  const mo = +m[2];
  return { year: 2500 + +m[1] - 543, month: mo >= 1 && mo <= 12 ? mo : undefined };
}

/**
 * วันที่ในไฟล์มีหลายแบบ: 2569-04-01 (พ.ศ.) · 01/04/2026 · 1/6/69 (เดือน/วัน/ปี พ.ศ. 2 หลัก)
 * แบบ 2 หลักกำกวม (1/6/69 = 6 ม.ค. หรือ 1 มิ.ย. ?) → **ตัดสินด้วยเดือนในเลขที่เอกสาร**
 * ตัดสินไม่ได้ก็คืนค่าว่าง ไม่เดา — วันที่ผิดจะลากไปผิดทั้งวันเริ่มประกันและงวดค่าคอม
 */
export function invoiceDate(v: unknown, doc?: unknown): string {
  const s = t(v);
  const be = (y: number) => (y >= 2400 ? y - 543 : y);
  const pad = (n: number) => String(n).padStart(2, "0");
  const ok = (y: number, mo: number, d: number) => mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(mo)}-${pad(d)}` : "";
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return ok(be(+m[1]), +m[2], +m[3]);
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(s);          // 01/04/2026 · 18/09/2569 → วัน/เดือน/ปี
  if (m) return ok(be(+m[3]), +m[2], +m[1]);
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/.exec(s);          // 1/6/69 — ลำดับไม่แน่นอน
  if (m) {
    const [a, b] = [+m[1], +m[2]];
    const y = be(2500 + +m[3]);
    const hint = docHint(doc).month;
    if (hint && a === hint && b !== hint) return ok(y, a, b);   // เดือนตรงกับเลขที่เอกสาร → เดือน/วัน
    if (hint && b === hint && a !== hint) return ok(y, b, a);   // ตรงกันอีกทาง → วัน/เดือน
    if (hint && a === hint && b === hint) return ok(y, a, b);   // เท่ากันทั้งคู่ ลำดับไหนก็ได้
    if (a > 12) return ok(y, b, a);
    if (b > 12) return ok(y, a, b);
    return "";                                                  // กำกวมจริง → ไม่เดา
  }
  return "";
}

/** ดึง SN ทุกตัวจากข้อความชื่อสินค้า — รองรับ "SN : A,SN : B" และ "SN : A / EN : x" */
export function snsFrom(text: unknown): string[] {
  const out: string[] = [];
  for (const m of t(text).matchAll(/SN\s*[:：]\s*([A-Za-z0-9][A-Za-z0-9-]{4,})/g)) {
    const sn = m[1].toUpperCase();
    if (!out.includes(sn)) out.push(sn);
  }
  return out;
}

interface Layout { head: number; doc: number; date: number; cust: number; item: number; net: number; total: number; kind: number; staff: number; docStatus: number; }

/** หาแถวหัวตาราง + ตำแหน่งคอลัมน์จากชื่อหัวคอลัมน์ (คืน null ถ้าไม่ใช่ชีตเอกสารขาย) */
function findLayout(rows: string[][]): Layout | null {
  for (let r = 0; r < Math.min(12, rows.length); r++) {
    const h = (rows[r] ?? []).map(c => t(c).replace(/\s+/g, ""));
    const find = (...names: string[]) => h.findIndex(x => names.includes(x));
    const doc = find("เลขที่เอกสาร", "เลขที่");
    if (doc < 0) continue;
    return {
      head: r, doc,
      date:  find("วันที่ออก", "วันที่"),
      cust:  find("ชื่อลูกค้า", "บจก."),
      item:  find("ชื่อสินค้า/บริการ", "รายการ"),
      net:   find("ยอดก่อนVAT", "จำนวนเงิน"),
      total: find("ทั้งหมด", "จำนวนเงิน"),
      kind:  find("ประเภทงาน"),
      staff: find("เซลล์ดูแล", "เซลล์"),
      // ⚠️ ใบที่ "ยกเลิก" หรือยังเป็น "ร่าง" ไม่ใช่การขายจริง — ต้องไม่นำเข้า
      docStatus: find("สถานะ"),
    };
  }
  return null;
}

/** อ่าน 1 ชีตเป็นรายการเอกสาร (รวมงวดผ่อนของใบเดียวกันแล้ว) */
export function parseInvoiceSheet(rows: string[][], sheet: string, source: string): InvoiceDoc[] {
  const L = findLayout(rows);
  if (!L) return [];
  const docs = new Map<string, InvoiceDoc>();
  for (let r = L.head + 1; r < rows.length; r++) {
    const g = (i: number) => (i >= 0 ? t(rows[r]?.[i]) : "");
    const doc = g(L.doc);
    if (!doc || /^ลำดับ|^รวม/.test(doc)) continue;
    const item = g(L.item);
    const sns = snsFrom(item);
    const rec = docs.get(doc) ?? {
      doc, date: invoiceDate(g(L.date), doc), customer: g(L.cust), item,
      net: num(g(L.net)), total: num(g(L.total)),
      kind: g(L.kind), staff: g(L.staff), docStatus: g(L.docStatus), sns, sheet, source,
    };
    // แถวซ้ำ = งวดผ่อนชำระ → เก็บยอดสูงสุด และเติมช่องที่ยังว่าง
    rec.net = Math.max(rec.net, num(g(L.net)));
    rec.total = Math.max(rec.total, num(g(L.total)));
    if (!rec.customer) rec.customer = g(L.cust);
    if (!rec.staff) rec.staff = g(L.staff);
    if (!rec.docStatus) rec.docStatus = g(L.docStatus);
    if (!rec.date) rec.date = invoiceDate(g(L.date), doc);
    if (!rec.sns.length && sns.length) rec.sns = sns;
    docs.set(doc, rec);
  }
  return [...docs.values()];
}

/** อ่านทั้งไฟล์ (ทุกชีตที่เป็นเอกสารขาย) */
export async function readInvoiceFile(file: File): Promise<InvoiceDoc[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const out: InvoiceDoc[] = [];
  for (const name of wb.SheetNames) {
    if (!SALES_SHEETS.includes(name.trim())) continue;
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as string[][];
    out.push(...parseInvoiceSheet(rows, name.trim(), file.name));
  }
  return out;
}

// ── SN ในบิลพิมพ์ผิดแบบ "ตัวที่สับสนกันบ่อย" ────────────────────────────────
//
// (28 ก.ย. 2569) เจอจริง: บิล IV-690822001 เขียน 08015JVE795 แต่ SN จริงคือ 08015JVF795
// ต่างกันแค่ E กับ F — รถคันนั้นเลยค้างเป็น "พร้อมขาย" ทั้งที่ขายและเก็บเงินไปแล้ว
//
// ⚠️ ห้ามจับคู่ด้วย "ต่างกัน 1 ตัว" เฉย ๆ — SN ในล็อตเดียวกันเรียงเลขติดกันอยู่แล้ว
//    (08015JVF776 กับ 08015JVF777 คือคนละคันจริง) เดาแล้วผูกผิดคันแก้ยากกว่าปล่อยไว้
//    จึงยอมรับเฉพาะตัวอักษรที่สับสนกันบ่อย และต้องไม่ใช่ตำแหน่งเลขลำดับท้าย

/** คู่ตัวอักษร/ตัวเลขที่อ่านสลับกันบ่อย (พิมพ์มือหรือ OCR) */
const CONFUSABLE: string[][] = [["0", "O"], ["1", "I"], ["5", "S"], ["8", "B"], ["2", "Z"], ["6", "G"], ["E", "F"], ["U", "V"]];
const confusablePair = (a: string, b: string) => CONFUSABLE.some(p => p.includes(a) && p.includes(b));
/** ตำแหน่งท้าย ๆ ที่เป็นตัวเลขล้วน = "เลขลำดับในล็อต" (08015JVF776 กับ 777 คือคนละคัน)
 *  ต่างกันตรงนั้นห้ามถือว่าพิมพ์ผิด แม้จะเป็นคู่ที่สับสนกันบ่อยก็ตาม */
const SEQ_TAIL = 2;

/**
 * หารถที่ SN "น่าจะเป็นคันเดียวกัน" กับที่เขียนในบิล
 * เงื่อนไขครบทุกข้อเท่านั้น: ความยาวเท่ากัน · ต่างกันไม่เกิน 1 ตำแหน่ง ·
 * ตำแหน่งที่ต่างต้องเป็นคู่ที่สับสนกันบ่อย · และต้องอยู่ใน "หัว" ไม่ใช่เลขลำดับท้าย
 */
export function snNearMatch<T extends { SN?: string; model?: string }>(
  billSn: string, fleet: T[],
): T | undefined {
  const a = String(billSn ?? "").trim().toUpperCase();
  if (a.length < 6) return undefined;
  const hits = fleet.filter(f => {
    const b = String(f.SN ?? "").trim().toUpperCase();
    if (b.length !== a.length) return false;
    let at = -1;
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      if (at >= 0) return false;                 // ต่างกันเกิน 1 ตำแหน่ง
      at = i;
    }
    if (at < 0) return false;                    // เหมือนกันเป๊ะ (จับคู่ปกติไปแล้ว)
    // ต่างกันที่ตัวเลข 2 ตัวท้าย = เลขลำดับในล็อต → คนละคัน ไม่ใช่พิมพ์ผิด
    if (at >= a.length - SEQ_TAIL && /\d/.test(a[at]) && /\d/.test(b[at])) return false;
    return confusablePair(a[at], b[at]);
  });
  return hits.length === 1 ? hits[0] : undefined; // เจอหลายคัน = ไม่ชัด ไม่เดา
}
