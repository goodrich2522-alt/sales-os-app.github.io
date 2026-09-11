// ── ระบบคำนวณค่าคอมมิชชั่นฝ่ายขาย (รายเดือน/รายบุคคล) ──
// เกณฑ์ (ตั้งโดยผู้ใช้ 29 ก.ค. 2026):
//  · STACKER (รุ่น RE/CDD/CBS) — คิดตาม "ยอดขาย": >100,000 = 800/คัน · ต่ำกว่า = 500/คัน
//  · FORKLIFT — คิดตาม "กำไรสุทธิ" + หมวดลูกค้า 3 แบบ (เลือกตอนปิดการขาย)
// กำไรสุทธิ = ราคาขาย − ทุน − อุปกรณ์เสริม − ของแถม(2,800) − ค่าขนส่ง
// นับเฉพาะดีลที่ "ปิด/จัดส่งแล้ว" ภายในเดือนนั้น
import { Sale, Forklift } from "./types";

// หมวดค่าคอมโฟล์คลิฟท์ — เก็บที่ sale.custom_fields["หมวดค่าคอม"]
export const COMMISSION_FIELD = "หมวดค่าคอม";

// ค่าคอมกำหนดเอง (override ตามรายงานบริษัท) — เก็บจำนวนเงินที่ sale.custom_fields["ค่าคอมกำหนดเอง"]
// ใช้เมื่อสูตร/เรตพิเศษของแอปไม่ตรงกับที่บริษัทจ่ายจริง (เช่น ดีลใหญ่เรตพิเศษ) → ทับค่าที่คำนวณอัตโนมัติ
export const COMMISSION_MANUAL_FIELD = "ค่าคอมกำหนดเอง";
export const commissionManual = (s: Sale): number | null => {
  const raw = s.custom_fields?.[COMMISSION_MANUAL_FIELD];
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const n = Number(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

// แบ่งค่าคอม (กรณีรับช่วงต่อ) — เก็บ % ที่เซลล์ปัจจุบันได้ ที่ sale.custom_fields["แบ่งค่าคอม%"]
// เช่น "50" = ส่งรถต่อช่วงให้เซลล์อื่น แบ่งครึ่ง (ได้ครึ่งเดียว) · ว่าง/100 = ได้เต็ม
export const COMMISSION_SPLIT_FIELD = "แบ่งค่าคอม%";
export const commissionSplitPct = (s: Sale): number => {
  const raw = String(s.custom_fields?.[COMMISSION_SPLIT_FIELD] ?? "").trim();
  const n = Number(raw);
  return raw !== "" && n > 0 && n < 100 ? n : 100;
};
export const COMMISSION_CATEGORIES = ["ลูกค้าใหม่", "ลูกค้าใหม่+ออกพบเอง", "ลูกค้าเก่า/รับช่วงต่อ"] as const;
export type CommissionCategory = (typeof COMMISSION_CATEGORIES)[number];

// รุ่นสแตกเกอร์ที่คิดค่าคอมตามยอดขาย (RE/CDD/CBS)
export const isStackerModel = (model?: string) => /^(RE|CDD|CBS)/i.test(String(model ?? "").trim());

// แบรนด์ที่เป็นแฮนด์ลิฟท์/รถคลังสินค้าทั้งแบรนด์ → รถกลุ่มอื่นเสมอ (ไม่ใช่โฟล์คลิฟท์)
// (CNC ไม่เหมาทั้งแบรนด์ เพราะมีบางรุ่นกำกวม — ใช้จำแนกจากรุ่นแทน)
export const OTHER_GROUP_BRANDS = ["STAXX", "เจนบรรเจิด"];

// รถกลุ่มอื่น (คิด 1% ของยอดรวมทั้งเดือน) — แฮนด์ลิฟท์/รถลากพาเลท/โต๊ะยก/CBD/CNS/PD/PTS/DYC
// ⚠️ จำแนกจาก "รุ่น" ก่อนเสมอ เพราะ vehicle_category ในDB ของรถพวกนี้มักถูกใส่ผิดเป็น "Forklift"
// PD\d/PTS/DYC = อุปกรณ์คลัง CNC (รถยกพาเลท/โต๊ะยก) — ไม่ชน CPD/CPCD ที่ขึ้นต้นด้วย C (ผู้ใช้เคาะ 20 ส.ค.)
export const isOtherGroupModel = (model?: string) => {
  const m = String(model ?? "").trim().toUpperCase();
  if (!m) return false;
  return /^(CBD|CNS|PWH|SDA|DG\d|EPS|PS\d|PD\d|PTS|DYC|BF\d|AC\d|WH|WP|CBY|HPT|WMS|WS-)/.test(m) || /HAND\s*PALLET|PALLET\s*TRUCK|LIFT\s*TABLE/.test(m);
};

// จำแนกรถกลุ่มอื่น: จากแบรนด์ (STAXX/เจนบรรเจิด/CNC) หรือ จากรุ่น
export const isOtherGroup = (brand?: string, model?: string) =>
  OTHER_GROUP_BRANDS.includes(String(brand ?? "").trim()) || isOtherGroupModel(model);

// เป็น "โฟล์คลิฟท์แท้" (ถ่วงน้ำหนัก) ไหม — โฟล์คลิฟท์ = ฟอร์มรับประกันมีรอบเช็ค · อื่น = พิมพ์เอง
export const isForkliftVehicle = (brand?: string, model?: string) =>
  !isOtherGroup(brand, model) && !isStackerModel(model);

// re-export ให้ component อื่นใช้ตรวจว่าลงข้อมูลรับประกันครบไหม (กันจ่ายค่าคอม)
export { warrantyFilled } from "./warranty";

// ดีลปิดจริง (ปิด/จัดส่งแล้ว) — ค่าเก่า "ขายแล้ว"/"ปิดการขายแล้ว"/"ส่งมอบแล้ว" นับด้วย
export const isClosedSale = (s: Sale) => {
  const st = String(s.sale_status ?? "").trim();
  return st.includes("ปิดการขาย") || st.includes("จัดส่งแล้ว") || st.includes("ส่งมอบ") || st === "ขายแล้ว";
};

// ดีลนำเข้าจากบิลภาษี GR (ทุน=0 ไม่มีเซลล์จริง) — ไม่นำมาคิดค่าคอม (ผู้ใช้ยืนยัน 29 ก.ค. 2026)
export const isImportedSale = (s: Sale) =>
  String(s.custom_fields?.["ที่มา"] ?? "") === "นำเข้าบิลภาษี" || /^sale_gr_/i.test(String(s.id ?? ""));

// แปลงปี พ.ศ.→ค.ศ. อัตโนมัติ (บางคนพิมพ์ปีไทยในช่องวันที่ เช่น 2569-08-10 → 2026-08-10) — ปี ≥ 2500 ลบ 543
export const toGregorian = (d?: string): string => {
  const s = String(d ?? "").trim();
  const m = s.match(/^(\d{4})(-\d{2}-\d{2}.*)$/);
  if (!m) return s;
  const y = Number(m[1]);
  return y >= 2500 ? `${y - 543}${m[2]}` : s;
};
// วันที่ปิดการขาย (ใช้จัดกลุ่มรายเดือน) = วันส่งมอบ ถ้ามี ไม่งั้นวันที่สร้างดีล · normalize ปี พ.ศ. กันเพี้ยน
export const closeDate = (s: Sale) => toGregorian(String(s.delivery_date || s.created_at || "")).slice(0, 10);
export const closeMonth = (s: Sale) => closeDate(s).slice(0, 7); // YYYY-MM

// ── งวดค่าคอม = เดือนที่รับเงินเข้าบัญชี (ผู้ใช้เคาะ 20 ส.ค.) · ยังไม่รับเงิน = รอรับเงิน ──
export const paidDate = (s: Sale) => toGregorian(String(s.payment_received_date || "")).slice(0, 10);
export const isCommPending = (s: Sale) => !paidDate(s).trim(); // ยังไม่รับเงิน → ไม่เข้างวด
export const commissionMonth = (s: Sale) => paidDate(s).slice(0, 7); // YYYY-MM ของวันรับเงิน (ว่าง = รอรับเงิน)
// วันจ่ายค่าคอมของงวด = วันที่ 25 ของเดือนถัดไป (YYYY-MM → YYYY-MM-25 ของเดือนถัดไป)
export const payoutDate = (ym: string): string => {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return "";
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-25`;
};

// ── ตรวจ "ลูกค้าเก่า" = เคยมีประวัติซื้อกับบริษัทมาก่อน (ไม่ว่าเซลล์คนไหน/เปิดบิลแบบไหน) ──
const normName = (n?: string) => String(n ?? "").toLowerCase().replace(/[\s .\-()]/g, "");
const normTel  = (t?: string) => String(t ?? "").replace(/\D/g, "");
// ลูกค้าคนเดียวกัน = ชื่อ(ตัดช่องว่าง/อักขระ)ตรงกัน หรือ เบอร์โทรตรงกัน
export const sameCustomer = (a: Pick<Sale, "customer_name" | "customer_tel">, b: Pick<Sale, "customer_name" | "customer_tel">) => {
  const na = normName(a.customer_name), nb = normName(b.customer_name);
  const ta = normTel(a.customer_tel),  tb = normTel(b.customer_tel);
  return (!!na && na === nb) || (ta.length >= 6 && ta === tb);
};
// ⭐ กติกา (ผู้ใช้สั่ง 11 ก.ย. 2569): 1 การซื้อ = 1 ใบเอกสาร (เลขที่ใบกำกับ/เอกสาร → PI → วันที่)
// ซื้อหลายคันในใบเดียว = ครั้งเดียว · ใบคนละเลข = คนละครั้ง (แม้วันเดียวกัน)
const saleDay = (s: Sale) => String(s.created_at || "").slice(0, 10);
/** รหัส "โอกาสการซื้อ" ของดีล — จับกลุ่มตามใบเอกสาร (เลขที่ใบกำกับ/เอกสาร) > PI > วันที่ (สำรอง) */
export const purchaseKey = (s: Sale): string => {
  const cf = (s.custom_fields || {}) as Record<string, string>;
  const inv = String(cf["เลขที่ใบกำกับภาษี"] || cf["เลขที่เอกสาร"] || "").trim();
  if (inv) return "DOC:" + inv;
  const pi = String(cf["PI"] || "").trim();
  if (pi) return "PI:" + pi;
  return "DAY:" + (saleDay(s) || String(s.id));
};
const orderKey = (s: Sale) => saleDay(s) + "|" + purchaseKey(s); // ลำดับก่อน-หลัง (วัน แล้วเลขเอกสาร กันวันเดียวกันเรียงตามเลขใบ)
// จำนวน "ใบเอกสารที่เคยซื้อก่อนดีลนี้" (นับรวมดีลนำเข้า GR) — >0 = ลูกค้าเก่า · คันในใบเดียวกันไม่นับซ้ำ
export const priorPurchaseCount = (sale: Sale, all: Sale[]) => {
  const myKey = purchaseKey(sale), myOrder = orderKey(sale);
  const prior = new Set(all
    .filter(o => o.id !== sale.id && isClosedSale(o) && sameCustomer(o, sale) && purchaseKey(o) !== myKey && orderKey(o) < myOrder)
    .map(purchaseKey));
  return prior.size;
};
// เช็คตอนกรอกฟอร์ม (ดีลใหม่ = วันนี้) — เคยซื้อ "ใบเอกสารอื่นที่ไม่ใช่วันนี้" ไหม (ซื้อวันนี้ยังไม่นับเป็นลูกค้าเก่า)
export const priorPurchaseByCustomer = (name: string, tel: string, all: Sale[]) => {
  const today = new Date().toISOString().slice(0, 10);
  const probe = { customer_name: name, customer_tel: tel };
  const keys = new Set(all
    .filter(o => isClosedSale(o) && sameCustomer(probe, o) && saleDay(o) && saleDay(o) !== today)
    .map(purchaseKey));
  return keys.size;
};

// กำไรสุทธิของดีล
export const dealProfit = (s: Sale, f?: Forklift): number => {
  const revenue = Number(s.actual_sale) || 0;
  const cost    = Number(f?.cost_price) || 0;
  const addOns  = (s.add_ons ?? []).reduce((sum, a) => sum + (Number(a.price) || 0), 0);
  const free    = s.freebie ? 2800 : 0;
  const ship    = Number(s.shipping_cost) || 0;
  return revenue - cost - addOns - free - ship;
};

// ── ตารางค่าคอม ──
const stackerRate = (saleAmount: number) => (saleAmount > 100000 ? 800 : 500);

const forkliftNew = (p: number) =>          // ลูกค้าใหม่
  p >= 100000 ? 2000 : p >= 80000 ? 1500 : p >= 50000 ? 1000 : p >= 40000 ? 800 : p >= 30001 ? 700 : p >= 25000 ? 500 : 0;

const forkliftNewVisit = (p: number) =>     // ลูกค้าใหม่ + ออกพบเอง
  p >= 100000 ? 2000 : p >= 50000 ? 1200 : p >= 40000 ? 800 : 500; // ต่ำกว่า 40,000 → 500

const forkliftOld = (p: number) =>          // ลูกค้าเก่าบริษัท/รับช่วงต่อ
  p >= 100000 ? 1500 : p >= 40000 ? 800 : 500; // 40,000–99,999 → 800 · ต่ำกว่า → 500

export interface CommissionResult {
  amount: number;
  group: "STACKER" | "FORKLIFT" | "none";
  basis: "ยอดขาย" | "กำไร" | "กำหนดเอง" | "-";
  basisValue: number;   // ยอดขาย (stacker) หรือ กำไรสุทธิ (forklift)
  category: string;     // หมวดลูกค้าที่ใช้คิดจริง (เฉพาะ forklift)
  returning?: boolean;  // ระบบตรวจพบว่าเป็นลูกค้าเก่า (มีประวัติซื้อ) → บังคับหมวด "ลูกค้าเก่า"
  note?: string;        // เตือนถ้าคิดไม่ได้ (ยังไม่เลือกหมวด / ไม่เข้าเงื่อนไข)
}

// ── Snapshot ล็อกค่าคอมรายเดือน (freeze ตัวเลขหลังจ่าย กันเลขขยับเมื่อแก้ดีลย้อนหลัง) ──
export interface CommissionLockDeal {
  saleId: string; staff: string;
  brand: string; model: string; customer: string;
  group: "STACKER" | "FORKLIFT" | "none";
  basis: string; basisValue: number;
  category: string; returning: boolean;
  amount: number; closeDate: string;
}
export interface CommissionLockStaff {
  staff: string; total: number; dealCount: number;
  missing: number; noneCount: number; noneSaleTotal: number; noneComm: number;
}
export interface CommissionLock {
  month: string;      // YYYY-MM
  lockedAt: string;   // ISO
  lockedBy: string;
  grandTotal: number;
  staff: CommissionLockStaff[];
  deals: CommissionLockDeal[];
}

// คำนวณค่าคอม 1 ดีล · ส่ง allSales มาด้วยเพื่อตรวจ "ลูกค้าเก่า" อัตโนมัติจากประวัติซื้อ
export const calcCommission = (s: Sale, f?: Forklift, allSales?: Sale[]): CommissionResult => {
  const model = f?.model ?? s.forklift_model;
  const storedCat = String(s.custom_fields?.[COMMISSION_FIELD] ?? "").trim();

  // ค่าคอมกำหนดเอง (ตามรายงาน) — ทับสูตรอัตโนมัติ · ยังจัดกลุ่ม STACKER/FORKLIFT ไว้ให้เข้ายอดรายคน (ไม่ตกกลุ่มอื่น)
  const manual = commissionManual(s);
  if (manual !== null) {
    const grp = isStackerModel(model) ? "STACKER" : "FORKLIFT";
    return { amount: manual, group: grp, basis: "กำหนดเอง", basisValue: manual, category: storedCat, note: "กำหนดเอง (ตามรายงาน)" };
  }

  // แบ่งค่าคอม (รับช่วงต่อ) — ปัดตามสัดส่วน เช่น 50% → ได้ครึ่งเดียว
  const splitPct = commissionSplitPct(s);
  const applySplit = (amt: number) => (splitPct < 100 ? Math.round((amt * splitPct) / 100) : amt);
  const splitNote = splitPct < 100 ? `แบ่งค่าคอม ${splitPct}% (รับช่วงต่อ)` : undefined;

  // STACKER (RE/CDD/CBS) → ตามยอดขาย
  if (isStackerModel(model)) {
    const saleAmount = Number(s.actual_sale) || 0;
    return { amount: applySplit(stackerRate(saleAmount)), group: "STACKER", basis: "ยอดขาย", basisValue: saleAmount, category: "", note: splitNote };
  }

  // FORKLIFT → ตามกำไรสุทธิ + หมวดลูกค้า
  // จำแนกจากรุ่นก่อน: ถ้าเป็นรุ่นกลุ่มอื่น (CBD/CNS/แฮนด์ลิฟท์ ฯลฯ) → ไม่ใช่โฟล์คลิฟท์ แม้ DB จะใส่ประเภทเป็น "Forklift"
  const brand = f?.brand ?? s.forklift_brand;
  const vtype = String(f?.vehicle_category ?? s.vehicle_type ?? "").trim();
  const isForklift = !isOtherGroup(brand, model) &&
    (vtype === "Forklift" || vtype === "" || /^(CPC?D|CQD|CPD|FD|FG|H2000)/i.test(String(model ?? "")));
  if (!isForklift) {
    // รถกลุ่มอื่น (แฮนด์ลิฟท์/CBD/CNS ฯลฯ) → คิด 1% ของ "ยอดรวมทั้งเดือน" (ทุก 100,000 = 1,000)
    // amount ต่อใบนี้เป็นค่าอ้างอิงเท่านั้น — หน้ารายงานรวมยอดทั้งเดือนแล้วคิด 1% ครั้งเดียว (กันเศษปัดต่อใบ)
    const saleAmount = Number(s.actual_sale) || 0;
    return { amount: Math.round(saleAmount * 0.01), group: "none", basis: "ยอดขาย", basisValue: saleAmount, category: "" };
  }
  // กติกา: มีประวัติซื้อมาก่อน = ลูกค้าเก่าเสมอ (บังคับ ทับค่าที่เซลล์เลือก)
  const returning = allSales ? priorPurchaseCount(s, allSales) > 0 : false;
  const category = returning ? "ลูกค้าเก่า/รับช่วงต่อ" : storedCat;
  const profit = dealProfit(s, f);
  if (!category) return { amount: 0, group: "FORKLIFT", basis: "กำไร", basisValue: profit, category: "", returning, note: "ยังไม่เลือกหมวดลูกค้า" };

  let amount = 0;
  if (category === "ลูกค้าใหม่+ออกพบเอง") amount = forkliftNewVisit(profit);
  else if (category === "ลูกค้าเก่า/รับช่วงต่อ") amount = forkliftOld(profit);
  else amount = forkliftNew(profit); // "ลูกค้าใหม่"
  return { amount: applySplit(amount), group: "FORKLIFT", basis: "กำไร", basisValue: profit, category, returning, note: splitNote };
};
