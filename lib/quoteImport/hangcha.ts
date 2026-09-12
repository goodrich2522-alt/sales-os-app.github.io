// lib/quoteImport/hangcha.ts — อ่านใบ HANGCHA Proforma Invoice / Sales Contract (text layer)
//
// ⭐ กติกา (12 ก.ย. 2569 — แก้บั๊กใบ HCTH-BFL2026091402 / 091413 / 091414):
//    **ตัดเอกสารเป็น "บล็อกรายการ" ด้วยแถว SUBTOTAL** แล้วอ่าน รุ่น/SN/จำนวน/ราคา/เสา จากบล็อกนั้นเท่านั้น
//    ห้ามเอารุ่นแรก (firstModel) หรือสเปกรวมทั้งใบไปใส่รถทุกคันเด็ดขาด
//
// ทำไมต้องใช้แถว SUBTOTAL เป็นตัวตัด (ไม่ใช่ชื่อรุ่น):
//    1 รายการ = 1 แถว SUBTOTAL เสมอ · ตัดแบบนี้รองรับ "ใบที่มีรุ่นเดียวกัน 2 รายการคนละสเปก/คนละราคา"
//    เช่น 091414 = CQD15-AC5S-I เสา 6.0m (543,600) + CQD15-AC5S-I เสา 7.0m (564,100)
//    ถ้าตัดตามชื่อรุ่นจะรวมเป็นก้อนเดียวแล้วราคาเพี้ยน
//
// SN: ป้าย "Serial No." บางใบตามด้วย SN ทันที บางใบ SN อยู่คนละบรรทัด (ตกไปอยู่ท้ายคอลัมน์)
//     → อ่านจากป้ายก่อน ไม่เจอค่อยกวาดหารูปแบบ SN ของ HANGCHA ในบล็อกนั้น
// ต้นทุนต่อคัน = SUBTOTAL (ก่อน VAT) ÷ จำนวนที่เอกสารระบุ (ไม่ใช่จำนวน SN ที่อ่านได้)
// ทุกใบคืน docCheck = จำนวนที่เอกสารระบุ ให้หน้าตรวจทานเทียบกับที่อ่านได้จริง

import { ParsedVehicle, QuoteParseResult, QuoteDocCheck } from "./types";
import { isKdRef, hasKdMark } from "./madeToOrder";

// รุ่น HANGCHA: CPD(ไฟฟ้า)/CPCD(ดีเซล)/CBD/CDD/CQD/CBS/XF ตามด้วยพิกัด เช่น CPD25-XAJ4-I, CBD15-WS
const MODEL_RE = /\b((?:CPCD|CPD|CBD|CDD|CQD|CBS|XF)\d{1,3}[A-Z0-9-]*)/i;
// SN ของ HANGCHA มี 2 ตระกูล: ขึ้นต้นอักษร (M1BFS7150 · M1BDS410099) · ขึ้นต้นตัวเลข (83BF10978 · 15BF01722)
const SN_SHAPE_G = /\b(?:[A-Z]{1,2}\d[A-Z]{2,4}\d{3,7}|\d{2}[A-Z]{2}\d{4,6})\b/gi;
// ป้าย "Serial No. : SN1 , SN2" (บางใบ SN ตามหลังทันที)
const SN_LABEL_G = /Serial\s*No\.?\s*:?\s*((?:[A-Z0-9]{6,}\s*[,;]?\s*)+)/gi;
// แถว SUBTOTAL = ตัวตัดบล็อกรายการ "SUBTOTAL 小计 : 4 70,000.00" → (จำนวน, ยอดก่อน VAT)
const SUBTOTAL_G = /SUBTOTAL[^\dA-Za-z]{0,16}(\d{1,3})\s+([\d,]+\.\d{2})/gi;
// แถวสินค้า "17,500.00  4  70,000.00" (ราคาต่อหน่วย, จำนวน, ยอดรวม) — ใช้เมื่อใบไม่มีแถว SUBTOTAL
const ITEM_ROW_RE = /([\d,]+\.\d{2})\s+(\d{1,3})\s+([\d,]+\.\d{2})/;
// ยอดรวมท้ายใบ "TOTAL AMOUNT 总计 : 10 232,190.00" (แถวต่อรายการไม่มีจำนวนนำหน้า จึงไม่ชน)
const GRAND_G = /TOTAL\s*AMOUNT[^\d]{0,16}(\d{1,3})\s+([\d,]+\.\d{2})/gi;

const num = (s: string | undefined) => (s ? Number(s.replace(/,/g, "")) || undefined : undefined);

interface Block { seg: string; model?: string; qty?: number; subtotal?: number }

/** ตัดเอกสารเป็นบล็อกรายการด้วยแถว SUBTOTAL · ไม่มี SUBTOTAL เลย → ตัดตามชื่อรุ่นแทน */
function itemBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let prev = 0;
  for (const m of text.matchAll(SUBTOTAL_G)) {
    const end = (m.index ?? 0) + m[0].length;
    blocks.push({ seg: text.slice(prev, end), qty: Number(m[1]) || undefined, subtotal: num(m[2]) });
    prev = end;
  }
  if (blocks.length === 0) {
    // ไม่มีแถว SUBTOTAL → ตัดตามชื่อรุ่น (เริ่มบล็อกใหม่เมื่อเจอรุ่นที่ต่างจากเดิม)
    const hits = [...text.matchAll(new RegExp(MODEL_RE.source, "gi"))];
    const starts: { model: string; at: number }[] = [];
    for (const h of hits) {
      const mm = h[1].toUpperCase();
      if (starts.length && starts[starts.length - 1].model === mm) continue;
      starts.push({ model: mm, at: h.index ?? 0 });
    }
    starts.forEach((s, i) => blocks.push({
      seg: text.slice(s.at, i + 1 < starts.length ? starts[i + 1].at : text.length),
      model: s.model,
    }));
  }
  // เติมชื่อรุ่นให้แต่ละบล็อก · บล็อกที่ไม่มีชื่อรุ่น (ใบพิมพ์รุ่นครั้งเดียว) → ใช้รุ่นของบล็อกก่อนหน้า
  let last: string | undefined;
  for (const b of blocks) {
    b.model = b.model ?? b.seg.match(MODEL_RE)?.[1]?.toUpperCase() ?? last;
    if (b.model) last = b.model;
  }
  return blocks.filter((b) => b.model);
}

/** SN ในบล็อกนี้ — ป้าย "Serial No." ก่อน · ไม่เจอค่อยกวาดหารูปแบบ SN ทั้งบล็อก */
function snsIn(seg: string): string[] {
  const out: string[] = [];
  for (const m of seg.matchAll(SN_LABEL_G)) {
    for (const t of m[1].split(/[,;\s]+/)) {
      const s = t.trim().toUpperCase();
      // ต้องมีทั้งอักษรและตัวเลข — กันคำหัวตาราง (SUBTOTAL/QUANTITY) หลุดมาเป็น SN
      if (s.length >= 6 && /[A-Z]/.test(s) && /\d/.test(s) && SN_SHAPE_G.test(s)) out.push(s);
      SN_SHAPE_G.lastIndex = 0;
    }
  }
  if (out.length === 0) for (const m of seg.matchAll(SN_SHAPE_G)) out.push(m[0].toUpperCase());
  return [...new Set(out)];
}

export function parseHangcha(rawText: string): QuoteParseResult {
  const text = rawText.replace(/\s+/g, " ").trim();

  const pi_no = text.match(/P\s*\/?\s*I\s*NO\.?\s*:?\s*([A-Z]{2,}[-\w]+)/i)?.[1];
  const date = text.match(/DATE\s*:?\s*(\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2})/i)?.[1];

  // ใบ KD = รถสั่งผลิต → ยังไม่มี SN เป็นเรื่องปกติ (SN มาตอนผลิตเสร็จ ~60-90 วัน) ดู madeToOrder.ts
  const isKd = isKdRef(pi_no) || hasKdMark(text);

  const blocks = itemBlocks(text);
  if (blocks.length === 0) return { vendor: "HANGCHA", pi_no, quote_date: date, vehicles: [], rawText };

  const vehicles: ParsedVehicle[] = [];
  const byModel: QuoteDocCheck["byModel"] = [];

  for (const b of blocks) {
    const model = b.model!;
    const seg = b.seg;
    // สเปกของรายการนี้ (ไม่ใช่ของทั้งใบ) — ใบเดียวกันคนละรายการอาจคนละเสา/คนละงา
    const fork_length = seg.match(/Fork length\s*(\d{3,4})\s*(?:x\s*\d{3,4}\s*)?mm/i)?.[1];
    const mastM = seg.match(/([\d.]+)\s*m\.?\s*(?:Full\s*Free\s*)?(?:Simplex|Duplex|Triplex)?\s*mast/i)?.[1];
    const mastType = seg.match(/(Simplex|Duplex|Triplex)\s*mast/i)?.[1];
    const mast = mastM && mastType ? `${mastM}m ${mastType}` : mastType || (mastM ? `${mastM}m` : undefined);
    const height = mastM ? `${mastM} ม.` : undefined;
    const capNum = model.match(/\d{1,3}/)?.[0];
    const capacity = capNum ? `${(Number(capNum) / 10).toFixed(1)} ตัน` : undefined;
    const fuel = /diesel/i.test(seg) || /^CPCD/i.test(model) ? "ดีเซล"
      : /electric|li-?ion|lithium|battery/i.test(seg) || /^C[BPQD]|^XF/i.test(model) ? "ไฟฟ้า" : undefined;

    // จำนวน/ยอดของรายการนี้ — จากแถว SUBTOTAL · ไม่มีก็ใช้แถวสินค้า (ต่อหน่วย จำนวน ยอดรวม)
    const row = b.qty ? null : seg.match(ITEM_ROW_RE);
    const docQty = b.qty ?? (Number(row?.[2]) || undefined);
    const subtotal = b.subtotal ?? num(row?.[3]);

    const sns = snsIn(seg);
    const count = sns.length || docQty || 1;
    // ต้นทุนต่อคัน = ยอดก่อน VAT ÷ จำนวนตามเอกสาร (SN มาไม่ครบจะได้ราคาเพี้ยนถ้าหารด้วยจำนวน SN)
    const unit = subtotal ? Math.round(subtotal / Math.max(docQty ?? count, 1)) : num(row?.[1]);

    const extra = sns.length && docQty && sns.length !== docQty
      ? [`เอกสารระบุ ${docQty} คัน แต่พบ SN ${sns.length} ตัว — ตรวจกับใบจริง`] : [];

    const build = (sn?: string): ParsedVehicle => {
      const kd = isKd && !sn;                       // ใบ KD + ยังไม่มี SN = รถสั่งผลิต
      const flags = [...extra];
      if (!sn && !kd) flags.push("ไม่พบ SN");       // KD ไม่ต้องเตือน — ยังไม่ถึงเวลามี SN
      if (!unit) flags.push("ไม่พบราคาทุน");
      return {
        brand: "HANGCHA", model, SN: sn, capacity, fuel, mast, fork_length, height,
        cost_price: unit, pi_no, vendor: "HANGCHA", made_to_order: kd || undefined,
        flags: flags.length ? flags : undefined,
      };
    };

    if (sns.length) sns.forEach((sn) => vehicles.push(build(sn)));
    else for (let k = 0; k < count; k++) vehicles.push(build(undefined));

    byModel.push({ model, qty: docQty ?? count, subtotal });
  }

  // ยอดรวมท้ายใบ — ใช้เทียบว่าอ่านครบทั้งใบไหม (ตัวสุดท้าย = แถวรวมจริง)
  const grand = [...text.matchAll(GRAND_G)].pop();
  const totalQty = Number(grand?.[1]) || byModel.reduce((n, b) => n + b.qty, 0) || undefined;

  return {
    vendor: "HANGCHA", pi_no, quote_date: date, vehicles, rawText,
    docCheck: { totalQty, totalAmount: num(grand?.[2]), byModel },
  };
}
