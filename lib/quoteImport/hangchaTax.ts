// lib/quoteImport/hangchaTax.ts — อ่าน "ใบกำกับภาษี / Tax Invoice" ของ HANGCHA (ไทยแลนด์)
//
// คนละชนิดกับใบ PI (hangcha.ts) — ใบกำกับคือเอกสารที่ **ยืนยันของที่ส่งจริง**
// จึงมีข้อมูลที่ใบ PI ไม่มี: SN จริง · วันส่งรถ · เลขที่ใบกำกับ · ราคาที่จ่ายจริง
//
// โครงเอกสาร (ตาราง 6 คอลัมน์):
//   ลำดับ | รุ่นสินค้า | รายการ (สเปก + "S/N : a , b , c" + "ส่งรถวันที่ dd.mm.yyyy") | จำนวน | ราคาต่อหน่วย | จำนวนเงิน
//   หัวใบ: "ใบสั่งซื้อ/Order No." = เลข PI · "เลขที่/Invoice No." = เลขใบกำกับ
//
// ⚠️ ใบกำกับมักเป็นไฟล์สแกน → มาทาง OCR (pdfOcr.ts) ซึ่งอ่าน SN ผิดได้
//    ทุกแถวจึงติดธงให้คนตรวจ SN กับตัวรถเสมอ (เคยเจอจริง M1BFS00963 → M1BFS009633)

import { ParsedVehicle, QuoteParseResult, QuoteDocCheck } from "./types";

// รุ่น HANGCHA (ชุดเดียวกับใบ PI)
const MODEL_G = /\b((?:CPCD|CPD|CBD|CDD|CQD|CBS|XF)\d{1,3}[A-Z0-9-]*)/gi;
// SN 2 ตระกูล: ขึ้นต้นอักษร (M1BFS02022) · ขึ้นต้นตัวเลข (83BF10978)
const SN_SHAPE = /^(?:[A-Z]{1,2}\d[A-Z]{2,4}\d{3,7}|\d{2}[A-Z]{2}\d{4,6})$/i;
// "S/N : M1BFS02054 , M1BFS00963, M1BFS02060" (OCR อาจได้ S / N หรือ SN)
const SN_LABEL_G = /S\s*\/?\s*N\s*[:：]?\s*((?:[A-Z0-9]{6,}\s*[,，]?\s*)+)/gi;
// "ส่งรถวันที่ 23.05.2026"
const DELIVER_RE = /ส่งรถวันที่\s*(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/;
// ท้ายแถว "<จำนวน> <ราคาต่อหน่วย> <จำนวนเงิน>" เช่น "3 25,000.00 75,000.00"
const QTY_PRICE_G = /(\d{1,3})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/g;

const num = (s: string | undefined) => (s ? Number(String(s).replace(/,/g, "")) || undefined : undefined);

/** ใบนี้เป็นใบกำกับภาษีหรือไม่ (ไม่ใช่ใบ PI) */
export function isTaxInvoice(text: string): boolean {
  return /ใบกำกับภาษี|Tax\s*Invoice/i.test(text) && !/Proforma\s*Invoice|Sales\s*Contract/i.test(text);
}

/** วันที่ dd.mm.yyyy → ISO · รองรับปี พ.ศ. (>2400) แปลงเป็น ค.ศ. ให้ */
function toIso(d: string, m: string, y: string): string | undefined {
  let year = Number(y);
  if (year > 2400) year -= 543;
  const mm = Number(m), dd = Number(d);
  if (!year || mm < 1 || mm > 12 || dd < 1 || dd > 31) return undefined;
  return `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

export function parseHangchaTax(rawText: string): QuoteParseResult {
  const text = rawText.replace(/\s+/g, " ").trim();

  // เลข PI = "ใบสั่งซื้อ/Order No." · สำรอง: หา HCTH-xxx ที่ไหนก็ได้ในใบ
  // เลข order ของ HANGCHA ขึ้นต้น HCTH เสมอ — หาตรงๆ ก่อน แล้วค่อยพึ่งป้ายกำกับ
  // (ป้าย "ใบสั่งซื้อ/Order No." มีคำคั่น ทำให้ regex จับคำว่า "Order" มาแทนเลขจริง)
  const pi_no = text.match(/\b(HCTH[-\w]+)\b/i)?.[1]
    ?? text.match(/(?:Order\s*No|ใบสั่งซื้อ)[^A-Z0-9]{0,30}([A-Z]{2,}[-\w]*[0-9][-\w]*)/i)?.[1];
  // เลขที่ใบกำกับ เช่น TR202605-109
  const invoice_no = text.match(/(?:Invoice\s*No)[^A-Z0-9]{0,25}([A-Z]{1,3}\d{4,8}-\d{1,4})/i)?.[1]
    ?? text.match(/\b([A-Z]{2}\d{6}-\d{1,4})\b/)?.[1];

  // ── ตัดเป็นบล็อกละรายการ: เริ่มที่ชื่อรุ่นแต่ละครั้งที่เจอ (ใบกำกับ 1 แถว = 1 รุ่น) ──
  const hits = [...text.matchAll(MODEL_G)];
  const blocks = hits.map((h, i) => ({
    model: h[1].toUpperCase(),
    seg: text.slice(h.index ?? 0, i + 1 < hits.length ? (hits[i + 1].index ?? text.length) : text.length),
  }));

  const vehicles: ParsedVehicle[] = [];
  const byModel: QuoteDocCheck["byModel"] = [];

  for (const b of blocks) {
    // SN ในแถวนี้
    const sns: string[] = [];
    for (const m of b.seg.matchAll(SN_LABEL_G))
      for (const t of m[1].split(/[,，\s]+/)) {
        const s = t.trim().toUpperCase();
        if (SN_SHAPE.test(s)) sns.push(s);
      }

    // จำนวน/ราคา: เลือกชุดที่ จำนวน × ราคาต่อหน่วย = จำนวนเงิน (กันจับเลขมั่ว)
    let qty: number | undefined, unit: number | undefined;
    for (const m of b.seg.matchAll(QTY_PRICE_G)) {
      const q = Number(m[1]), u = num(m[2]), amt = num(m[3]);
      if (q && u && amt && Math.abs(q * u - amt) < 1) { qty = q; unit = u; break; }
    }
    // ไม่มีชุดที่คูณลงตัว → ใช้จำนวน SN ที่อ่านได้ (ราคาปล่อยว่างให้คนกรอก)
    const count = qty ?? (sns.length || 0);
    if (!count) continue;                      // บล็อกที่ไม่มีทั้งจำนวนและ SN = ไม่ใช่แถวสินค้า

    const dm = b.seg.match(DELIVER_RE);
    const received_date = dm ? toIso(dm[1], dm[2], dm[3]) : undefined;

    const capNum = b.model.match(/\d{1,3}/)?.[0];
    const capacity = capNum ? `${(Number(capNum) / 10).toFixed(1)} ตัน` : undefined;
    const fuel = /diesel|ดีเซล/i.test(b.seg) || /^CPCD/i.test(b.model) ? "ดีเซล"
      : /electric|li-?ion|lithium|battery/i.test(b.seg) || /^C[BPQD]|^XF/i.test(b.model) ? "ไฟฟ้า" : undefined;
    const fork_length = b.seg.match(/Fork length\s*(\d{3,4})\s*(?:x\s*\d{3,4}\s*)?mm/i)?.[1];

    const build = (sn?: string): ParsedVehicle => {
      const flags = ["จากใบกำกับภาษี — ตรวจ SN กับตัวรถอีกครั้ง"];   // OCR อ่าน SN ผิดได้
      if (!sn) flags.push("ไม่พบ SN");
      if (!unit) flags.push("ไม่พบราคาทุน");
      if (sns.length && qty && sns.length !== qty) flags.push(`ใบระบุ ${qty} คัน แต่พบ SN ${sns.length} ตัว`);
      return {
        brand: "HANGCHA", model: b.model, SN: sn, capacity, fuel, fork_length,
        cost_price: unit, pi_no, invoice_no, received_date, vendor: "HANGCHA", flags,
      };
    };

    if (sns.length) sns.forEach((sn) => vehicles.push(build(sn)));
    else for (let k = 0; k < count; k++) vehicles.push(build(undefined));

    byModel.push({ model: b.model, qty: qty ?? count, subtotal: unit && qty ? unit * qty : undefined });
  }

  // ยอดรวมท้ายใบ (จำนวนเงินรวมทั้งสิ้น / Net Amount) — ไว้เทียบตอนตรวจทาน
  const net = num(text.match(/(?:Net\s*Amount|รวมทั้งสิ้น)[^\d]{0,30}([\d,]+\.\d{2})/i)?.[1]);

  return {
    vendor: "HANGCHA", doc_kind: "tax-invoice", pi_no, invoice_no, vehicles, rawText,
    docCheck: { totalQty: byModel.reduce((n, b) => n + b.qty, 0) || undefined, totalAmount: net, byModel },
  };
}
