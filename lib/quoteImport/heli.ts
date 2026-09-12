// lib/quoteImport/heli.ts — อ่านใบ HELI Sales Contract / Proforma Invoice (text layer)
// 1 ใบมีได้หลายรายการ (item) · แต่ละรายการ = 1 รุ่น + SN หลายตัว + ราคา/เสา/พิกัดของตัวเอง
// ✅ แยกรุ่นตามรายการ: จับ SN เข้ากับรุ่นที่ถูกต้องต่อ item (เดิมเอารุ่นแรกไปใส่ทุกคัน → ผิดเมื่อใบมีหลายรุ่น)

import { ParsedVehicle, QuoteParseResult, QuoteDocCheck } from "./types";
import { isKdRef, hasKdMark } from "./madeToOrder";

/** พลังงานจากคำในเอกสาร (อังกฤษ) → ไทย */
function fuelFromText(s: string): string | undefined {
  if (/diesel/i.test(s)) return "ดีเซล";
  if (/\b(lpg|gas)\b/i.test(s)) return "แก๊ส";
  if (/semi[- ]?electric/i.test(s)) return "กึ่งไฟฟ้า"; // CBS = semi-electric
  if (/electric|li-?ion|lithium|battery/i.test(s)) return "ไฟฟ้า";
  return undefined;
}
/** พลังงานเดาจาก prefix รุ่น (เผื่อข้อความไม่มีคำบอก) */
function fuelFromModel(model: string): string | undefined {
  if (/^CPCD/i.test(model)) return "ดีเซล";
  if (/^(CPD|PCD|CBD|CDD|CQD|CBS)/i.test(model)) return "ไฟฟ้า";
  return undefined;
}

/** ราคาทุน = ราคา "no vat" ตัวแรกในช่วงนั้น (unit price ก่อน VAT) */
function firstPrice(s: string): number | undefined {
  const m = s.match(/THB\s*([\d,]+(?:\.\d{2})?)/i);
  if (!m) return undefined;
  const n = Number(m[1].replace(/,/g, ""));
  return isNaN(n) ? undefined : n;
}

// รุ่น HELI: รถยก CPCD/CPD/PCD · รถคลัง CBD/CDD/CQD/CBS (เรียงยาว→สั้นด้วย \d ต่อท้าย)
const MODEL_RE = /\b((?:CPCD|CPD|PCD|CBD|CDD|CQD|CBS)\d{1,3}[A-Z0-9-]*)/gi;
// SN HELI 2 รูปแบบ: 6ตัวเลข+1อักษร+4ตัวเลข (010353N6726) · 5ตัวเลข+3อักษร+3ตัวเลข (08015JVF574)
const SN_RE = /\b(\d{4,6}[A-Z]{1,3}\d{3,4})\b/g;
const MAST_RE = /\b(M\d{3}|ZSM\d{3,4}|ZM\d{3})\b/;
// คอลัมน์จำนวนในเอกสาร: เลขที่ขั้นระหว่าง "ราคาต่อหน่วย THB x.xx" กับ "ยอดรวม THB y.yy"
// (เดิมอ่านเฉพาะรายการที่ไม่มี SN · ตอนนี้อ่านทุกรายการเพื่อเอาไปเทียบจำนวนกับที่ parse ได้)
const QTY_RE = /THB\s*[\d,]+\.\d{2}\s+(\d{1,3})\s+THB\s*[\d,]+\.\d{2}/;

export function parseHeli(rawText: string): QuoteParseResult {
  const text = rawText.replace(/\s+/g, " ").trim();

  // รหัสอ้างอิง C20726201-125 → ตั้งเลข PI = PI125 (ท้ายรหัส = เลข PI จริง · แก้ได้ในหน้าตรวจ)
  const importRef = text.match(/\b([A-Z]\d{6,9}-\d{2,3}[A-Z]{0,3})\b/)?.[1];
  const piFromRef = importRef ? "PI" + importRef.replace(/^[A-Z]\d{6,9}-/, "") : undefined;
  const date = text.match(/\b(\d{1,2}-[A-Z][a-z]{2}-\d{2,4})\b/)?.[1];

  // ใบ KD = รถสั่งผลิต → ยังไม่มี SN เป็นเรื่องปกติ (ผู้ผลิตให้ SN ตอนผลิตเสร็จ ~60-90 วัน) ดู madeToOrder.ts
  const isKd = isKdRef(importRef, piFromRef) || hasKdMark(text);

  const modelMatches = [...text.matchAll(MODEL_RE)];
  if (modelMatches.length === 0) {
    return { vendor: "HELI", pi_no: piFromRef, quote_date: date, vehicles: [], rawText };
  }

  const vehicles: ParsedVehicle[] = [];
  const baseModels = new Set<string>();
  const byModel: QuoteDocCheck["byModel"] = [];   // จำนวนที่ "คอลัมน์ QUANTITY ในเอกสาร" ระบุ — ใช้เทียบกับที่อ่านได้

  // แต่ละ item = ช่วงข้อความตั้งแต่รุ่นนี้ ถึงก่อนรุ่นถัดไป → มี SN/ราคา/เสาของ item นั้นเอง
  for (let i = 0; i < modelMatches.length; i++) {
    const start = modelMatches[i].index ?? 0;
    const end = i + 1 < modelMatches.length ? (modelMatches[i + 1].index ?? text.length) : text.length;
    const seg = text.slice(start, end);

    const model = modelMatches[i][1].toUpperCase();
    baseModels.add(model.replace(/-.*$/, ""));
    const num = model.match(/\d{2,3}/)?.[0];             // CBS15J → 15 → 1.5 ตัน
    const capacity = num ? `${(Number(num) / 10).toFixed(1)} ตัน` : undefined;
    const fuel = fuelFromText(seg) ?? fuelFromModel(model);
    const mast = seg.match(MAST_RE)?.[1];
    const valve = seg.match(/(\d+)\s*Valves?/i)?.[1];
    const cost = firstPrice(seg);
    const sns = [...new Set([...seg.matchAll(SN_RE)].map((m) => m[1]))];
    const docQty = Number(seg.match(QTY_RE)?.[1]) || undefined;   // จำนวนที่เอกสารระบุสำหรับรายการนี้
    if (docQty) byModel.push({ model, qty: docQty, subtotal: cost ? cost * docQty : undefined });

    const build = (sn?: string): ParsedVehicle => {
      const kd = isKd && !sn;                      // ใบ KD + ยังไม่มี SN = รถสั่งผลิต
      const flags: string[] = [];
      if (!sn && !kd) flags.push("ไม่พบ SN");       // KD ไม่ต้องเตือน — ยังไม่ถึงเวลามี SN
      if (!cost) flags.push("ไม่พบราคาทุน");
      if (!mast) flags.push("ไม่พบ MAST");
      return {
        brand: "HELI", model, SN: sn, capacity, fuel, mast, valve,
        cost_price: cost, pi_no: piFromRef, import_ref: importRef, vendor: "HELI",
        made_to_order: kd || undefined,
        flags: flags.length ? flags : undefined,
      };
    };

    if (sns.length === 0) {
      // ไม่มี SN (รถสั่งผลิต/ยังไม่ออก SN) → แตก placeholder ตามจำนวนในเอกสาร (QTY_RE)
      for (let q = 0; q < (docQty ?? 1); q++) vehicles.push(build(undefined));
    } else {
      // จำนวน SN ไม่ตรงคอลัมน์จำนวนในเอกสาร → ไม่เดาเอง ติดธงให้คนตรวจกับใบจริง
      const warn = docQty && docQty !== sns.length ? `เอกสารระบุ ${docQty} คัน แต่พบ SN ${sns.length} ตัว — ตรวจกับใบจริง` : null;
      sns.forEach((sn) => {
        const v = build(sn);
        if (warn) v.flags = [...(v.flags ?? []), warn];
        vehicles.push(v);
      });
    }
  }

  // ใบมีหลายรุ่น → ระบบแยกให้แล้ว แต่เตือนให้ตรวจอีกครั้ง (กันจับ SN เข้ารุ่นผิดในใบแปลกๆ)
  if (baseModels.size > 1) {
    vehicles.forEach((v) => (v.flags = [...(v.flags ?? []), "ใบนี้มีหลายรุ่น — ระบบแยกให้แล้ว ตรวจว่าจับคู่ SN ถูก"]));
  }

  const docCheck: QuoteDocCheck | undefined = byModel.length
    ? { byModel, totalQty: byModel.reduce((n, b) => n + b.qty, 0) } : undefined;
  return { vendor: "HELI", pi_no: piFromRef, quote_date: date, vehicles, rawText, docCheck };
}
