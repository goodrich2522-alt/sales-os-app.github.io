// lib/quoteImport/madeToOrder.ts — กติกา "รถสั่งผลิต (KD)"
// เอกสารสั่งซื้อที่เลข PI / รหัสอ้างอิงนำเข้า **ลงท้ายด้วย KD** = รถสั่งผลิต
// ตอนออกเอกสารยังไม่มี SN — ผู้ผลิตให้ SN ตอนผลิตเสร็จ ประมาณ 60-90 วันนับจากวันสั่ง
// ดังนั้น "ไม่มี SN" ในใบ KD = ปกติ ไม่ใช่ข้อผิดพลาด (ห้ามติดธงเตือน)
// ตัวอย่างจริงจากข้อมูลบริษัท: PI045KD · PI058KD · PI013-KD · PI-087KD · รหัสอ้างอิง C20726201-131KD
// กติกาเต็มอยู่ที่ SN-RULES.md ข้อ 5.ข

/** ช่วงเวลารอ SN ของรถสั่งผลิต (วัน) — ตรงกับที่หน้าสต็อกใช้แจ้งเตือนอยู่แล้ว */
export const KD_LEAD_MIN_DAYS = 60;
export const KD_LEAD_MAX_DAYS = 90;

/** ต่อท้ายด้วย KD — ต้องมีตัวเลขนำหน้า (กัน "KD" ที่บังเอิญติดมากับคำอื่น) */
const KD_TAIL = /\d\s*[-.]?\s*KD$/i;

/** เลข PI / รหัสอ้างอิงชุดนี้บอกว่าเป็นรถสั่งผลิตหรือไม่ */
export function isKdRef(...refs: (string | null | undefined)[]): boolean {
  return refs.some((r) => KD_TAIL.test(String(r ?? "").trim()));
}

/** หา KD จากข้อความทั้งใบ — เผื่อ parser จับ suffix ไม่ติด (PI เว้นวรรค/ขึ้นบรรทัดใหม่) */
export function hasKdMark(text: string): boolean {
  return /\bP\s*\/?\s*I\s*[-.\s]?\s*\d{2,4}\s*[-.]?\s*KD\b/i.test(text)   // PI045KD · P/I 045-KD
    || /\b[A-Z]\d{6,9}-\d{2,4}\s*[-.]?\s*KD\b/i.test(text);              // C20726201-131KD
}
