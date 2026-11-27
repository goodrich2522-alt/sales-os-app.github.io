// lib/warranty.ts — บริการหลังการขาย / รับประกัน (คิดรอบเช็คเป็น "เดือน" · ไม่ใช้ชั่วโมง เพราะแต่ละคันใช้งานต่างกัน)

import { categorizeModel } from "./constants";

export interface SvcRound { date: string; done: boolean; note: string; }
export interface SvcEdit { by: string; at: string; }
export interface SvcData { start: string; terms: string; rounds: SvcRound[]; history?: SvcEdit[]; }

export const SVC_FIELD = "บริการหลังการขาย";
export const DEFAULT_WARRANTY = "เครื่องยนต์ + ชุดเกียร์ 3 ปี · ระบบไฮดรอลิก/เบรก/กล่องคุมไฟฟ้า 6 เดือน · ฟรีค่าตรวจเช็ค 4 รอบ · แนะนำเข้าเช็ค/เปลี่ยนถ่ายทุก 3 เดือน";
// รับประกันมาตรฐานของรถที่ไม่ใช่โฟล์คลิฟท์ (ไม่มีรอบเช็คฟรี)
export const HYDRAULIC_WARRANTY = "รับประกันระบบไฮดรอลิค 1 ปี";
// รีชสแตกเกอร์ (CQDM · ยืนขับ) — ตัวขับเป็นมอเตอร์ไฟฟ้าล้วน ไม่มีเครื่องยนต์/ไฮดรอลิกแบบโฟล์คลิฟท์
// (26 ก.ย. 2569 · ผู้ใช้ระบุ — CQD กับ CQDM ใช้เงื่อนไขคนละแบบ)
export const MOTOR_WARRANTY = "รับประกันมอเตอร์ขับเคลื่อน · มอเตอร์ยก · กล่องควบคุม 1 ปี";

/**
 * ชนิดรถที่ใช้ตัดสินเงื่อนไขประกัน (27 พ.ย. 2569)
 *
 * ที่มา: ดีลที่ค้าง "ยังไม่ลงรับประกัน" ส่วนหนึ่งค้างเพราะช่อง "หมวดรถ" ว่าง
 * → defaultWarrantyTerms คืน "" → เติมอัตโนมัติไม่ได้ → ค้างวนอยู่อย่างนั้น
 * ช่องหมวดรถว่างเมื่อไหร่ ให้เดาจากรหัสรุ่นแทน (กติกาเดียวกับที่จัดหมวดใน DB)
 */
export const warrantyCategoryOf = (f: { vehicle_category?: string; model?: string }): string =>
  String(f.vehicle_category ?? "").trim() || (f.model ? categorizeModel(String(f.model)) : "");

/**
 * เงื่อนไขรับประกันมาตรฐานตามชนิดรถ — คืน "" ถ้ายังไม่มีข้อความมาตรฐานของชนิดนั้น (ต้องพิมพ์เอง)
 * ใช้ที่เดียวกันทั้งกล่องกรอกและปุ่มเติมย้อนหลัง จะได้ไม่หลุดกัน
 */
export const defaultWarrantyTerms = (isForklift: boolean, category?: string): string => {
  const cat = String(category ?? "");
  // รีชทรัค (CQD · นั่งขับ) ใช้เงื่อนไขเดียวกับโฟล์คลิฟท์ (26 ก.ย. 2569 · ผู้ใช้ระบุ)
  if (isForklift || cat === "Reach Truck") return DEFAULT_WARRANTY;
  // รีชสแตกเกอร์ (CQDM · ยืนขับ) คนละแบบกับรีชทรัค — รับประกันมอเตอร์/กล่องคุม 1 ปี
  if (cat === "Reach Stacker") return MOTOR_WARRANTY;
  // รถลากไฟฟ้า ใช้เงื่อนไขเดียวกับแฮนด์ลิฟท์ (25 ก.ย. 2569 · ผู้ใช้ยืนยัน)
  return ["Handlift", "Stacker", "Electric Pallet Truck"].includes(cat) ? HYDRAULIC_WARRANTY : "";
};

export const SVC_ROUNDS = 4;               // จำนวนรอบเช็คฟรี
export const SVC_INTERVAL_MONTHS = 3;      // ระยะห่างต่อรอบ (เดือน)
export const SVC_SOON_DAYS = 30;           // ถือว่า "ใกล้ถึงกำหนด" เมื่อเหลือ ≤ กี่วัน

export const emptySvcRounds = (): SvcRound[] => Array.from({ length: SVC_ROUNDS }, () => ({ date: "", done: false, note: "" }));

/** วันที่อยู่ในรูปแบบ YYYY-MM-DD จริงไหม — ใช้ตัดสินว่า "ลงวันแล้ว" ที่เดียวทั้งไฟล์ */
export const isISODate = (v: unknown): boolean => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "").slice(0, 10));

/**
 * วันที่ "วันนี้" ตามเวลาเครื่อง (YYYY-MM-DD)
 * ⚠️ ห้ามใช้ new Date().toISOString() — นั่นคือเวลา UTC ซึ่งไทยเร็วกว่า 7 ชม.
 *    ก่อน 07:00 น. UTC ยังเป็น "เมื่อวาน" → วันที่ที่บันทึกจะเพี้ยนไป 1 วัน
 */
export const todayISO = (now: Date = new Date()): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

/**
 * บวกเดือนแบบปลอดภัย (รับ YYYY-MM-DD) → YYYY-MM-DD
 *
 * ── บั๊ก 2 ตัวที่เคยอยู่ในนี้ (27 พ.ย. 2569) ──
 * 1) คืนค่าผ่าน toISOString() ซึ่งแปลงกลับเป็น UTC — เที่ยงคืนตามเวลาไทยคือ 17:00 ของ
 *    "เมื่อวาน" ใน UTC → **วันครบกำหนดทุกรอบเร็วไป 1 วัน** ทั้งระบบ
 * 2) setMonth ปล่อยให้วันล้นเดือน: 30 พ.ย. +3 เดือน → "30 ก.พ." → เด้งไป 2 มี.ค.
 *    ต้องตัดลงเป็นวันสุดท้ายของเดือนปลายทาง (28/29 ก.พ.) ตามที่คนเข้าใจ
 * → คิดด้วยเลขปี/เดือน/วันตรง ๆ ไม่ผ่าน Date เลย จะได้ไม่มีโซนเวลามาเกี่ยว
 */
export const addMonths = (dateStr: string, months: number): string => {
  const s = String(dateStr || "").slice(0, 10);
  if (!isISODate(s)) return "";
  const [y, m, d] = s.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const nd = Math.min(d, lastDay);
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
};

// อ่านข้อมูลบริการหลังการขายจาก forklift.custom_fields["บริการหลังการขาย"] (JSON)
export const parseSvc = (f?: { custom_fields?: Record<string, string> | null; received_date?: string }): SvcData | null => {
  const raw = f?.custom_fields?.[SVC_FIELD];
  if (!raw) return null;
  try {
    const p = JSON.parse(String(raw));
    return {
      start: p.start || f?.received_date || "",
      terms: p.terms || DEFAULT_WARRANTY,
      rounds: Array.isArray(p.rounds) && p.rounds.length ? p.rounds : emptySvcRounds(),
      history: Array.isArray(p.history) ? p.history : [],
    };
  } catch { return null; }
};

// รถประเภทนี้ลงข้อมูลบริการหลังการขาย "ครบ" หรือยัง (มีวันเริ่ม + เงื่อนไขรับประกัน) — ใช้กันจ่ายค่าคอม
export const warrantyFilled = (f?: { custom_fields?: Record<string, string> | null }): boolean => {
  const raw = f?.custom_fields?.[SVC_FIELD];
  if (!raw) return false; // ยังไม่เคยบันทึก
  try {
    const p = JSON.parse(String(raw));
    return !!(String(p.start ?? "").trim() && String(p.terms ?? "").trim());
  } catch { return false; }
};

// วันกำหนดของรอบ i (chained): รอบแรก = วันเริ่ม + 3 เดือน · รอบถัดไป = (วันเข้าจริงรอบก่อน ถ้ามี ไม่งั้นกำหนดรอบก่อน) + 3 เดือน
export const roundDue = (svc: SvcData, i: number): string => {
  if (i <= 0) return addMonths(svc.start, SVC_INTERVAL_MONTHS);
  const prev = svc.rounds[i - 1];
  const anchor = isISODate(prev?.date) ? prev.date : roundDue(svc, i - 1);
  return addMonths(anchor, SVC_INTERVAL_MONTHS);
};

// รอบถัดไปที่ยังไม่เช็ค + วันกำหนด (null = เช็คครบทุกรอบแล้ว)
export const nextDue = (svc: SvcData): { index: number; due: string } | null => {
  for (let i = 0; i < svc.rounds.length; i++) {
    if (!svc.rounds[i].done) return { index: i, due: roundDue(svc, i) };
  }
  return null;
};

// จำนวนวันจากวันนี้ถึง due (ลบ = เกินกำหนดแล้ว) · ต้องส่ง todayISO เข้ามา (YYYY-MM-DD) เพื่อไม่ผูกกับ new Date ในไลบรารี
export const daysUntil = (dueISO: string, todayISO: string): number | null => {
  const d = String(dueISO || "").slice(0, 10), t = String(todayISO || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return Math.round((new Date(d + "T00:00:00").getTime() - new Date(t + "T00:00:00").getTime()) / 86400000);
};

/**
 * ── บันทึกรอบเช็ค 1 รอบ แล้วให้รอบถัดไปคำนวณต่อเองอัตโนมัติ (27 พ.ย. 2569 · ผู้ใช้สั่ง) ──
 *
 * roundDue ผูกรอบถัดไปไว้กับ "วันเข้าจริงของรอบก่อน" อยู่แล้ว แต่พังเงียบ ๆ 2 ทาง:
 *   · ติ๊ก "เช็คแล้ว" แต่ไม่ได้ลงวัน → ไม่มีวันให้เกาะ → ถอยไปนับจากกำหนดเดิม
 *     ช่างไปเช็คช้า 1 เดือน รอบถัดไปก็ยังขึ้นกำหนดเดิม = ตารางเพี้ยนสะสมไปทุกรอบ
 *   · ลงวันเข้าจริงแต่ลืมติ๊ก → ระบบยังนับว่ารอบนั้นค้าง เตือนรอบที่ไปเช็คมาแล้ว
 * → ทำสองอย่างนี้ให้อัตโนมัติ คนกรอกอย่างเดียวพอ
 *
 * ⚠️ ติ๊กออก = ยังไม่ได้เช็ค แต่ "วันที่" เป็นข้อมูลที่คนกรอกเอง ห้ามลบทิ้งให้
 */
export const applyRoundChange = (
  rounds: SvcRound[], i: number, patch: Partial<SvcRound>, today: string,
): SvcRound[] => rounds.map((r, j) => {
  if (j !== i) return r;
  const next: SvcRound = { ...r, ...patch };
  // ติ๊กว่าเช็คแล้วแต่ยังไม่มีวัน → ลงวันนี้ให้ (ยังแก้ทับได้ ถ้าช่างไปเช็ควันอื่น)
  if (patch.done === true && !isISODate(next.date) && isISODate(today)) next.date = today;
  // ลงวันเข้าจริงเมื่อไหร่ = เช็คแล้ว ไม่ต้องติ๊กซ้ำอีกที
  if (isISODate(patch.date)) next.done = true;
  return next;
});

/** ป้ายบอกสถานะวันครบกำหนด — ใช้ข้อความ/สีเดียวกันทุกที่ที่โชว์รอบเช็ค */
export type DueTone = "overdue" | "soon" | "ok" | "none";
export const dueStatus = (due: string, today: string): { label: string; tone: DueTone } => {
  const n = daysUntil(due, today);
  if (n === null) return { label: "", tone: "none" };
  if (n < 0) return { label: `เกินกำหนดมา ${-n} วัน`, tone: "overdue" };
  if (n === 0) return { label: "ครบกำหนดวันนี้", tone: "overdue" };
  return { label: `อีก ${n} วัน`, tone: n <= SVC_SOON_DAYS ? "soon" : "ok" };
};

/**
 * ── สร้างข้อมูลบริการหลังการขายจากค่ามาตรฐาน ──
 * (3 ต.ค. 2569 · ผู้ใช้บอกว่าไม่อยากเจอกล่องแดง "ยังบันทึกไม่ได้" บ่อย ๆ)
 *
 * กล่องรับประกันเติมค่าให้อยู่แล้ว (วันเริ่ม = วันส่งมอบ · เงื่อนไข = มาตรฐานตามชนิดรถ)
 * เหลือแค่ "กดปุ่มบันทึกในกล่องนั้น" ซึ่งคนมักลืม แล้วไปเจอกล่องแดงตอนกดปิดการขาย
 * → ถ้าค่ามาตรฐานครบอยู่แล้ว ให้บันทึกให้เลยตอนปิดการขาย ไม่ต้องมีกล่องแดง
 *
 * คืน null เมื่อ "เติมเองไม่ได้" (ไม่มีวันส่งมอบ หรือชนิดรถยังไม่มีเงื่อนไขมาตรฐาน)
 * — กรณีนั้นยังต้องให้คนกรอกเอง เพราะเดาไม่ได้
 */
/** ข้อความกำกับว่าแถวนี้ "ระบบเติมให้" ไม่ใช่คนกรอก — ใช้ตัดสินว่ายังให้ฝ่ายขายแก้ได้ไหม */
export const SYSTEM_FILL_MARK = "ระบบเติมค่ามาตรฐาน";

export const buildDefaultSvc = (
  f: { received_date?: string; vehicle_category?: string; model?: string; custom_fields?: Record<string, string> | null },
  deliveryDate: string,
  actor: string,
): SvcData | null => {
  if (warrantyFilled(f)) return null;                 // มีอยู่แล้ว ไม่ต้องทับ
  // ⚠️ วันเริ่มประกัน = **วันส่งมอบ** เท่านั้น (กติกาข้อ 8) — ห้ามถอยไปใช้วันรับรถเข้าคลัง
  //    วันรับรถคือวันที่รถมาถึงโกดัง ไม่ใช่วันที่ลูกค้าได้รถ ใช้แทนกันไม่ได้
  const start = String(deliveryDate || "").trim();
  const cat = warrantyCategoryOf(f);
  const terms = defaultWarrantyTerms(cat === "Forklift", cat);
  if (!start || !terms) return null;                  // เดาไม่ได้ → ให้คนกรอกเอง
  return {
    start, terms, rounds: emptySvcRounds(),
    history: [{ by: `${actor || "-"} (${SYSTEM_FILL_MARK}ให้ตอนปิดการขาย)`, at: new Date().toLocaleString("th-TH") }],
  };
};

/**
 * ข้อมูลรับประกันชุดนี้ "ระบบเติมให้" หรือ "คนกรอกเอง" (27 พ.ย. 2569)
 *
 * กติกาเดิม: ฝ่ายขายลงข้อมูลแล้ว → ล็อก แก้ไม่ได้ (แก้ได้เฉพาะสต็อก/แอดมิน)
 * พอระบบเติมให้อัตโนมัติ กติกานั้นจะล็อกค่าที่ "ระบบเดา" ไปด้วย ฝ่ายขายแก้ให้ถูกไม่ได้เลย
 * → ตราบใดที่ยังเป็นค่าที่ระบบเติม ให้ฝ่ายขายแก้ทับได้ · พอคนแก้แล้วค่อยล็อกตามเดิม
 */
export const isSystemFilled = (f?: { custom_fields?: Record<string, string> | null }): boolean => {
  const svc = parseSvc(f);
  const last = svc?.history?.[0];                     // แถวบนสุด = ล่าสุด
  return !!last && String(last.by ?? "").includes(SYSTEM_FILL_MARK);
};
