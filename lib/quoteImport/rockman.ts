// lib/quoteImport/rockman.ts — อ่านใบเสนอราคา ROCKMAN
// ⚠️ แยกให้ชัด (22 ก.ย. 2569 · ผู้ใช้ยืนยัน): **CNC = ชื่อบริษัทผู้ขาย** (cnc-moving)
//    ส่วน **ROCKMAN = ยี่ห้อสินค้า** → ช่อง "ยี่ห้อ" ต้องเป็น ROCKMAN
//    ชื่อบริษัทเก็บไว้ที่ custom_fields["บริษัทผู้ขาย"] แทน
// ⚠️ ฟอนต์ไทยในใบนี้ subset จน text layer ไทยแตก — ดึงได้เฉพาะส่วนอังกฤษ/ตัวเลข
//    (รุ่น/พิกัด/ความสูง/เลขเอกสาร) · ราคาเป็นภาษาไทยอ่านไม่ได้ → ติดธงให้กรอกเอง
// รูปแบบรายการ: "1. Semi-Stacker 400kg. 1500mm (PD-400-1500)" · ไม่มี SN (สั่งผลิต)

import { ParsedVehicle, QuoteParseResult } from "./types";

export function parseRockman(rawText: string): QuoteParseResult {
  const text = rawText.replace(/\s+/g, " ").trim();
  const doc = text.match(/QO-\d+/)?.[0];

  const vehicles: ParsedVehicle[] = [];

  // รุ่น: ในวงเล็บ (PD-400-1500) หรือ pattern ตัวอักษร-เลข-เลข
  const model =
    text.match(/\(([A-Z]{2,4}-?\d{2,4}-?\d{2,4})\)/i)?.[1] ??
    text.match(/\b([A-Z]{2,4}-\d{3}-\d{3,4})\b/i)?.[1];
  const kg = text.match(/(\d{3,4})\s*kg/i)?.[1];
  const mm = text.match(/(\d{3,4})\s*mm/i)?.[1];
  const isSemi = /semi-?stacker/i.test(text);
  const typeLabel = isSemi ? "Semi-Stacker" : /stacker/i.test(text) ? "Stacker" : undefined;

  if (model || typeLabel) {
    vehicles.push({
      brand: "ROCKMAN",
      model: model ?? typeLabel ?? "ROCKMAN",
      capacity_kg: kg,
      height: mm ? `${(Number(mm) / 1000).toFixed(1)} ม.` : undefined,
      fuel: isSemi ? "กึ่งไฟฟ้า" : "มือ",
      vendor: "ROCKMAN",
      supplier: "CNC",          // บริษัทผู้ขาย (คนละอย่างกับยี่ห้อ)
      pi_no: doc,
      flags: [
        "ราคา ROCKMAN อ่านไม่ได้ (ฟอนต์ไทยในใบ) — กรอกเอง",
        ...(model ? [] : ["ไม่พบรหัสรุ่น — ตรวจ/กรอกเอง"]),
      ],
    });
  }

  return { vendor: "ROCKMAN", pi_no: doc, vehicles, rawText };
}
