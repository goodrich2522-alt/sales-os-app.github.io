// lib/warranty.ts — บริการหลังการขาย / รับประกัน (คิดรอบเช็คเป็น "เดือน" · ไม่ใช้ชั่วโมง เพราะแต่ละคันใช้งานต่างกัน)

export interface SvcRound { date: string; done: boolean; note: string; }
export interface SvcEdit { by: string; at: string; }
export interface SvcData { start: string; terms: string; rounds: SvcRound[]; history?: SvcEdit[]; }

export const DEFAULT_WARRANTY = "เครื่องยนต์ + ชุดเกียร์ 3 ปี · ระบบไฮดรอลิก/เบรก/กล่องคุมไฟฟ้า 6 เดือน · ฟรีค่าตรวจเช็ค 4 รอบ · แนะนำเข้าเช็ค/เปลี่ยนถ่ายทุก 3 เดือน";
// รับประกันมาตรฐานของรถที่ไม่ใช่โฟล์คลิฟท์ (ไม่มีรอบเช็คฟรี)
export const HYDRAULIC_WARRANTY = "รับประกันระบบไฮดรอลิค 1 ปี";

/**
 * เงื่อนไขรับประกันมาตรฐานตามชนิดรถ — คืน "" ถ้ายังไม่มีข้อความมาตรฐานของชนิดนั้น (ต้องพิมพ์เอง)
 * ใช้ที่เดียวกันทั้งกล่องกรอกและปุ่มเติมย้อนหลัง จะได้ไม่หลุดกัน
 */
export const defaultWarrantyTerms = (isForklift: boolean, category?: string): string => {
  if (isForklift) return DEFAULT_WARRANTY;
  return category === "Handlift" || category === "Stacker" ? HYDRAULIC_WARRANTY : "";
};

export const SVC_ROUNDS = 4;               // จำนวนรอบเช็คฟรี
export const SVC_INTERVAL_MONTHS = 3;      // ระยะห่างต่อรอบ (เดือน)
export const SVC_SOON_DAYS = 30;           // ถือว่า "ใกล้ถึงกำหนด" เมื่อเหลือ ≤ กี่วัน

export const emptySvcRounds = (): SvcRound[] => Array.from({ length: SVC_ROUNDS }, () => ({ date: "", done: false, note: "" }));

// บวกเดือนแบบปลอดภัย (รับ YYYY-MM-DD) → YYYY-MM-DD
export const addMonths = (dateStr: string, months: number): string => {
  const s = String(dateStr || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const d = new Date(s + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
};

// อ่านข้อมูลบริการหลังการขายจาก forklift.custom_fields["บริการหลังการขาย"] (JSON)
export const parseSvc = (f?: { custom_fields?: Record<string, string> | null; received_date?: string }): SvcData | null => {
  const raw = f?.custom_fields?.["บริการหลังการขาย"];
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
  const raw = f?.custom_fields?.["บริการหลังการขาย"];
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
  const anchor = (prev?.date && /^\d{4}-\d{2}-\d{2}$/.test(String(prev.date).slice(0, 10))) ? prev.date : roundDue(svc, i - 1);
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
