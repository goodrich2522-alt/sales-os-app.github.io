// lib/constants.ts — ค่าคงที่ที่ใช้ร่วมทั้งแอป (เฟส 1: รวมของซ้ำมาไว้ที่เดียว)
// เดิมกระจายซ้ำในหน้า sales/stock/dashboard ค่าไม่ตรงกัน + สถานะใหม่ไม่มีสี → รวมที่นี่ที่เดียว

import type { VehicleType } from "./types";

// ── ชนิดรถ (vehicle_category) — label ไทย + icon ใช้ร่วม stock/sales ──────────
// 6 ชนิด: รถยก / รถลากไฟฟ้า / รถลากมือ / รถยกสูง / รีชทรัค / รีชสแตกเกอร์ (จัดตามรหัสรุ่น ดู STOCK-SPEC-FIX-PLAN.md)
export const VEHICLE_CATS: { key: VehicleType; label: string; icon: string }[] = [
  { key: "Forklift",              label: "โฟล์คลิฟท์", icon: "🚜" },
  { key: "Electric Pallet Truck", label: "รถลากไฟฟ้า", icon: "🔋" },
  { key: "Handlift",              label: "แฮนด์ลิฟท์", icon: "🔧" },
  { key: "Stacker",               label: "สแตกเกอร์",  icon: "📦" },
  { key: "Reach Truck",           label: "รีชทรัค",    icon: "🏗️" },
  { key: "Reach Stacker",         label: "รีชสแตกเกอร์", icon: "🛗" },
];
/** ตัวเลือกกรองชนิดรถ (รวม "all") */
export type CatFilter = "all" | VehicleType;

/** จัดชนิดรถจากรหัสรุ่น — กติกาเดียวกับที่จัดใน DB (ดู STOCK-SPEC-FIX-PLAN.md) */
export function categorizeModel(model: string): VehicleType {
  const m = (model || "").trim();
  if (/^(CPCD|CPD|EFL)/i.test(m)) return "Forklift"; // EFL = EP Electric Forklift
  if (/^(CBD|CBS)/i.test(m)) return "Electric Pallet Truck";
  if (/^CQDM/i.test(m)) return "Reach Stacker";  // CQDM = ยืนขับ มีแท่นยืน+แขนจับ (ต้องเช็คก่อน CQD)
  if (/^CQD/i.test(m)) return "Reach Truck";      // CQD = Reach Truck นั่งขับ
  if (/^(CDD|EPS|PS|WMS|WDS|SDA|DG|PTS|PD|BFG)/i.test(m)) return "Stacker"; // DG = ครอบคลุม DGB + DG series (lift table)
  return "Handlift"; // BF/AC/PWH/WS/CNS/WH/HLD/HLS/EHLS ...
}

// ── สีป้ายสถานะรถ (forklift.status) ─────────────────────────────────────────
// ครอบคลุมทุกสถานะที่ใช้จริง รวมของใหม่ (สั่งผลิต/รถเช่า/เคลม/รับกลับ) ที่เดิมไม่มีสี
export const STATUS_BADGE: Record<string, string> = {
  "พร้อมขาย":       "bg-emerald-100 text-emerald-700 border-emerald-200",
  "จอง":            "bg-amber-100 text-amber-700 border-amber-200",
  "จองแล้ว":        "bg-amber-100 text-amber-700 border-amber-200",
  "ติดจอง":         "bg-amber-100 text-amber-700 border-amber-200",
  "ติดจอง/รอส่ง":   "bg-orange-100 text-orange-700 border-orange-200",
  "รอรับ":          "bg-sky-100 text-sky-700 border-sky-200",
  "รอยืนยันนำเข้าสต็อก": "bg-blue-100 text-blue-700 border-blue-200",
  "รออนุมัติสต็อก":      "bg-orange-100 text-orange-700 border-orange-200",
  "รอผ่านไฟแนนซ์":  "bg-red-100 text-red-700 border-red-200",
  // ── 4 สถานะปิดการขายใหม่ ──
  "มัดจำแล้ว":            "bg-amber-100 text-amber-700 border-amber-200",
  "รอจัดส่ง":             "bg-orange-100 text-orange-700 border-orange-200",
  "รอไฟแนนซ์":           "bg-red-100 text-red-700 border-red-200",
  "ปิดการขาย/จัดส่งแล้ว": "bg-indigo-100 text-indigo-700 border-indigo-200",
  "สั่งผลิต":        "bg-violet-100 text-violet-700 border-violet-200",
  "รถเช่า":          "bg-teal-100 text-teal-700 border-teal-200",
  "เคลม/รับกลับ":    "bg-rose-100 text-rose-700 border-rose-200",
  "ปิดการขายแล้ว":  "bg-indigo-100 text-indigo-700 border-indigo-200",
  "ส่งมอบแล้ว":     "bg-slate-100 text-slate-600 border-slate-200",
  "ซ่อมบำรุง":      "bg-red-100 text-red-700 border-red-200",
  "รอตรวจสอบ":     "bg-blue-100 text-blue-700 border-blue-200",
  // ── ชุดสถานะรวม (ใช้ทั้งหน้าขาย+สต็อก) 5 ส.ค. 2026 ──
  "ติดจอง (รอโอนมัดจำ)": "bg-amber-100 text-amber-700 border-amber-200",
  "มัดจำแล้ว/เงินสด":     "bg-orange-100 text-orange-700 border-orange-200",
  "มัดจำแล้ว/ไฟแนนซ์":    "bg-red-100 text-red-700 border-red-200",
  "รอตรวจสอบสต็อก":       "bg-blue-100 text-blue-700 border-blue-200",
};

/** สีป้ายสถานะ — ถ้าไม่รู้จักสถานะ คืนสีเทากลางๆ (กันจอพังเมื่อเจอค่าสะกดแปลก) */
export const statusBadgeClass = (status: unknown): string =>
  STATUS_BADGE[String(status ?? "").trim()] ?? "bg-slate-100 text-slate-600 border-slate-200";

// ── สีป้ายสถานะการขาย (sale.sale_status) ────────────────────────────────────
export const SALE_STATUS_BADGE: Record<string, string> = {
  "จอง/รอโอน":           "bg-yellow-100 text-yellow-800 border-yellow-200",
  "จอง/โอนมัดจำแล้ว":     "bg-amber-100 text-amber-700 border-amber-200",
  "มัดจำแล้ว":            "bg-amber-100 text-amber-700 border-amber-200",
  "รอจัดส่ง":             "bg-orange-100 text-orange-700 border-orange-200",
  "รอไฟแนนซ์":           "bg-red-100 text-red-700 border-red-200",
  "ปิดการขาย/จัดส่งแล้ว": "bg-emerald-100 text-emerald-700 border-emerald-200",
  // เก่า
  "ขายแล้ว":        "bg-emerald-100 text-emerald-700 border-emerald-200",
  "จอง":            "bg-amber-100 text-amber-700 border-amber-200",
  "รอผ่านไฟแนนซ์":  "bg-red-100 text-red-700 border-red-200",
  "คืนสินค้า":       "bg-rose-100 text-rose-700 border-rose-200",
};

export const saleStatusBadgeClass = (status: unknown): string =>
  SALE_STATUS_BADGE[String(status ?? "ขายแล้ว").trim()] ?? "bg-slate-100 text-slate-600 border-slate-200";

// จัดกลุ่มสถานะการขายให้เหลือชุดเดียว (ใช้ในตัวกรองประวัติการขาย)
// ขายแล้ว = ปิดการขาย/จัดส่งแล้ว · รอไฟแนนซ์ = รอผ่านไฟแนนซ์ · มัดจำแล้ว → จอง/โอนมัดจำแล้ว
export const saleStatusGroup = (status: unknown): string => {
  const st = String(status ?? "ขายแล้ว").trim();
  if (st.includes("คืนสินค้า") || st.includes("คืนแล้ว")) return "คืนสินค้า"; // ลูกค้าคืน — เก็บประวัติ ไม่นับยอด
  if (!st || st.includes("ปิด") || st.includes("จัดส่งแล้ว") || st.includes("ส่งมอบ") || st === "ขายแล้ว") return "ขายแล้ว/ปิดการขาย";
  if (st.includes("ไฟแนนซ์")) return "รอไฟแนนซ์";
  if (st.includes("มัดจำ")) return "จอง/โอนมัดจำแล้ว";
  if (st.includes("จอง")) return "จอง/รอโอน";
  if (st.includes("รอจัดส่ง") || st.includes("รอโอน")) return "รอจัดส่ง";
  return st;
};

// ── สีป้ายการชำระเงิน/ประเภทบิล (sale.payment_type) ──
// เงินสด/บิลเงินสด(CH) = เขียว · บิลแวท(IV) = ฟ้า · ไฟแนนซ์ = ส้ม · ว่าง = เทา "ไม่ระบุ"
export const PAYMENT_BADGE: Record<string, string> = {
  "เงินสด": "bg-emerald-100 text-emerald-700",
  "เงินสด (NO VAT)": "bg-teal-100 text-teal-700",
  "บิลเงินสด": "bg-emerald-100 text-emerald-700",
  "บิลแวท": "bg-sky-100 text-sky-700",
  "ไฟแนนซ์": "bg-amber-100 text-amber-700",
  "เครดิต": "bg-violet-100 text-violet-700",
};
export const paymentBadgeClass = (p: unknown): string =>
  PAYMENT_BADGE[String(p ?? "").trim()] ?? "bg-slate-100 text-slate-500";

// ── เซลล์ลาออก — เติม "(ลาออก)" ต่อท้ายชื่อเวลาแสดงผล (ข้อมูลเก่ายังอยู่) ──
// ชื่อพ้อง (alias) เริ่มต้น — เซลล์คนเดียวกันที่บัญชีล็อกอินชื่อหนึ่ง แต่ดีลบันทึกอีกชื่อ
// (แก้/เพิ่มเองได้ผ่าน UI หน้าค่าคอม → เก็บใน fieldConfig.staffAliases · ตัวนี้เป็นค่าเริ่มต้นสำรอง)
export const STAFF_ALIASES: Record<string, string> = {
  "เซลล์ดรีม": "ธัญญา (ดรีม)",
};
/** แปลงชื่อเซลล์เป็นชื่อจริง (canonical) — จับคู่ดีลของฉัน/ค่าคอมให้ตรงแม้ล็อกอินคนละชื่อ · aliases จาก fieldConfig */
export const canonicalStaff = (name: unknown, aliases: Record<string, string> = STAFF_ALIASES): string => {
  const n = String(name ?? "").trim();
  return aliases[n] ?? n;
};
/** เซลล์คนเดียวกันไหม (เทียบชื่อจริงหลังแปลง alias) */
export const sameStaff = (a: unknown, b: unknown, aliases: Record<string, string> = STAFF_ALIASES): boolean =>
  !!canonicalStaff(a, aliases) && canonicalStaff(a, aliases) === canonicalStaff(b, aliases);

export const isResignedStaff = (name: unknown, resigned: string[] = []): boolean =>
  !!name && resigned.includes(String(name).trim());
export const staffLabel = (name: unknown, resigned: string[] = []): string => {
  const n = String(name ?? "");
  return isResignedStaff(n, resigned) ? `${n} (ลาออก)` : n;
};

// รายการสถานะในตัวกรองประวัติการขาย (ชุดเดียว ไม่ซ้ำ)
export const SALE_STATUS_FILTER_GROUPS = [
  "จอง/รอโอน", "จอง/โอนมัดจำแล้ว", "รอจัดส่ง", "รอไฟแนนซ์", "ขายแล้ว/ปิดการขาย", "คืนสินค้า",
];
// สถานะที่ให้เลือกตอนแก้ไข (ตัดตัวซ้ำ/เก่าออก: มัดจำแล้ว, ขายแล้ว, จอง, รอผ่านไฟแนนซ์)
export const SALE_STATUS_OPTIONS = [
  "จอง/รอโอน", "จอง/โอนมัดจำแล้ว", "รอจัดส่ง", "รอไฟแนนซ์", "ปิดการขาย/จัดส่งแล้ว",
];

// ── สีแท็กแหล่งที่มาลูกค้า (sale.contact_source) ─────────────────────────────
export const CONTACT_SOURCE_COLORS: Record<string, string> = {
  "Line":          "bg-green-100 text-green-700",
  "Facebook":      "bg-blue-100 text-blue-700",
  "TikTok":        "bg-pink-100 text-pink-700",
  "โทร":           "bg-indigo-100 text-indigo-700",
  "Google":        "bg-orange-100 text-orange-700",
  "คนอื่นบอกต่อ":  "bg-violet-100 text-violet-700",
};

export const contactSourceClass = (source: unknown): string =>
  CONTACT_SOURCE_COLORS[String(source ?? "").trim()] ?? "bg-slate-100 text-slate-600";

// ── ชื่อเดือนไทยแบบย่อ (index 1-12 = ม.ค.-ธ.ค.) ──────────────────────────────
// ⚠️ ใช้ผ่านฟังก์ชันใน lib/format.ts เท่านั้น — อย่าอ้าง index ตรงๆ (เดิมมี 2 แบบ index ต่างกันจนวันที่เพี้ยน)
export const TH_MONTHS_1BASED = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."] as const;
