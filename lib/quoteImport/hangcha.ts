// lib/quoteImport/hangcha.ts — อ่านใบ HANGCHA Proforma Invoice / Sales Contract (text layer)
// รองรับ 3 ฟอร์แมต:
//  A: มี label "MODEL NO. 型号 X" · "Serial No. X" (มี SN) → แตกตาม SN
//  B: รุ่นฝังในสเปก · หลายบรรทัด "Serial No. : SN1, SN2  qty  subtotal 7% vat total" (ราคาต่อกลุ่ม)
//  C: ไม่มี SN — หลายรุ่น + จำนวน (qty) (รถสั่งผลิต) · แถวราคา "qty subtotal 7% vat total" ต่อรุ่น
//     → แตกเป็นรายคันตามจำนวน · ต้นทุน = subtotal(ก่อน VAT) ÷ จำนวน · จับคู่รุ่นตามลำดับที่พบ
// ต้นทุน = SUBTOTAL(ก่อน VAT) ÷ จำนวนคันในกลุ่มเสมอ

import { ParsedVehicle, QuoteParseResult } from "./types";

// รุ่น HANGCHA: CPD(ไฟฟ้า)/CPCD(ดีเซล)/CBD/CDD/CQD/CBS/XF ตามด้วยพิกัด เช่น CPD25-XAJ4-I, CBD15-WS
const MODEL_RE = /\b((?:CPCD|CPD|CBD|CDD|CQD|CBS|XF)\d{1,3}[A-Z0-9-]*)/i;
const MODEL_RE_G = /\b((?:CPCD|CPD|CBD|CDD|CQD|CBS|XF)\d{1,3}[A-Z0-9-]*)/gi;
// กลุ่ม serial+ราคา (format B): "Serial No. : SN1 , SN2 , SN3   3   57,000.00 7%"
const GROUP_RE = /Serial No\.?\s*:?\s*([A-Z0-9][A-Z0-9,\s]*?)\s+(\d{1,3})\s+([\d,]+\.\d{2})\s*7\s*%/gi;
// serial เดี่ยว (format A / fallback)
const SN_RE = /Serial No\.?\s*:?\s*([A-Z0-9]{6,})/gi;
// แถวราคาต่อกลุ่ม (format C): "<qty>  <subtotal>.00  7%" — qty + ยอดก่อน VAT (ยอดรวมท้ายใบไม่มี 7% ต่อท้าย จึงไม่ชน)
const PRICE_GROUP_RE = /(\d{1,3})\s+([\d,]+\.\d{2})\s+7\s*%/g;

export function parseHangcha(rawText: string): QuoteParseResult {
  const text = rawText.replace(/\s+/g, " ").trim();

  const pi_no = text.match(/P\s*\/?\s*I\s*NO\.?\s*:?\s*(HCTH[-\w]+)/i)?.[1];
  const date = text.match(/DATE\s*:?\s*(\d{4}\.\d{2}\.\d{1,2})/i)?.[1];

  const firstModel = text.match(MODEL_RE)?.[1]?.toUpperCase();
  if (!firstModel) return { vendor: "HANGCHA", pi_no, quote_date: date, vehicles: [], rawText };

  // รุ่นทั้งหมด (unique เรียงตามลำดับที่พบ) + เช็คว่าใบนี้มีหลายรุ่นไหม
  const modelsU = [...new Set([...text.matchAll(MODEL_RE_G)].map((m) => m[1].toUpperCase()))];
  const multiModel = new Set(modelsU.map((m) => m.replace(/-.*/, ""))).size > 1 || modelsU.length > 1;

  // สเปกร่วมทั้งใบ (ปกติเหมือนกันทุกรุ่น)
  const fork_length = text.match(/Fork length\s*(\d{3,4})\s*(?:x\s*\d{3,4}\s*)?mm/i)?.[1];
  const heightM = text.match(/([\d.]+)\s*m\.?\s*(?:Simplex|Duplex|Triplex)?\s*mast/i)?.[1];
  const height = heightM ? `${heightM} ม.` : undefined;
  const mastType = text.match(/(Simplex|Duplex|Triplex)\s*mast/i)?.[1];
  const mast = heightM && mastType ? `${heightM}m ${mastType}` : mastType || undefined;

  // สเปกเฉพาะรุ่น (พิกัดยก/พลังงาน) — จากตัวเลข+prefix ของรุ่นนั้น
  const specOf = (m: string) => {
    const num = m.match(/\d{1,3}/)?.[0];
    const capacity = num ? `${(Number(num) / 10).toFixed(1)} ตัน` : undefined;
    const fuel = /diesel/i.test(text) || /^CPCD/i.test(m) ? "ดีเซล"
      : /electric|li-?ion|lithium|battery/i.test(text) || /^C[BPQD]|^XF/i.test(m) ? "ไฟฟ้า" : undefined;
    return { capacity, fuel };
  };

  const build = (m: string, sn: string | undefined, unitCost?: number): ParsedVehicle => {
    const sp = specOf(m);
    const flags: string[] = [];
    if (!sn) flags.push("ไม่พบ SN");
    if (!unitCost) flags.push("ไม่พบราคาทุน");
    if (multiModel) flags.push("ใบนี้มีหลายรุ่น — ตรวจจับคู่ SN/รุ่น/ราคาให้ถูก");
    return {
      brand: "HANGCHA", model: m, SN: sn, capacity: sp.capacity, fuel: sp.fuel, mast, fork_length, height,
      cost_price: unitCost, pi_no, vendor: "HANGCHA",
      flags: flags.length ? flags : undefined,
    };
  };

  const vehicles: ParsedVehicle[] = [];

  // format B: หลายกลุ่ม serial+qty+ราคา (มี SN)
  const groups = [...text.matchAll(GROUP_RE)];
  const labeled = [...new Set([...text.matchAll(SN_RE)].map((m) => m[1]))];

  if (groups.length) {
    for (const g of groups) {
      const sns = g[1].split(/[,\s]+/).map((s) => s.trim()).filter((s) => /^[A-Z0-9]{6,}$/i.test(s));
      const qty = Number(g[2]) || sns.length || 1;
      const subtotal = Number(g[3].replace(/,/g, "")) || undefined;
      const unit = subtotal ? Math.round(subtotal / Math.max(qty, 1)) : undefined;
      (sns.length ? sns : [undefined]).forEach((sn) => vehicles.push(build(firstModel, sn, unit)));
    }
  } else if (labeled.length) {
    // format A: มี label "Serial No." + SN จริง (ขยายจับ token รูปเดียวกันทั้งเอกสาร)
    let sns = labeled;
    const shapeRe = new RegExp("\\b" + labeled[0].split("").map((c) => (/[0-9]/.test(c) ? "[0-9]" : "[A-Za-z]")).join("") + "\\b", "g");
    const found = [...new Set((text.match(shapeRe) || []).map((s) => s.toUpperCase()))]
      .filter((s) => /[A-Z]/i.test(s) && /\d/.test(s));
    if (found.length >= labeled.length) sns = found;
    const subtotal = Number(text.match(/([\d,]+\.\d{2})\s*7\s*%/)?.[1]?.replace(/,/g, "")) || undefined;
    const unit = subtotal ? Math.round(subtotal / Math.max(sns.length, 1)) : undefined;
    sns.forEach((sn) => vehicles.push(build(firstModel, sn, unit)));
  } else {
    // format C: ไม่มี SN — รถสั่งผลิต · แตกตาม qty · จับคู่รุ่นตามลำดับกับแถวราคา
    const priceGroups = [...text.matchAll(PRICE_GROUP_RE)].map((g) => ({
      qty: Number(g[1]) || 1, subtotal: Number(g[2].replace(/,/g, "")) || undefined,
    }));
    if (priceGroups.length) {
      priceGroups.forEach((g, i) => {
        const m = modelsU[i] ?? modelsU[modelsU.length - 1] ?? firstModel; // จับคู่รุ่นตามลำดับ (เกินก็ใช้รุ่นสุดท้าย)
        const unit = g.subtotal ? Math.round(g.subtotal / Math.max(g.qty, 1)) : undefined;
        for (let k = 0; k < g.qty; k++) vehicles.push(build(m, undefined, unit));
      });
    } else {
      // ไม่พบแถวราคาเลย → อย่างน้อยคืนรุ่นละ 1 คัน (ให้ผู้ใช้กรอกเอง)
      (modelsU.length ? modelsU : [firstModel]).forEach((m) => vehicles.push(build(m, undefined, undefined)));
    }
  }

  return { vendor: "HANGCHA", pi_no, quote_date: date, vehicles, rawText };
}
