// lib/quoteImport/types.ts — โครงข้อมูลกลางสำหรับนำเข้ารถจากใบเสนอราคา (เฟส 4)

/** ผู้ผลิตที่ระบบรองรับการอ่านใบเสนอราคา */
export type QuoteVendor = "HELI" | "STAXX" | "ROCKMAN" | "HANGCHA" | "EP" | "unknown";

/** รถ 1 คันที่ parse ได้จากใบเสนอราคา — ก่อนคนตรวจยืนยันเข้าสต็อก */
export interface ParsedVehicle {
  brand: string;
  model: string;
  SN?: string;              // HELI/HANGCHA มี SN จริง · STAXX สั่งผลิตยังไม่มี
  capacity?: string;        // พิกัดยก เช่น "3.5 ตัน"
  capacity_kg?: string;
  fuel?: string;            // ดีเซล/ไฟฟ้า/...
  mast?: string;            // รหัสเสา M400/ZSM...
  valve?: string;
  fork_length?: string;     // ความยาวงา (มม.)
  height?: string;
  cost_price?: number;      // ราคาทุน (ก่อน VAT · บาท)
  fobUsd?: number;          // ราคา FOB (USD) จาก Proforma STAXX — ไม่ใช่ราคาทุนบาท
  qty?: number;             // จำนวนตาม Proforma (ก่อนแตกเป็นรายคัน)
  pi_no?: string;           // เลขสัญญา/PI/Contract (เว้นว่างสำหรับใบเสนอราคา — เติมเลข PI จริงทีหลัง)
  /** รถสั่งผลิต (เลข PI/รหัสอ้างอิงลงท้าย KD) — ยังไม่มี SN · SN มาตอนผลิตเสร็จ ~60-90 วัน (ดู madeToOrder.ts) */
  made_to_order?: boolean;
  import_ref?: string;      // รหัสอ้างอิงนำเข้าจริงจากเอกสาร (เช่น C20726201-001) — ไม่ใช่เลข PI
  vendor: QuoteVendor;
  /** ฟิลด์ที่ parser ไม่มั่นใจ (ค่าว่าง/รูปแบบแปลก) — หน้าตรวจทานติดธงให้คนดู */
  flags?: string[];
}

/**
 * "จำนวนที่เอกสารระบุเอง" — ใช้เทียบกับจำนวนที่ parser อ่านได้จริง
 * กติกา (12 ก.ย. 2569): ทุกครั้งที่นำเข้า ต้องเทียบตัวเลขนี้กับของจริงก่อนบันทึก (ดู QUOTE-IMPORT-RULES.md)
 */
export interface QuoteDocCheck {
  totalQty?: number;        // จำนวนรวมทั้งใบ (แถว TOTAL AMOUNT ท้ายเอกสาร)
  totalAmount?: number;     // ยอดเงินรวมทั้งใบ
  /** จำนวน + ยอดก่อน VAT ที่เอกสารระบุ แยกตามรุ่น */
  byModel: { model: string; qty: number; subtotal?: number }[];
}

/** ผลการอ่านใบเสนอราคา 1 ไฟล์ */
export interface QuoteParseResult {
  vendor: QuoteVendor;
  pi_no?: string;
  quote_date?: string;
  vehicles: ParsedVehicle[];
  /** ข้อความดิบที่อ่านได้ — เผื่อคนตรวจเทียบกับต้นฉบับ */
  rawText: string;
  /** จำนวนที่เอกสารระบุ — หน้าตรวจทานเอาไปเทียบกับที่อ่านได้ (parser ที่ยังไม่รองรับจะเว้นว่าง) */
  docCheck?: QuoteDocCheck;
}
