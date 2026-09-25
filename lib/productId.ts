// lib/productId.ts — รหัสรถในระบบ
// ⚠️ เลิกใช้รหัสสินค้าอัตโนมัติ (FK-0001/ST-0001/HL-0001) ตั้งแต่ 27 ก.ค. 2569
//    ตอนนี้ **SN คือรหัสหลัก** (forklifts.id = SN) — กติกาเต็มอยู่ที่ SN-RULES.md
//    เหตุผล: ทีมจำ/ค้นด้วยเลขที่ติดอยู่บนตัวรถได้เลย ไม่ต้องเทียบสองระบบ
import { Forklift } from "./types";

/** รหัสพิเศษที่ไม่ใช่ SN ตรงๆ — ต่อท้ายด้วย #N (ดู SN-RULES.md ข้อ 5) */
const SPECIAL = /#\d+$/;

/** รหัสนี้เป็นรหัสชั่วคราวของรถสั่งผลิตที่ยังไม่มี SN หรือไม่ (เช่น PI058KD#1) */
export function isPendingId(id: unknown): boolean {
  const s = String(id ?? "");
  return SPECIAL.test(s) && /^PI/i.test(s);
}

/** รหัสนี้เป็นคันที่ SN ซ้ำกับคันอื่นหรือไม่ (เช่น SDA1530-0004#2) */
export function isDuplicateSnId(id: unknown): boolean {
  const s = String(id ?? "");
  return SPECIAL.test(s) && !/^PI/i.test(s);
}

/**
 * ป้ายที่แสดงบนการ์ด/หน้าจอ — เลขจริงเท่านั้น
 * ⛔ กติกาถาวร (ผู้ใช้สั่ง): ห้ามโชว์รหัสชั่วคราว `<PI>#<N>` / `<SN>#<N>` ที่ไหนเลย — สับสน
 * ใช้ SN เป็นหลัก · รถสั่งผลิตยังไม่มี SN → โชว์เลข PI · ตัด `#N` ทิ้งเสมอเป็นด่านสุดท้าย
 */
export function displayCode(f: Pick<Forklift, "id" | "SN" | "pi_no">): string {
  const strip = (s: string) => s.replace(/#\d+$/, "");        // กันรหัสชั่วคราว #N หลุดออกจอ
  const sn = String(f.SN ?? "").trim();
  if (sn) return strip(sn);
  if (isPendingId(f.id)) return String(f.pi_no ?? "").trim() || strip(String(f.id ?? "")); // PI103#3 → PI103
  return strip(String(f.id ?? ""));
}

/**
 * สร้างรหัสรถจาก SN — ใช้ตอนเพิ่มรถใหม่
 * SN ซ้ำกับที่มีอยู่ → เติม #2, #3 ... ตามลำดับ (กรณีผู้ผลิตใส่ SN ซ้ำ)
 * ยังไม่มี SN → ใช้ `<เลข PI>#<ลำดับ>` เป็นรหัสชั่วคราวจนกว่ารถจะมาถึง
 */
export function buildForkliftId(
  sn: string,
  piNo: string,
  existing: Pick<Forklift, "id">[],
): string {
  const taken = new Set(existing.map(f => String(f.id ?? "")));
  const nextFree = (base: string) => {
    if (!taken.has(base)) return base;
    for (let i = 2; ; i++) if (!taken.has(`${base}#${i}`)) return `${base}#${i}`;
  };

  const clean = String(sn ?? "").trim().toUpperCase();
  if (clean) {
    // คันแรกของ SN นั้นใช้ SN ตรงๆ · คันถัดไปเติม #2, #3
    return nextFree(clean);
  }
  const pi = String(piNo ?? "").trim().toUpperCase() || "NOPI";
  for (let i = 1; ; i++) if (!taken.has(`${pi}#${i}`)) return `${pi}#${i}`;
}

/**
 * ป้ายเลข PI สำหรับแสดงผล — กันคำว่า "PI" ซ้ำ (25 ก.ย. 2569)
 * เลข PI ของ HELI ขึ้นต้นด้วย PI อยู่แล้ว (PI110KD) ป้ายเดิมเติม "PI " ให้อีกชั้น
 * เลยกลายเป็น "PI PI110KD" — อ่านสับสนและก๊อปไปค้นหาต่อไม่เจอ
 */
export function piLabel(piNo?: string | null): string {
  const s = String(piNo ?? "").trim();
  if (!s) return "";
  return /^pi\b|^pi[-_ ]?\d/i.test(s) ? s : `PI ${s}`;
}
