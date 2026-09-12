// lib/format.ts — ฟังก์ชันจัดรูปแบบที่ใช้ร่วมทั้งแอป (เฟส 1: รวม helper ที่เดิมซ้ำหลายหน้า)
import { TH_MONTHS_1BASED } from "./constants";
import type { Forklift } from "./types";

/** ชื่อเดือนไทยย่อจากเลขเดือน 1-12 (คืน "" ถ้านอกช่วง) */
export const thaiMonthShort = (month1to12: number): string =>
  TH_MONTHS_1BASED[month1to12] ?? "";

/** วันที่ ISO (YYYY-MM-DD) → "7 ก.ค. 2569" (พ.ศ.) · คืนค่าเดิมถ้าแปลงไม่ได้ */
export function thaiDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return iso || "";
  return `${+m[3]} ${thaiMonthShort(+m[2])} ${+m[1] + 543}`;
}

/** วันที่ ISO → "7 ก.ค. 69" (พ.ศ. 2 หลัก) — แบบสั้นสำหรับพื้นที่จำกัด */
export function thaiDateShort(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return iso || "";
  return `${+m[3]} ${thaiMonthShort(+m[2])} ${(+m[1] + 543) % 100}`;
}

/** วันนี้เป็น ISO (YYYY-MM-DD) */
export const today = (): string => new Date().toISOString().slice(0, 10);

/** ตัวเลข → รูปแบบเงินไทย เช่น 252000 → "252,000" (ไม่มีสัญลักษณ์ ฿) */
export const formatBaht = (n: number | string | null | undefined): string => {
  const num = typeof n === "number" ? n : Number(String(n ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(num) ? num.toLocaleString("th-TH") : "0";
};

/** จำนวนวันจากวันนี้ถึงวันที่กำหนด (บวก = อนาคต, ลบ = ผ่านมาแล้ว) · null ถ้าไม่มีวันที่ */
export function daysUntil(iso: string | null | undefined): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return null;
  const target = new Date(+m[1], +m[2] - 1, +m[3]).getTime();
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((target - now.getTime()) / 86400000);
}

/** รหัสสเปกรถ (รุ่น/ยกสูง/วาล์ว/งา/อุปกรณ์/น้ำหนักยก/เชื้อเพลิง) — ใช้เทียบสเปกรถซ้ำ */
export const specCode = (f: Partial<Forklift>): string =>
  [f.model, f.height, f.control_type, f.fork_length, f.attachments, f.capacity_kg, f.fuel]
    .map(v => (v == null ? "" : String(v)).trim())
    .filter(Boolean)
    .join(" / ");

/** บวกวันจากวันที่ ISO → ISO (คืน "" ถ้าวันที่ไม่ถูกรูปแบบ) — ใช้คำนวณวันคาดรับรถสั่งผลิต */
export function addDays(iso: string | null | undefined, n: number): string {
  const d = String(iso ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
  const dt = new Date(d + "T00:00:00");
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().slice(0, 10);
}
