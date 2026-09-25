// lib/quoteImport/heliTax.ts — อ่านใบกำกับภาษี HELI (ORIGINAL RECEIPT/TAX INVOICE)
//
// ต่างจากใบ Sales Contract (heli.ts) ตรงที่ใบนี้คือ "ของที่ส่งจริง + เรียกเงินจริง"
// จึงมี SN ครบทุกคันเสมอ และราคาที่โชว์คือราคาที่เรียกเก็บจริง
//
// รูปแบบตาราง: MODEL | SERIAL NUMBER | DESCRIPTION | QTY | UNIT | UNIT PRICE | TOTAL AMOUNT
//   CPCD30-Q22K2  010303S9994  K2 3t Diesel ,QC490(high fan),G II  1  Unit  240,000.00  240,000.00
// หัวใบ: Invoice No. · Date · Remark = เลขสัญญา (C20726201-080 → PI080)
//
// ⚠️ ใบนี้มักเป็น "ไฟล์สแกน" (ไม่มี text layer) → แอป OCR ให้ก่อนแล้วค่อยส่งข้อความเข้ามาที่นี่
//    ข้อความจาก OCR จึงเพี้ยนได้ ตัวอ่านนี้เลยยึด "ตัวเลขที่คูณกลับแล้วตรง" เป็นหลัก ไม่ยึดตำแหน่งคอลัมน์

import { ParsedVehicle, QuoteParseResult, QuoteDocCheck } from "./types";
import { modelRe, capacityFromModel } from "./models";

/** ใบนี้ใช่ใบกำกับภาษี HELI ไหม (เผื่อ OCR อ่านบางคำเพี้ยน จึงดูหลายสัญญาณ) */
export function isHeliTax(text: string): boolean {
  const t = text.replace(/\s+/g, " ");
  const heli = /HELI\s*SOUTHEAST|HELI\b/i.test(t);
  const taxDoc = /TAX\s*INVOICE|RECEIPT\/TAX|ORIGINAL\s*RECEIPT/i.test(t);
  const hasInvoiceNo = /Invoice\s*No/i.test(t);
  return heli && (taxDoc || hasInvoiceNo) && /C\d{6,9}-\d{2,3}/i.test(t) === true;
}

const num = (s?: string) => {
  const n = Number(String(s ?? "").replace(/,/g, ""));
  return isNaN(n) ? undefined : n;
};

// SN HELI: 6ตัวเลข+1อักษร+4ตัวเลข (010303S9994) · 5ตัวเลข+2-3อักษร+3-4ตัวเลข (05015DU6326)
const SN_RE = /\b(\d{4,6}[A-Z]{1,3}\d{3,4})\b/i;
// จำนวนเงินรูปแบบ 240,000.00
const MONEY_RE = /\b([\d,]{3,}\.\d{2})\b/g;

/** พลังงานจากคำบรรยายในใบ (Diesel / LIB = Lithium Battery) */
function fuelOf(s: string): string | undefined {
  if (/diesel/i.test(s)) return "ดีเซล";
  if (/\b(lpg|gas)\b/i.test(s)) return "แก๊ส";
  if (/\bLIB\b|lithium|electric|battery/i.test(s)) return "ไฟฟ้า";
  return undefined;
}

export function parseHeliTax(rawText: string): QuoteParseResult {
  const lines = rawText.split(/\r?\n/);
  const flat = rawText.replace(/\s+/g, " ").trim();

  const invoiceNo = flat.match(/Invoice\s*No\.?\s*:?\s*([A-Z0-9-]{4,})/i)?.[1];
  // Remark = เลขสัญญาของ HELI (C20726201-080) → เลข PI ที่ใช้ในแอปคือ PI080
  const importRef = flat.match(/\b(C\d{6,9}-\d{2,3}[A-Z]{0,3})\b/i)?.[1];
  const piNo = importRef ? "PI" + importRef.replace(/^C\d{6,9}-/i, "") : undefined;
  const date = flat.match(/Date\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1];

  const vehicles: ParsedVehicle[] = [];
  const byModel: QuoteDocCheck["byModel"] = [];

  for (const line of lines) {
    const mm = line.match(modelRe("i"));
    const sn = line.match(SN_RE)?.[1];
    if (!mm || !sn) continue;                       // แถวรายการต้องมีทั้งรุ่นและ SN
    const money = [...line.matchAll(MONEY_RE)].map(m => num(m[1])!).filter(n => n != null);
    if (money.length === 0) continue;

    // จำนวน = เลขโดดก่อนคำว่า Unit (ใบนี้เป็น 1 เสมอ แต่ไม่ฟิกซ์ไว้)
    const qty = Number(line.match(/\b(\d{1,3})\s*(?:Unit|ยูนิต|คัน)\b/i)?.[1] ?? 1) || 1;
    // ราคาต่อคัน: หาคู่ที่ "ราคา × จำนวน = ยอดรวม" ก่อน — ไม่เจอค่อยใช้ตัวแรก
    let unit = money[0];
    for (let i = 0; i < money.length; i++) {
      for (let j = i + 1; j < money.length; j++) {
        if (Math.abs(money[i] * qty - money[j]) <= Math.max(1, qty * 0.01)) { unit = money[i]; i = money.length; break; }
      }
    }

    const model = mm[1].toUpperCase();
    const flags: string[] = [];
    if (!unit) flags.push("ไม่พบราคาทุน");
    byModel.push({ model, qty, subtotal: unit ? unit * qty : undefined });
    for (let k = 0; k < qty; k++) {
      vehicles.push({
        brand: "HELI", model, SN: k === 0 ? sn : undefined,   // ใบกำกับ 1 แถว = 1 คัน (qty มากกว่า 1 ต้องกรอก SN เพิ่มเอง)
        capacity: capacityFromModel(model),
        fuel: fuelOf(line),
        cost_price: unit,
        pi_no: piNo, import_ref: importRef, invoice_no: invoiceNo,
        vendor: "HELI",
        flags: [...flags, ...(k > 0 ? ["แถวนี้ระบุหลายคัน — กรอก SN เพิ่มเอง"] : [])].length
          ? [...flags, ...(k > 0 ? ["แถวนี้ระบุหลายคัน — กรอก SN เพิ่มเอง"] : [])] : undefined,
      });
    }
  }

  // ── ตรวจยอดรวมกับท้ายใบ (Sub Total ก่อน VAT) ──
  const subTotal = num(flat.match(/Sub\s*Total\s*(?:THB)?\s*([\d,]+\.\d{2})/i)?.[1]);
  const sum = byModel.reduce((n, b) => n + (b.subtotal ?? 0), 0);
  if (subTotal && sum && Math.abs(subTotal - sum) > Math.max(1, subTotal * 0.005)) {
    const warn = `ยอดรวมก่อน VAT ในใบ ${subTotal.toLocaleString("th-TH")} ไม่ตรงกับผลรวมรายการ ${sum.toLocaleString("th-TH")} — ตรวจกับใบจริง (ไฟล์สแกนอาจอ่านตัวเลขเพี้ยน)`;
    vehicles.forEach(v => (v.flags = [...(v.flags ?? []), warn]));
  }

  const docCheck: QuoteDocCheck | undefined = byModel.length
    ? { byModel, totalQty: byModel.reduce((n, b) => n + b.qty, 0), totalAmount: sum || undefined } : undefined;

  return {
    vendor: "HELI", doc_kind: "tax-invoice", invoice_no: invoiceNo,
    pi_no: piNo, quote_date: date, vehicles, rawText, docCheck,
  };
}
