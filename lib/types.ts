// ค่าใหม่ (ตัวเลือกปัจจุบัน) + ค่าเก่าคงไว้เพื่อรองรับดีลเดิม (บิลแวท 411 · บิลเงินสด 22)
export type PaymentType = "เงินสด" | "ไฟแนนซ์" | "เครดิต" | "เงินสด (NO VAT)" | "บิลเงินสด" | "บิลแวท";
export type CustomerType = "บุคคลทั่วไป" | "นิติบุคคล" | "ราชการ";
// 4 สถานะใหม่ (ตามลำดับขั้น) + คงค่าเก่าไว้เพื่อดีลที่บันทึกไปแล้ว
export type SaleStatus =
  | "จอง/รอโอน" | "จอง/โอนมัดจำแล้ว" | "รอจัดส่ง" | "รอไฟแนนซ์" | "ปิดการขาย/จัดส่งแล้ว"
  | "คืนสินค้า" // ลูกค้าคืนสินค้า — เก็บประวัติดีลไว้ แต่ตัดออกจากยอด/ค่าคอม (isClosedSale=false)
  | "มัดจำแล้ว" | "ขายแล้ว" | "จอง" | "รอผ่านไฟแนนซ์"; // (เก่า — backward compat)
// Reach Stacker (CQDM) = รถยกสูงแบบยืนขับ มีแท่นยืน+แขนจับ — คนละประเภทกับ Reach Truck (CQD) ที่นั่งขับ
export type VehicleType = "Forklift" | "Stacker" | "Handlift" | "Electric Pallet Truck" | "Reach Truck" | "Reach Stacker";
export type ContactSource = "Line" | "Facebook" | "TikTok" | "โทร" | "Google" | "คนอื่นบอกต่อ";
// ประเภทการขาย: ใช้จริง 2 ค่า (รถเช่า/รถใหม่) · คงค่าเดิมไว้เพื่อ backward compat ข้อมูลเก่า
export type SaleType = "รถเช่า" | "รถใหม่" | "รถขายเต็มคัน" | "รถมือสอง" | "งานซ่อม";

// Kept as string aliases for flexibility — dropdown options are user-configurable
export type FuelType = string;
export type ForkliftStatus = string;

// ── เกตอนุมัติจองจากฝ่ายสต็อก (booking approval) ──
// เซลล์จอง/กันสต็อก → รถพักที่ "รออนุมัติสต็อก" จนฝ่ายสต็อกกดอนุมัติ (ยืนยันสต็อกออก)
export const STOCK_APPROVAL_FIELD = "อนุมัติสต็อก";          // sale.custom_fields — "รออนุมัติ"|"อนุมัติแล้ว"|"ปฏิเสธ"
export const STATUS_PENDING_APPROVAL = "รออนุมัติสต็อก";     // สถานะรถระหว่างรออนุมัติ
// สถานะรถ (จาก sale_status) ที่กันสต็อก + ต้องอนุมัติก่อน (ยกเว้นปิดการขายจริง)
export const GATED_STATUSES = ["จอง", "รอจัดส่ง", "รอไฟแนนซ์", "รอผ่านไฟแนนซ์"];
// ดีลที่ "ถูกปฏิเสธจากสต็อก" (รถคืนสู่สต็อกแล้ว) — ไม่ใช่ดีลจริง ต้องกรองออกจากยอด/รายงาน
export const isVoidSale = (s: { custom_fields?: Record<string, string> | null }) =>
  String(s.custom_fields?.[STOCK_APPROVAL_FIELD] ?? "") === "ปฏิเสธ";

export interface Forklift {
  id: string;
  SN: string;
  brand: string;
  model: string;
  capacity: string;
  capacity_kg?: string;
  height: string;
  fuel: string;
  cost_price: number;
  stock_price: number;
  status: string;
  created_at: string;
  vehicle_category?: VehicleType;
  // Extended fields
  pi_no?: string;
  vehicle_group?: string;
  year?: string;
  control_type?: string;
  fork_length?: string;
  attachments?: string;
  install_date?: string;
  install_cost?: number;
  po_status?: string;
  location?: string;
  received_date?: string;
  custom_fields?: Record<string, string>;
}

// ทะเบียนลูกค้า (เฟส 3) — แหล่งข้อมูลกลาง ใช้ autofill + จัดการ
export interface Customer {
  id: string;
  name: string;
  tax_id?: string;
  tel?: string;
  address?: string;
  customer_type?: string;
  province?: string;
  contact_person?: string;
  note?: string;
  created_at?: string;
  updated_at?: string;
}

export interface VehicleSpec {
  fuel?: string;
  weight?: string;
  height?: string;
  length?: string;
  width?: string;
}

export interface Sale {
  id: string;
  forklift_id: string;
  forklift_unit_no: string;
  forklift_brand: string;
  forklift_model: string;
  sales_staff: string;
  customer_name: string;
  customer_tel: string;
  customer_type: CustomerType;
  province: string;
  payment_type: PaymentType;
  finance_company?: string;
  actual_sale: number;
  deposit: number;
  delivery_date: string;
  payment_received_date?: string; // วันที่รับเงินเข้าบัญชี — ใช้กำหนดงวดจ่ายค่าคอม (ว่าง = รอรับเงิน)
  remark?: string;
  custom_fields?: Record<string, string>;
  created_at: string;
  // New fields
  sale_status?: SaleStatus;
  vehicle_type?: VehicleType;
  vehicle_spec?: VehicleSpec;
  warranty_expiry?: string;
  parts_schedule?: string;
  custom_notifications?: { label: string; date: string }[];
  contact_source?: ContactSource;
  sale_type?: SaleType;
  payment_proof?: string;    // รูปหลักฐานการชำระเงิน (รูปแรก — backward compat) เก็บ URL หลังอัปโหลด
  payment_proofs?: string[]; // หลักฐานการชำระหลายรูป (URL หลังอัปโหลด) — ใช้แทน payment_proof เมื่อมีหลายรูป
  add_ons?: { name: string; price: number }[]; // อุปกรณ์เสริมติดตั้ง (เฟส 4)
  freebie?: boolean;      // ของแถมเซ็ท 2,800 (เฉพาะรถน้ำมัน Q22K2 · เฟส 5)
  shipping_cost?: number; // ค่าขนส่งจากซัพพลายเออร์ (เฟส 5)
}

// ── รูปตรวจรถ 6 ช่องบังคับ (ผู้รับรถ/ผู้ส่งมอบรถ ต้องถ่ายครบทุกช่อง) ──
export const INSPECTION_SLOTS = [
  { key: "name_plate", label: "Name Plate",  icon: "🏷️" },
  { key: "pi_doc",     label: "เอกสาร PI",   icon: "📄" },
  { key: "front",      label: "รถด้านหน้า",  icon: "🚛" },
  { key: "back",       label: "รถด้านหลัง",  icon: "🔙" },
  { key: "left",       label: "รถด้านซ้าย",  icon: "◀️" },
  { key: "right",      label: "รถด้านขวา",   icon: "▶️" },
] as const;
// ── ช่องรูปเสริม (ไม่บังคับ) — ถ่ายเมื่อมีของจริง เช่น รถไฟฟ้ามีตู้ชาร์จ / มีกล่องเครื่องมือแถม ──
export const INSPECTION_EXTRA_SLOTS = [
  { key: "toolbox", label: "กล่องเครื่องมือ", icon: "🧰" },
  { key: "charger", label: "ตู้ชาร์จ",        icon: "🔌" },
] as const;
export type InspectionSlotKey =
  (typeof INSPECTION_SLOTS)[number]["key"] | (typeof INSPECTION_EXTRA_SLOTS)[number]["key"];
export const SLOT_LABELS: Record<string, string> =
  Object.fromEntries([...INSPECTION_SLOTS, ...INSPECTION_EXTRA_SLOTS].map(s => [s.key, s.label]));

export interface InspectionRecord {
  id: string;
  unit_no: string;
  transporter_name: string;
  transporter_phone?: string; // เบอร์ผู้ขนส่ง (ล็อกอินด้วยชื่อเล่น+เบอร์)
  date: string;
  images: string[]; // รูปทั้งหมดรวมกัน (6 ช่อง + รูปเพิ่มเติม) — หน้าเก่าอ่านช่องนี้
  image_slots?: Partial<Record<InspectionSlotKey, string>>; // รูปแยกช่อง → โชว์ป้ายกำกับ
  role?: "ผู้รับรถ" | "ผู้ส่งมอบรถ";
  delivery_company?: string; // หน้าผู้ส่งมอบรถ: บริษัท/สถานที่ที่ไปส่ง
  location_link?: string;    // หน้าผู้ส่งมอบรถ: ลิงก์โลเคชั่นหน้างาน
}

export interface DeletedInspectionRecord extends InspectionRecord {
  deletedAt: string;
}

export interface StockUser {
  id: string;
  username: string;
  password: string;
  name: string;
  role: "stock";
}

export interface SalesUser {
  id: string;
  username: string;
  password: string;
  name: string;
  role: "sales";
  target_monthly: number;
}

export interface CustomFieldDef {
  id: string;
  name: string;
  type: "text" | "select";
  options?: string[];
}
