// lib/quoteImport/hangcha.ts — อ่านใบ HANGCHA Proforma Invoice / Sales Contract (text layer)
//
// ⭐ กติกา (12 ก.ย. 2569 — แก้บั๊กใบ HCTH-BFL2026091402):
//    **1 รุ่น = 1 บล็อกในเอกสาร** — อ่าน SN/จำนวน/ราคาจาก "บล็อกของรุ่นนั้น" เท่านั้น
//    ห้ามเอารุ่นแรก (firstModel) ไปใส่รถทุกคันเด็ดขาด
//    เดิมทำแบบนั้น → ใบที่มี CBD15-WS 4 คัน + CBD20-WS 6 คัน กลายเป็น CBD15-WS อย่างเดียว จำนวนเพี้ยน
//
// ในบล็อกของแต่ละรุ่นมีได้ 2 กรณี:
//    มี "Serial No." + SN จริง → แตกตาม SN (รถพร้อมส่ง)
//    ไม่มี SN                  → แตกตาม QUANTITY (รถสั่งผลิต · ดู madeToOrder.ts)
// ต้นทุนต่อคัน = SUBTOTAL (ก่อน VAT) ÷ จำนวนในบล็อกนั้นเสมอ
//
// ทุกใบคืน docCheck = "จำนวนที่เอกสารระบุเอง" ให้หน้าตรวจทานเทียบกับที่อ่านได้จริง (กันอ่านเกิน/ขาดเงียบๆ)

import { ParsedVehicle, QuoteParseResult, QuoteDocCheck } from "./types";
import { isKdRef, hasKdMark } from "./madeToOrder";

// รุ่น HANGCHA: CPD(ไฟฟ้า)/CPCD(ดีเซล)/CBD/CDD/CQD/CBS/XF ตามด้วยพิกัด เช่น CPD25-XAJ4-I, CBD15-WS
const MODEL_RE_G = /\b((?:CPCD|CPD|CBD|CDD|CQD|CBS|XF)\d{1,3}[A-Z0-9-]*)/gi;
// SN ของ HANGCHA: อักษร+เลข+อักษร+เลข เช่น M1BFS7150 · M1BDS410099 · M1BFS07113
const SN_SHAPE_G = /\b([A-Z]{1,2}\d[A-Z]{2,4}\d{3,7})\b/gi;
// ป้าย "Serial No. : SN1 , SN2 , SN3" (รับหลายตัวต่อป้าย)
const SN_LABEL_G = /Serial\s*No\.?\s*:?\s*((?:[A-Z0-9]{6,}\s*[,;]?\s*)+)/gi;
// แถวสรุปต่อรุ่น "SUBTOTAL 小计 : 4 70,000.00" — (จำนวน, ยอดก่อน VAT)
const SUBTOTAL_RE = /SUBTOTAL[^\dA-Za-z]{0,16}(\d{1,3})\s+([\d,]+\.\d{2})/i;
// แถวสินค้า "17,500.00  4  70,000.00" — (ราคาต่อหน่วย, จำนวน, ยอดรวม) ใช้เมื่อไม่มีแถว SUBTOTAL
const ITEM_ROW_RE = /([\d,]+\.\d{2})\s+(\d{1,3})\s+([\d,]+\.\d{2})/;
// ยอดรวมท้ายใบ "TOTAL AMOUNT 总计 : 10 232,190.00" — มี "จำนวนรวม" นำหน้ายอด (แถวต่อรุ่นไม่มีจำนวน จึงไม่ชน)
const GRAND_RE = /TOTAL\s*AMOUNT[^\d]{0,16}(\d{1,3})\s+([\d,]+\.\d{2})/gi;
// สำรอง: กลุ่มราคาแบบ "<จำนวน> <ยอดก่อน VAT> 7%" (ใช้เมื่อแยกบล็อกตามรุ่นไม่ได้)
const PRICE_GROUP_RE = /(\d{1,3})\s+([\d,]+\.\d{2})\s+7\s*%/g;

const num = (s: string | undefined) => (s ? Number(s.replace(/,/g, "")) || undefined : undefined);

/** ตัดเอกสารเป็นบล็อกละรุ่น — เริ่มบล็อกใหม่เมื่อ "เจอรุ่นที่ต่างจากบล็อกก่อนหน้า" */
function modelBlocks(text: string): { model: string; seg: string }[] {
  const hits = [...text.matchAll(MODEL_RE_G)];
  const blocks: { model: string; start: number }[] = [];
  for (const h of hits) {
    const m = h[1].toUpperCase();
    if (blocks.length && blocks[blocks.length - 1].model === m) continue; // รุ่นเดิมซ้ำในบล็อกเดียวกัน
    blocks.push({ model: m, start: h.index ?? 0 });
  }
  return blocks.map((b, i) => ({
    model: b.model,
    seg: text.slice(b.start, i + 1 < blocks.length ? blocks[i + 1].start : text.length),
  }));
}

/** SN ในบล็อกนี้ — เอาจากป้าย "Serial No." ก่อน ถ้าไม่มีค่อยหาจากรูปแบบ SN */
function snsIn(seg: string): string[] {
  const out: string[] = [];
  for (const m of seg.matchAll(SN_LABEL_G)) {
    for (const t of m[1].split(/[,;\s]+/)) {
      const s = t.trim().toUpperCase();
      // ต้องมีทั้งตัวอักษรและตัวเลข — กันคำหัวตารางอย่าง SUBTOTAL/QUANTITY หลุดมาเป็น SN
      if (s.length >= 6 && /[A-Z]/.test(s) && /\d/.test(s)) out.push(s);
    }
  }
  if (out.length === 0) {
    for (const m of seg.matchAll(SN_SHAPE_G)) out.push(m[1].toUpperCase());
  }
  return [...new Set(out)];
}

export function parseHangcha(rawText: string): QuoteParseResult {
  const text = rawText.replace(/\s+/g, " ").trim();

  const pi_no = text.match(/P\s*\/?\s*I\s*NO\.?\s*:?\s*([A-Z]{2,}[-\w]+)/i)?.[1];
  const date = text.match(/DATE\s*:?\s*(\d{4}\.\d{2}\.\d{1,2})/i)?.[1];

  // ใบ KD = รถสั่งผลิต → ยังไม่มี SN เป็นเรื่องปกติ (SN มาตอนผลิตเสร็จ ~60-90 วัน) ดู madeToOrder.ts
  const isKd = isKdRef(pi_no) || hasKdMark(text);

  // สเปกร่วมทั้งใบ (ปกติเหมือนกันทุกรุ่น)
  const fork_length = text.match(/Fork length\s*(\d{3,4})\s*(?:x\s*\d{3,4}\s*)?mm/i)?.[1];
  const heightM = text.match(/([\d.]+)\s*m\.?\s*(?:Simplex|Duplex|Triplex)?\s*mast/i)?.[1];
  const height = heightM ? `${heightM} ม.` : undefined;
  const mastType = text.match(/(Simplex|Duplex|Triplex)\s*mast/i)?.[1];
  const mast = heightM && mastType ? `${heightM}m ${mastType}` : mastType || undefined;

  // สเปกเฉพาะรุ่น (พิกัดยก/พลังงาน) — จากตัวเลข+prefix ของรุ่นนั้น
  const specOf = (m: string, seg: string) => {
    const n = m.match(/\d{1,3}/)?.[0];
    const capacity = n ? `${(Number(n) / 10).toFixed(1)} ตัน` : undefined;
    const fuel = /diesel/i.test(seg) || /^CPCD/i.test(m) ? "ดีเซล"
      : /electric|li-?ion|lithium|battery/i.test(seg) || /^C[BPQD]|^XF/i.test(m) ? "ไฟฟ้า" : undefined;
    return { capacity, fuel };
  };

  const vehicles: ParsedVehicle[] = [];
  const byModel: QuoteDocCheck["byModel"] = [];

  const build = (m: string, seg: string, sn: string | undefined, unitCost: number | undefined, extra: string[] = []): ParsedVehicle => {
    const sp = specOf(m, seg);
    const kd = isKd && !sn;                        // ใบ KD + ยังไม่มี SN = รถสั่งผลิต
    const flags = [...extra];
    if (!sn && !kd) flags.push("ไม่พบ SN");        // KD ไม่ต้องเตือน — ยังไม่ถึงเวลามี SN
    if (!unitCost) flags.push("ไม่พบราคาทุน");
    return {
      brand: "HANGCHA", model: m, SN: sn, capacity: sp.capacity, fuel: sp.fuel, mast, fork_length, height,
      cost_price: unitCost, pi_no, vendor: "HANGCHA", made_to_order: kd || undefined,
      flags: flags.length ? flags : undefined,
    };
  };

  const blocks = modelBlocks(text);
  if (blocks.length === 0) {
    return { vendor: "HANGCHA", pi_no, quote_date: date, vehicles: [], rawText };
  }

  // ── อ่านทีละบล็อก (= ทีละรุ่น) ──
  let readAnyQty = false;
  for (const { model, seg } of blocks) {
    const sub = seg.match(SUBTOTAL_RE);
    const row = sub ? null : seg.match(ITEM_ROW_RE);
    const docQty = Number(sub?.[1] ?? row?.[2]) || undefined;      // จำนวนที่เอกสารระบุสำหรับรุ่นนี้
    const subtotal = num(sub?.[2] ?? row?.[3]);                    // ยอดก่อน VAT ของรุ่นนี้
    if (docQty) readAnyQty = true;

    const sns = snsIn(seg);
    const count = sns.length || docQty || 1;
    // ต้นทุนต่อคัน = SUBTOTAL ÷ "จำนวนตามเอกสาร" (ไม่ใช่จำนวน SN ที่อ่านได้ — SN มาไม่ครบจะทำให้ราคาเพี้ยน)
    const unit = subtotal ? Math.round(subtotal / Math.max(docQty ?? count, 1)) : num(row?.[1]);

    // SN ที่อ่านได้ไม่เท่าจำนวนในเอกสาร → ติดธงให้คนตรวจ (ไม่เดาเอง)
    const extra = sns.length && docQty && sns.length !== docQty
      ? [`เอกสารระบุ ${docQty} คัน แต่พบ SN ${sns.length} ตัว — ตรวจกับใบจริง`] : [];

    if (sns.length) sns.forEach((sn) => vehicles.push(build(model, seg, sn, unit, extra)));
    else for (let k = 0; k < count; k++) vehicles.push(build(model, seg, undefined, unit, extra));

    byModel.push({ model, qty: docQty ?? count, subtotal });
  }

  // ── สำรอง: แยกจำนวนตามบล็อกไม่ได้เลย (ข้อความเรียงผิดคอลัมน์) → ใช้กลุ่มราคาจับคู่ตามลำดับ ──
  if (!readAnyQty && vehicles.every((v) => !v.SN)) {
    const priceGroups = [...text.matchAll(PRICE_GROUP_RE)].map((g) => ({ qty: Number(g[1]) || 1, subtotal: num(g[2]) }));
    if (priceGroups.length) {
      vehicles.length = 0; byModel.length = 0;
      priceGroups.forEach((g, i) => {
        const b = blocks[i] ?? blocks[blocks.length - 1];
        const unit = g.subtotal ? Math.round(g.subtotal / Math.max(g.qty, 1)) : undefined;
        for (let k = 0; k < g.qty; k++)
          vehicles.push(build(b.model, b.seg, undefined, unit, ["อ่านจำนวนจากลำดับแถวราคา — ตรวจรุ่น/จำนวนกับใบจริง"]));
        byModel.push({ model: b.model, qty: g.qty, subtotal: g.subtotal });
      });
    }
  }

  // ยอดรวมท้ายใบ — ใช้เทียบว่าอ่านครบทั้งใบไหม
  const grand = [...text.matchAll(GRAND_RE)].pop();
  const docCheck: QuoteDocCheck = {
    totalQty: Number(grand?.[1]) || undefined,
    totalAmount: num(grand?.[2]),
    byModel,
  };

  return { vendor: "HANGCHA", pi_no, quote_date: date, vehicles, rawText, docCheck };
}
