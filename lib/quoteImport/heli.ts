// lib/quoteImport/heli.ts — อ่านใบ HELI Sales Contract / Proforma Invoice (text layer)
// 1 ใบมีได้หลายรายการ (item) · แต่ละรายการ = 1 รุ่น + SN หลายตัว + ราคา/เสา/พิกัดของตัวเอง
// ✅ แยกรุ่นตามรายการ: จับ SN เข้ากับรุ่นที่ถูกต้องต่อ item (เดิมเอารุ่นแรกไปใส่ทุกคัน → ผิดเมื่อใบมีหลายรุ่น)

import { ParsedVehicle, QuoteParseResult, QuoteDocCheck } from "./types";
import { isKdRef, hasKdMark, leadDaysFrom } from "./madeToOrder";
import { modelRe, capacityFromModel } from "./models";

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
// รหัสรุ่น: ใช้ความจำกลางที่ models.ts — เจอรุ่นใหม่ที่อ่านไม่ออก ให้แก้ที่นั่นที่เดียว
// SN HELI 2 รูปแบบ: 6ตัวเลข+1อักษร+4ตัวเลข (010353N6726) · 5ตัวเลข+3อักษร+3ตัวเลข (08015JVF574)
const SN_RE = /\b(\d{4,6}[A-Z]{1,3}\d{3,4})\b/g;
const MAST_RE = /\b(M\d{3}|ZSM\d{3,4}|ZM\d{3})\b/;
// แถวจำนวน/ราคาในเอกสาร: "THB <ราคาสุทธิต่อคัน> <จำนวน> THB <ยอดรวม>"
// จับทั้ง 3 ค่าเพื่อ **ตรวจสอบตัวเองด้วยการคูณ** (ราคา × จำนวน = ยอดรวม) — กันจับเลขมั่ว
// ⚠️ ต้องใช้ "ราคาสุทธิ" (Final price) ไม่ใช่ THB ตัวแรกที่เจอ:
//    ใบที่มีส่วนลด (unit promo) เขียน "THB 222,000 THB 1,000 THB 221,000 5 THB 1,105,000"
//    THB ตัวแรก = ราคาป้าย · ที่ต้องใช้คือ 221,000 (หลังหักส่วนลด)
const QTY_ROW_RE = /THB\s*([\d,]+\.\d{2})\s+(\d{1,3})\s+THB\s*([\d,]+\.\d{2})/;

/** อ่านราคาสุทธิ/จำนวน/ยอดรวม จากแถวราคา — คืนค่าเมื่อคูณแล้วตรงเท่านั้น */
function qtyRow(seg: string): { unit: number; qty: number; total: number } | undefined {
  const m = seg.match(QTY_ROW_RE);
  if (!m) return undefined;
  const unit = Number(m[1].replace(/,/g, "")), qty = Number(m[2]), total = Number(m[3].replace(/,/g, ""));
  if (!unit || !qty || !total) return undefined;
  return Math.abs(unit * qty - total) <= Math.max(1, total * 0.005) ? { unit, qty, total } : undefined;
}

/** ระยะบรรทัดสูงสุดที่ยังนับว่า "อยู่ในช่องตารางเดียวกัน" กับแถวรายการ */
const ROW_SPAN = 6;

/**
 * แถวที่ "จำนวนอยู่ท้ายบรรทัดรุ่น แต่ราคาอยู่คนละบรรทัด"
 * เช่น ใบ C20726201-017 รายการ 3: บรรทัดบนเป็น "THB 248,700.00 THB 248,700.00 THB 497,400.00"
 * ส่วนบรรทัดรุ่นลงท้ายด้วย "2" → จับคู่ราคา×จำนวน=ยอดรวม ในช่องเดียวกันให้ตรงก่อนจึงรับค่า
 */
function qtyFromTrailing(rowLine: string, seg: string): { unit: number; qty: number; total: number } | undefined {
  const qty = Number(rowLine.match(/\s(\d{1,3})\s*$/)?.[1]);
  if (!qty) return undefined;
  const amounts = [...seg.matchAll(/THB\s*([\d,]+\.\d{2})/gi)].map((m) => Number(m[1].replace(/,/g, "")));
  for (let i = 0; i < amounts.length; i++) {
    for (let j = i + 1; j < amounts.length; j++) {
      if (Math.abs(amounts[i] * qty - amounts[j]) <= Math.max(1, amounts[j] * 0.005)) {
        return { unit: amounts[i], qty, total: amounts[j] };
      }
    }
  }
  return undefined;
}

/** SN ทั้งหมดในข้อความ เรียงตามที่เจอ (ไม่ซ้ำ) */
function snsIn(s: string): string[] {
  return [...new Set([...s.matchAll(SN_RE)].map((m) => m[1]))];
}

export function parseHeli(rawText: string): QuoteParseResult {
  const lines = rawText.split(/\r?\n/);
  const text = rawText.replace(/\s+/g, " ").trim();

  // รหัสอ้างอิง C20726201-125 → ตั้งเลข PI = PI125 (ท้ายรหัส = เลข PI จริง · แก้ได้ในหน้าตรวจ)
  const importRef = text.match(/\b([A-Z]\d{6,9}-\d{2,3}[A-Z]{0,3})\b/)?.[1];
  const piFromRef = importRef ? "PI" + importRef.replace(/^[A-Z]\d{6,9}-/, "") : undefined;
  const date = text.match(/\b(\d{1,2}-[A-Z][a-z]{2}-\d{2,4})\b/)?.[1];

  // ใบ KD = รถสั่งผลิต → ยังไม่มี SN เป็นเรื่องปกติ (ผู้ผลิตให้ SN ตอนผลิตเสร็จ ~60-90 วัน) ดู madeToOrder.ts
  const isKd = isKdRef(importRef, piFromRef) || hasKdMark(text);
  const lead = leadDaysFrom(text);          // "Delivery: 75-90 days" — ใช้แทนค่าคงที่ถ้าใบเขียนไว้

  // ── แบ่งรายการตาม "แถวในตาราง" ──
  // ⭐ (18 ก.ย. 2569 · ใบ C20726201-134): ช่องในตาราง HELI จัดกึ่งกลางแนวตั้ง SN ของรายการหนึ่ง
  //    จึงกระจายอยู่ **ทั้งเหนือและใต้** บรรทัดที่มีชื่อรุ่น การตัดช่วงตั้งแต่ชื่อรุ่นไปข้างหน้า
  //    จะดึง SN ของรายการถัดไปมาปนและทิ้ง SN ของตัวเอง (ใบ 134 อ่านได้ 5 จาก 10 คัน)
  //    → ตอนนี้: หา "แถวรายการ" (บรรทัดที่มีทั้งชื่อรุ่นและแถวราคา) แล้วให้ทุกบรรทัดไปอยู่กับ
  //      แถวที่ **ใกล้ที่สุด** เหมือนที่คนกวาดตาอ่านตาราง
  // "แถวรายการ" = ทุกบรรทัดที่มีชื่อรุ่น — ราคา/จำนวนอาจไม่ได้อยู่บรรทัดเดียวกัน
  // (บางใบตัวเลขตกไปบรรทัดบน/ล่างของช่อง) จึงหาจากช่องรอบๆ ให้ด้วย
  const rowLines = lines
    .map((l, i) => ({ i, l }))
    .filter(({ l }) => modelRe("i").test(l));

  const vehicles: ParsedVehicle[] = [];
  const baseModels = new Set<string>();
  const byModel: QuoteDocCheck["byModel"] = [];   // จำนวนที่ "คอลัมน์ QUANTITY ในเอกสาร" ระบุ

  if (rowLines.length > 0) {
    // แต่ละบรรทัดไปอยู่กับแถวรายการที่ใกล้ที่สุด (ไม่เกิน ROW_SPAN บรรทัด = ความสูงของช่อง)
    const blocks: string[][] = rowLines.map(() => []);
    const inTable: boolean[] = lines.map(() => false);
    // แถวไหนมี "ราคา+จำนวน" อยู่ในบรรทัดตัวเองแล้ว (ใช้ตัดสินตอนระยะเท่ากัน)
    const hasOwnRow = rowLines.map(({ l }) => QTY_ROW_RE.test(l));
    lines.forEach((l, i) => {
      let best = -1, bd = Infinity;
      rowLines.forEach((r, k) => {
        const d = Math.abs(r.i - i);
        if (d < bd) { bd = d; best = k; }
        // ระยะเท่ากันระหว่างแถวบน/ล่าง → ยกให้แถวล่าง **เฉพาะเมื่อแถวบนมีราคาของตัวเองแล้ว**
        // (ใบ 017: บรรทัดราคาของรายการ 3 อยู่กึ่งกลางระหว่างรายการ 2 กับ 3 — รายการ 2 มีราคาครบแล้ว
        //  ส่วนใบที่พิมพ์ราคาไว้ "ใต้" บรรทัดรุ่น บรรทัดนั้นต้องเป็นของแถวบน)
        else if (d === bd && best >= 0 && hasOwnRow[best]) best = k;
      });
      if (best >= 0 && bd <= ROW_SPAN) { blocks[best].push(l); inTable[i] = true; }
    });

    const items = rowLines.map((r, k) => {
      const seg = blocks[k].join(" ");
      return {
        r, seg,
        model: r.l.match(modelRe("i"))![1].toUpperCase(),
        row: qtyRow(r.l) ?? qtyRow(seg) ?? qtyFromTrailing(r.l, seg),   // บรรทัดรุ่น → ช่องรอบๆ → จำนวนท้ายบรรทัด
        sns: snsIn(seg),
      };
    });

    // ⭐ แบ่ง SN ตาม "จำนวนในเอกสาร" เมื่อจำนวนรวมตรงกับ SN ที่อ่านได้ทั้งใบ
    //    ช่อง SN ในตาราง HELI จัดกึ่งกลางแนวตั้ง SN ตัวบนสุด/ล่างสุดจึงอยู่ใกล้แถวข้างเคียง
    //    มากกว่าแถวของตัวเอง (ใบ 034: ควรเป็น 2/5/3 แต่แบ่งตามระยะบรรทัดได้ 3/3/4)
    //    แต่ลำดับของ SN ในหน้ากระดาษเรียงตามรายการเสมอ → ตัดตามจำนวนทีละรายการแม่นกว่า
    const ordered = snsIn(lines.filter((_, i) => inTable[i]).join(" "));
    const qtySum = items.every((it) => it.row) ? items.reduce((n, it) => n + it.row!.qty, 0) : 0;
    if (qtySum > 0 && qtySum === ordered.length) {
      let at = 0;
      for (const it of items) { it.sns = ordered.slice(at, at + it.row!.qty); at += it.row!.qty; }
    }

    items.forEach((it) => {
      baseModels.add(it.model.replace(/-.*$/, ""));
      if (it.row) byModel.push({ model: it.model, qty: it.row.qty, subtotal: it.row.total });
      pushItem({
        model: it.model, cost: it.row?.unit ?? firstPrice(it.seg), docQty: it.row?.qty, sns: it.sns,
        mast: it.r.l.match(MAST_RE)?.[1], valve: it.seg.match(/(\d+)\s*Valves?/i)?.[1],
        fuel: fuelFromText(it.r.l) ?? fuelFromText(it.seg) ?? fuelFromModel(it.model),
      });
    });
  } else {
    // ── ทางสำรอง: ใบที่เรียงบรรทัดไม่ได้ (ข้อความสลับ/สแกน) — ตัดช่วงตามตำแหน่งชื่อรุ่นแบบเดิม ──
    const modelMatches = [...text.matchAll(modelRe("gi"))];
    if (modelMatches.length === 0) {
      return { vendor: "HELI", pi_no: piFromRef, quote_date: date, vehicles: [], rawText };
    }
    const single = modelMatches.length === 1;   // ใบรุ่นเดียว → ใช้ทั้งใบเป็นช่วงของรายการนั้น
    for (let i = 0; i < modelMatches.length; i++) {
      const start = modelMatches[i].index ?? 0;
      const end = i + 1 < modelMatches.length ? (modelMatches[i + 1].index ?? text.length) : text.length;
      const seg = single ? text : text.slice(start, end);
      const model = modelMatches[i][1].toUpperCase();
      baseModels.add(model.replace(/-.*$/, ""));
      const row = qtyRow(seg);
      const cost = row?.unit ?? firstPrice(seg);
      if (row) byModel.push({ model, qty: row.qty, subtotal: row.total });
      pushItem({
        model, cost, docQty: row?.qty,
        sns: [...new Set([...seg.matchAll(SN_RE)].map((m) => m[1]))],
        mast: seg.match(MAST_RE)?.[1], valve: seg.match(/(\d+)\s*Valves?/i)?.[1],
        fuel: fuelFromText(seg) ?? fuelFromModel(model),
      });
    }
  }

  /** สร้างรถของรายการหนึ่ง (แตกตาม SN ที่มี · ไม่มี SN ก็แตกตามจำนวนในเอกสาร) */
  function pushItem(it: {
    model: string; cost?: number; docQty?: number; sns: string[];
    mast?: string; valve?: string; fuel?: string;
  }) {
    const capacity = capacityFromModel(it.model);       // พิกัดยกจากรหัสรุ่น (models.ts)
    const build = (sn?: string): ParsedVehicle => {
      const kd = isKd && !sn;                           // ใบ KD + ยังไม่มี SN = รถสั่งผลิต
      const flags: string[] = [];
      if (!sn && !kd) flags.push("ไม่พบ SN");            // KD ไม่ต้องเตือน — ยังไม่ถึงเวลามี SN
      if (!it.cost) flags.push("ไม่พบราคาทุน");
      if (!it.mast) flags.push("ไม่พบ MAST");
      return {
        brand: "HELI", model: it.model, SN: sn, capacity,
        fuel: it.fuel, mast: it.mast, valve: it.valve,
        cost_price: it.cost, pi_no: piFromRef, import_ref: importRef, vendor: "HELI",
        made_to_order: kd || undefined,
        lead_days: kd ? lead : undefined,
        flags: flags.length ? flags : undefined,
      };
    };
    if (it.sns.length === 0) {
      for (let q = 0; q < (it.docQty ?? 1); q++) vehicles.push(build(undefined));
    } else {
      // จำนวน SN ไม่ตรงคอลัมน์จำนวนในเอกสาร → ไม่เดาเอง ติดธงให้คนตรวจกับใบจริง
      const warn = it.docQty && it.docQty !== it.sns.length
        ? `เอกสารระบุ ${it.docQty} คัน แต่พบ SN ${it.sns.length} ตัว — ตรวจกับใบจริง` : null;
      it.sns.forEach((sn) => {
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
