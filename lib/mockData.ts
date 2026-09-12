import { Forklift, Sale, InspectionRecord } from "./types";

export const BRANDS = ["HELI", "TOYOTA", "MITSUBISHI", "KOMATSU", "LINDE", "CROWN", "HYSTER", "YALE", "DOOSAN", "CLARK"];
export const FUEL_TYPES = ["ไฟฟ้า", "ดีเซล", "กึ่งไฟฟ้า", "น้ำมัน", "แก๊ส LPG", "มือโยก"];
// ชุดปุ่มสเปกให้สต๊อกเลือก (เซลล์ใช้กรองด้วยชุดเดียวกัน) — แก้ได้ในหน้าจัดการตัวเลือก
// น้ำหนักยก: เก็บเป็น "กิโลกรัม" ครอบทั้งแฮนด์ลิฟท์ (กก.ย่อย) และโฟล์คลิฟท์ (ตัน)
export const DEFAULT_CAPACITY_OPTIONS = ["150", "400", "1000", "1500", "2000", "2500", "3000", "3500", "5000", "7000", "10000"];
// ยกสูง: เก็บเป็น "เมตร"
export const DEFAULT_HEIGHT_OPTIONS = ["1.6", "2", "2.5", "3", "3.5", "4", "4.5", "5", "6", "7"];
export const FINANCE_COMPANIES = ["กรุงศรี ออโต้", "ธ.กสิกรไทย", "ธ.ไทยพาณิชย์", "ธ.กรุงเทพ", "ลีสซิ่งไทย", "อยุธยา แคปปิตอล", "เมืองไทย ลีสซิ่ง", "ธนาคารทิสโก้ จำกัด (มหาชน)"];
export const PROVINCES = [
  "กรุงเทพมหานคร","กระบี่","กาญจนบุรี","กาฬสินธุ์","กำแพงเพชร","ขอนแก่น","จันทบุรี","ฉะเชิงเทรา",
  "ชลบุรี","ชัยนาท","ชัยภูมิ","ชุมพร","เชียงราย","เชียงใหม่","ตรัง","ตราด","ตาก","นครนายก",
  "นครปฐม","นครพนม","นครราชสีมา","นครศรีธรรมราช","นครสวรรค์","นนทบุรี","นราธิวาส","น่าน",
  "บึงกาฬ","บุรีรัมย์","ปทุมธานี","ประจวบคีรีขันธ์","ปราจีนบุรี","ปัตตานี","พระนครศรีอยุธยา",
  "พะเยา","พังงา","พัทลุง","พิจิตร","พิษณุโลก","เพชรบุรี","เพชรบูรณ์","แพร่","ภูเก็ต",
  "มหาสารคาม","มุกดาหาร","แม่ฮ่องสอน","ยโสธร","ยะลา","ร้อยเอ็ด","ระนอง","ระยอง","ราชบุรี",
  "ลพบุรี","ลำปาง","ลำพูน","เลย","ศรีสะเกษ","สกลนคร","สงขลา","สตูล","สมุทรปราการ",
  "สมุทรสงคราม","สมุทรสาคร","สระแก้ว","สระบุรี","สิงห์บุรี","สุโขทัย","สุพรรณบุรี","สุราษฎร์ธานี",
  "สุรินทร์","หนองคาย","หนองบัวลำภู","อ่างทอง","อำนาจเจริญ","อุดรธานี","อุตรดิตถ์","อุทัยธานี","อุบลราชธานี"
];

// Province → Region mapping
const NORTH_PROVINCES = new Set([
  "เชียงราย","เชียงใหม่","น่าน","พะเยา","แพร่","แม่ฮ่องสอน","ลำปาง","ลำพูน",
  "ตาก","พิษณุโลก","เพชรบูรณ์","พิจิตร","กำแพงเพชร","สุโขทัย","อุตรดิตถ์",
  "นครสวรรค์","อุทัยธานี",
]);
const NORTHEAST_PROVINCES = new Set([
  "นครราชสีมา","บุรีรัมย์","สุรินทร์","ศรีสะเกษ","อุบลราชธานี","ยโสธร","ชัยภูมิ",
  "อำนาจเจริญ","มุกดาหาร","ร้อยเอ็ด","มหาสารคาม","กาฬสินธุ์","ขอนแก่น","อุดรธานี",
  "หนองคาย","หนองบัวลำภู","เลย","สกลนคร","นครพนม","บึงกาฬ",
]);
const SOUTH_PROVINCES = new Set([
  "ชุมพร","สุราษฎร์ธานี","นครศรีธรรมราช","กระบี่","พังงา","ภูเก็ต","ตรัง","พัทลุง",
  "สงขลา","สตูล","ยะลา","ปัตตานี","นราธิวาส","ระนอง",
]);

export function getRegion(province: string): "เหนือ" | "กลาง" | "อีสาน" | "ใต้" {
  if (NORTH_PROVINCES.has(province)) return "เหนือ";
  if (NORTHEAST_PROVINCES.has(province)) return "อีสาน";
  if (SOUTH_PROVINCES.has(province)) return "ใต้";
  return "กลาง";
}

// Default configurable field options
export const DEFAULT_CUSTOMER_TYPES = ["บุคคลทั่วไป", "นิติบุคคล", "ราชการ"];
export const DEFAULT_VEHICLE_GROUPS = ["รถยก 4 ล้อ", "รถยก 3 ล้อ", "Reach Truck", "Reach Stacker", "Order Picker", "Pallet Truck", "Stacker"];
export const DEFAULT_CONTROL_TYPES = ["แมนนวล", "เซมิออโต", "ออโต", "AC Drive", "IC Engine"];
export const DEFAULT_PO_STATUSES = ["รอ PO", "PO ออกแล้ว", "รอชำระ", "ชำระแล้ว", "ยกเลิก"];
export const DEFAULT_LOCATIONS = ["สำนักงานใหญ่", "สาขาชลบุรี", "สาขาขอนแก่น"];
// ชุดสถานะมาตรฐาน 5 ค่า (ล็อกแล้ว — แก้ในหน้า settings ไม่ได้) · ตรงกับปุ่มในการ์ดปิดการขาย
// รอรับ = สั่งแล้วรอเข้าคลัง · รอยืนยันนำเข้าสต็อก = ผู้ขนส่งรับแล้ว รอฝ่ายสต็อกยืนยัน · พร้อมขาย · จอง/รอผ่านไฟแนนซ์/ปิดการขายแล้ว = ผลจากปุ่มปิดการขาย
// ชุดสถานะรวม (ใช้ตัวกรองเดียวกันทั้งหน้าขาย+สต็อก · 5 ส.ค. 2026)
export const DEFAULT_STOCK_STATUSES = ["พร้อมขาย", "ติดจอง (รอโอนมัดจำ)", "มัดจำแล้ว/เงินสด", "มัดจำแล้ว/ไฟแนนซ์", "ปิดการขายแล้ว", "สั่งผลิต", "รอรับ", "รถเช่า", "เคลม/รับกลับ"];
export const CONTACT_SOURCES = ["Line", "Facebook", "TikTok", "โทร", "Google", "คนอื่นบอกต่อ"] as const;
export const SALE_TYPES = ["รถเช่า", "รถใหม่"] as const;

export const mockForklifts: Forklift[] = [
  { id: "1",  SN: "HEL-001", brand: "HELI",       model: "CPCD30",    capacity: "3 ตัน",   height: "3 เมตร",   fuel: "ดีเซล",    cost_price: 420000, stock_price: 520000, status: "พร้อมขาย",    created_at: "2024-01-15", vehicle_category: "Forklift" },
  { id: "2",  SN: "TOY-002", brand: "TOYOTA",     model: "8FD25",     capacity: "2.5 ตัน", height: "3.5 เมตร", fuel: "ดีเซล",    cost_price: 580000, stock_price: 720000, status: "พร้อมขาย",    created_at: "2024-01-20", vehicle_category: "Forklift" },
  { id: "3",  SN: "MIT-003", brand: "MITSUBISHI", model: "FD30N",     capacity: "3 ตัน",   height: "3 เมตร",   fuel: "ดีเซล",    cost_price: 540000, stock_price: 680000, status: "ส่งมอบแล้ว", created_at: "2024-02-01", vehicle_category: "Forklift" },
  { id: "4",  SN: "HEL-004", brand: "HELI",       model: "CPCD20",    capacity: "2 ตัน",   height: "2.5 เมตร", fuel: "ดีเซล",    cost_price: 360000, stock_price: 450000, status: "พร้อมขาย",    created_at: "2024-02-10", vehicle_category: "Forklift" },
  { id: "5",  SN: "LIN-005", brand: "LINDE",      model: "E16C",      capacity: "1.6 ตัน", height: "5 เมตร",   fuel: "ไฟฟ้า",    cost_price: 480000, stock_price: 620000, status: "พร้อมขาย",    created_at: "2024-02-15", vehicle_category: "Stacker", fork_length: "1.15" },
  { id: "6",  SN: "KOM-006", brand: "KOMATSU",    model: "FG25T-16",  capacity: "2.5 ตัน", height: "3 เมตร",   fuel: "แก๊ส LPG", cost_price: 520000, stock_price: 650000, status: "ส่งมอบแล้ว", created_at: "2024-03-01", vehicle_category: "Forklift" },
  { id: "7",  SN: "HEL-007", brand: "HELI",       model: "CPCD50",    capacity: "5 ตัน",   height: "3.5 เมตร", fuel: "ดีเซล",    cost_price: 780000, stock_price: 980000, status: "พร้อมขาย",    created_at: "2024-03-10", vehicle_category: "Forklift" },
  { id: "8",  SN: "TOY-008", brand: "TOYOTA",     model: "LHW230",    capacity: "2.3 ตัน", height: "0.2 เมตร", fuel: "ไฟฟ้า",    cost_price: 28000,  stock_price: 42000,  status: "พร้อมขาย",    created_at: "2024-03-15", vehicle_category: "Handlift", fork_length: "1.15" },
  { id: "9",  SN: "CRO-009", brand: "CROWN",      model: "SC 5200",   capacity: "1.25 ตัน",height: "4.7 เมตร", fuel: "ไฟฟ้า",    cost_price: 380000, stock_price: 490000, status: "พร้อมขาย",    created_at: "2024-04-01", vehicle_category: "Stacker",  fork_length: "1.15" },
  { id: "10", SN: "HEL-010", brand: "HELI",       model: "CPCD35",    capacity: "3.5 ตัน", height: "3 เมตร",   fuel: "ดีเซล",    cost_price: 560000, stock_price: 700000, status: "พร้อมขาย",    created_at: "2024-04-05", vehicle_category: "Forklift" },
  { id: "11", SN: "MIT-011", brand: "MITSUBISHI", model: "ESR15",     capacity: "1.5 ตัน", height: "6 เมตร",   fuel: "ไฟฟ้า",    cost_price: 520000, stock_price: 680000, status: "พร้อมขาย",    created_at: "2024-04-12", vehicle_category: "Stacker",  fork_length: "1.15" },
  { id: "12", SN: "HYS-012", brand: "HYSTER",     model: "H3.0FT",    capacity: "3 ตัน",   height: "3.5 เมตร", fuel: "ดีเซล",    cost_price: 720000, stock_price: 900000, status: "ส่งมอบแล้ว", created_at: "2024-04-20", vehicle_category: "Forklift" },
  { id: "13", SN: "BIS-013", brand: "BISHAMON",   model: "BX25",      capacity: "2.5 ตัน", height: "0.2 เมตร", fuel: "ไฟฟ้า",    cost_price: 22000,  stock_price: 35000,  status: "พร้อมขาย",    created_at: "2024-05-01", vehicle_category: "Handlift", fork_length: "1.22" },
  { id: "14", SN: "YAL-014", brand: "YALE",       model: "GLP25VX",   capacity: "2.5 ตัน", height: "3 เมตร",   fuel: "แก๊ส LPG", cost_price: 490000, stock_price: 620000, status: "พร้อมขาย",    created_at: "2024-05-10", vehicle_category: "Forklift" },
  { id: "15", SN: "JUN-015", brand: "JUNGHEINRICH", model: "EJE 116", capacity: "1.6 ตัน", height: "0.2 เมตร", fuel: "ไฟฟ้า",    cost_price: 32000,  stock_price: 48000,  status: "พร้อมขาย",    created_at: "2024-05-20", vehicle_category: "Handlift", fork_length: "1.15" },
];

export const mockSales: Sale[] = [
  { id: "s1",  forklift_id: "6",   forklift_unit_no: "KOM-006", forklift_brand: "KOMATSU",    forklift_model: "FG25T-16", sales_staff: "สมชาย ใจดี",     customer_name: "บริษัท โลจิสติกส์ ไทย จำกัด",  customer_tel: "081-234-5678", customer_type: "นิติบุคคล",  province: "ชลบุรี",        payment_type: "ไฟแนนซ์", finance_company: "กรุงศรี ออโต้",   actual_sale: 640000, deposit: 100000, delivery_date: "2024-03-15", created_at: "2024-03-01", sale_status: "ขายแล้ว", contact_source: "Line",           sale_type: "รถขายเต็มคัน", warranty_expiry: "2025-03-15", parts_schedule: "2025-06-15" },
  { id: "s2",  forklift_id: "12",  forklift_unit_no: "HYS-012", forklift_brand: "HYSTER",     forklift_model: "H3.0FT",   sales_staff: "สมหญิง รักดี",   customer_name: "ห้างหุ้นส่วน ธนวัฒน์",          customer_tel: "089-876-5432", customer_type: "นิติบุคคล",  province: "กรุงเทพมหานคร", payment_type: "เงินสด",                              actual_sale: 890000, deposit: 890000, delivery_date: "2024-04-30", created_at: "2024-04-20", sale_status: "ขายแล้ว", contact_source: "Facebook",       sale_type: "รถขายเต็มคัน", warranty_expiry: "2025-04-30" },
  { id: "s3",  forklift_id: "3",   forklift_unit_no: "MIT-003", forklift_brand: "MITSUBISHI", forklift_model: "FD30N",    sales_staff: "วิชัย แข็งแรง",  customer_name: "นาย ประสิทธิ์ มีทรัพย์",        customer_tel: "062-111-2222", customer_type: "บุคคลทั่วไป", province: "นครราชสีมา",    payment_type: "ไฟแนนซ์", finance_company: "ธ.กสิกรไทย",    actual_sale: 670000, deposit: 67000,  delivery_date: "2024-05-10", created_at: "2024-05-01", sale_status: "ขายแล้ว", contact_source: "โทร",            sale_type: "รถมือสอง",     warranty_expiry: "2025-05-10" },
  { id: "h1",  forklift_id: "h1",  forklift_unit_no: "HEL-H01", forklift_brand: "HELI",       forklift_model: "CPCD30",   sales_staff: "สมชาย ใจดี",     customer_name: "บริษัท อินดัสเทรียล จำกัด",    customer_tel: "081-111-2222", customer_type: "นิติบุคคล",  province: "สมุทรปราการ",   payment_type: "เงินสด",                              actual_sale: 520000, deposit: 520000, delivery_date: "2024-01-20", created_at: "2024-01-15", sale_status: "ขายแล้ว", contact_source: "Google",          sale_type: "รถขายเต็มคัน", warranty_expiry: "2025-01-20" },
  { id: "h2",  forklift_id: "h2",  forklift_unit_no: "TOY-H02", forklift_brand: "TOYOTA",     forklift_model: "8FD25",    sales_staff: "สมหญิง รักดี",   customer_name: "ห้างหุ้นส่วน สุวรรณ",           customer_tel: "082-333-4444", customer_type: "นิติบุคคล",  province: "ปทุมธานี",      payment_type: "ไฟแนนซ์", finance_company: "กรุงศรี ออโต้",   actual_sale: 710000, deposit: 71000,  delivery_date: "2024-02-05", created_at: "2024-01-25", sale_status: "ขายแล้ว", contact_source: "Line",           sale_type: "รถขายเต็มคัน" },
  { id: "h3",  forklift_id: "h3",  forklift_unit_no: "HEL-H03", forklift_brand: "HELI",       forklift_model: "CPCD20",   sales_staff: "วิชัย แข็งแรง",  customer_name: "นาย สมศักดิ์ ดีมาก",            customer_tel: "083-555-6666", customer_type: "บุคคลทั่วไป", province: "พระนครศรีอยุธยา", payment_type: "เงินสด",                            actual_sale: 450000, deposit: 450000, delivery_date: "2024-02-15", created_at: "2024-02-10", sale_status: "ขายแล้ว", contact_source: "คนอื่นบอกต่อ",  sale_type: "รถมือสอง" },
  { id: "h4",  forklift_id: "h4",  forklift_unit_no: "MIT-H04", forklift_brand: "MITSUBISHI", forklift_model: "FD30N",    sales_staff: "สมชาย ใจดี",     customer_name: "บริษัท เอ็กซ์เพรส จำกัด",      customer_tel: "084-777-8888", customer_type: "นิติบุคคล",  province: "ชลบุรี",        payment_type: "ไฟแนนซ์", finance_company: "ธ.กสิกรไทย",    actual_sale: 680000, deposit: 68000,  delivery_date: "2024-03-05", created_at: "2024-02-28", sale_status: "ขายแล้ว", contact_source: "TikTok",         sale_type: "รถขายเต็มคัน" },
  { id: "h5",  forklift_id: "h5",  forklift_unit_no: "LIN-H05", forklift_brand: "LINDE",      forklift_model: "H25D",     sales_staff: "นภา สดใส",       customer_name: "บริษัท ไทยโลจิส จำกัด",         customer_tel: "085-999-0000", customer_type: "นิติบุคคล",  province: "นนทบุรี",       payment_type: "เงินสด",                              actual_sale: 840000, deposit: 840000, delivery_date: "2024-03-20", created_at: "2024-03-15", sale_status: "ขายแล้ว", contact_source: "Facebook",       sale_type: "รถเช่า" },
  { id: "h6",  forklift_id: "h6",  forklift_unit_no: "TOY-H06", forklift_brand: "TOYOTA",     forklift_model: "8FBE15T",  sales_staff: "สมหญิง รักดี",   customer_name: "นาย พิชัย ใหม่ดี",              customer_tel: "086-111-2222", customer_type: "บุคคลทั่วไป", province: "กรุงเทพมหานคร", payment_type: "ไฟแนนซ์", finance_company: "ลีสซิ่งไทย",     actual_sale: 615000, deposit: 61500,  delivery_date: "2024-04-10", created_at: "2024-04-05", sale_status: "ขายแล้ว", contact_source: "Line",           sale_type: "รถขายเต็มคัน" },
  { id: "h7",  forklift_id: "h7",  forklift_unit_no: "HEL-H07", forklift_brand: "HELI",       forklift_model: "CPCD35",   sales_staff: "เอกชัย มุ่งมั่น", customer_name: "บริษัท สยาม แมนูแฟค จำกัด",   customer_tel: "087-333-4444", customer_type: "นิติบุคคล",  province: "ระยอง",         payment_type: "ไฟแนนซ์", finance_company: "อยุธยา แคปปิตอล", actual_sale: 695000, deposit: 69500,  delivery_date: "2024-04-25", created_at: "2024-04-20", sale_status: "จอง",       contact_source: "Google",          sale_type: "รถขายเต็มคัน" },
  { id: "h8",  forklift_id: "h8",  forklift_unit_no: "KOM-H08", forklift_brand: "KOMATSU",    forklift_model: "FG25T-16", sales_staff: "สมชาย ใจดี",     customer_name: "บริษัท พรีเมียร์ จำกัด",        customer_tel: "088-555-6666", customer_type: "นิติบุคคล",  province: "สมุทรสาคร",    payment_type: "เงินสด",                              actual_sale: 645000, deposit: 645000, delivery_date: "2024-05-15", created_at: "2024-05-10", sale_status: "ขายแล้ว", contact_source: "คนอื่นบอกต่อ",  sale_type: "รถขายเต็มคัน" },
  { id: "h9",  forklift_id: "h9",  forklift_unit_no: "HYS-H09", forklift_brand: "HYSTER",     forklift_model: "H3.0FT",   sales_staff: "วิชัย แข็งแรง",  customer_name: "บริษัท นอร์ธ อีสต์ จำกัด",     customer_tel: "089-777-8888", customer_type: "นิติบุคคล",  province: "ขอนแก่น",      payment_type: "ไฟแนนซ์", finance_company: "เมืองไทย ลีสซิ่ง", actual_sale: 895000, deposit: 89500,  delivery_date: "2024-05-30", created_at: "2024-05-25", sale_status: "รอผ่านไฟแนนซ์", contact_source: "Line",         sale_type: "รถมือสอง" },
  { id: "h10", forklift_id: "h10", forklift_unit_no: "HEL-H10", forklift_brand: "HELI",       forklift_model: "CPCD50",   sales_staff: "นภา สดใส",       customer_name: "บริษัท เมกะ โลจิสติกส์ จำกัด", customer_tel: "081-444-5555", customer_type: "นิติบุคคล",  province: "สมุทรปราการ",   payment_type: "ไฟแนนซ์", finance_company: "ธ.ไทยพาณิชย์",  actual_sale: 960000, deposit: 96000,  delivery_date: "2024-06-10", created_at: "2024-06-01", sale_status: "ขายแล้ว", contact_source: "Facebook",       sale_type: "รถเช่า" },
  { id: "h11", forklift_id: "h11", forklift_unit_no: "MIT-H11", forklift_brand: "MITSUBISHI", forklift_model: "FB20N",    sales_staff: "เอกชัย มุ่งมั่น", customer_name: "บริษัท ฟีนิกซ์ จำกัด",        customer_tel: "082-666-7777", customer_type: "นิติบุคคล",  province: "ปทุมธานี",      payment_type: "เงินสด",                              actual_sale: 755000, deposit: 755000, delivery_date: "2024-06-20", created_at: "2024-06-15", sale_status: "ขายแล้ว", contact_source: "โทร",            sale_type: "งานซ่อม" },
  { id: "h12", forklift_id: "h12", forklift_unit_no: "HEL-H12", forklift_brand: "HELI",       forklift_model: "CPCD30",   sales_staff: "สมชาย ใจดี",     customer_name: "บริษัท นอร์เทิร์น จำกัด",      customer_tel: "053-111-2222", customer_type: "นิติบุคคล",  province: "เชียงใหม่",     payment_type: "เงินสด",                              actual_sale: 530000, deposit: 530000, delivery_date: "2024-07-01", created_at: "2024-06-25", sale_status: "จอง",       contact_source: "Line",           sale_type: "รถขายเต็มคัน" },
  { id: "h13", forklift_id: "h13", forklift_unit_no: "TOY-H13", forklift_brand: "TOYOTA",     forklift_model: "8FD25",    sales_staff: "วิชัย แข็งแรง",  customer_name: "บริษัท ลานนา ทรานส์ จำกัด",    customer_tel: "054-333-4444", customer_type: "นิติบุคคล",  province: "เชียงราย",      payment_type: "ไฟแนนซ์", finance_company: "กรุงศรี ออโต้",   actual_sale: 720000, deposit: 72000,  delivery_date: "2024-07-10", created_at: "2024-07-01", sale_status: "รอผ่านไฟแนนซ์", contact_source: "Facebook",     sale_type: "รถขายเต็มคัน" },
  { id: "h14", forklift_id: "h14", forklift_unit_no: "HEL-H14", forklift_brand: "HELI",       forklift_model: "CPCD20",   sales_staff: "นภา สดใส",       customer_name: "นาย สมพร ทวีสุข",              customer_tel: "074-555-6666", customer_type: "บุคคลทั่วไป", province: "สงขลา",         payment_type: "เงินสด",                              actual_sale: 460000, deposit: 460000, delivery_date: "2024-07-20", created_at: "2024-07-15", sale_status: "ขายแล้ว", contact_source: "Google",          sale_type: "รถมือสอง" },
  { id: "h15", forklift_id: "h15", forklift_unit_no: "MIT-H15", forklift_brand: "MITSUBISHI", forklift_model: "FD30N",    sales_staff: "เอกชัย มุ่งมั่น", customer_name: "บริษัท ภาคใต้ โลจิส จำกัด",  customer_tel: "077-777-8888", customer_type: "นิติบุคคล",  province: "สุราษฎร์ธานี",  payment_type: "ไฟแนนซ์", finance_company: "ธ.กสิกรไทย",    actual_sale: 690000, deposit: 69000,  delivery_date: "2024-08-05", created_at: "2024-07-28", sale_status: "ขายแล้ว", contact_source: "TikTok",         sale_type: "รถขายเต็มคัน" },
];

export const mockMonthlySales = [
  { month: "ม.ค.", revenue: 1250000, units: 3 },
  { month: "ก.พ.", revenue: 1820000, units: 4 },
  { month: "มี.ค.", revenue: 2100000, units: 5 },
  { month: "เม.ย.", revenue: 1680000, units: 4 },
  { month: "พ.ค.", revenue: 2450000, units: 6 },
  { month: "มิ.ย.", revenue: 1950000, units: 5 },
  { month: "ก.ค.", revenue: 2800000, units: 7 },
  { month: "ส.ค.", revenue: 2200000, units: 5 },
  { month: "ก.ย.", revenue: 3100000, units: 8 },
  { month: "ต.ค.", revenue: 2650000, units: 6 },
  { month: "พ.ย.", revenue: 2900000, units: 7 },
  { month: "ธ.ค.", revenue: 3400000, units: 9 },
];

export const mockSalesLeaderboard = [
  { rank: 1, name: "สมชาย ใจดี",      sales: 12, revenue: 8400000, badge: "🥇" },
  { rank: 2, name: "สมหญิง รักดี",    sales: 10, revenue: 7200000, badge: "🥈" },
  { rank: 3, name: "วิชัย แข็งแรง",   sales: 9,  revenue: 6300000, badge: "🥉" },
  { rank: 4, name: "นภา สดใส",        sales: 7,  revenue: 4900000, badge: "" },
  { rank: 5, name: "เอกชัย มุ่งมั่น",  sales: 6,  revenue: 4200000, badge: "" },
];

export const mockBrandShare = [
  { name: "HELI",       value: 35, color: "#3B82F6" },
  { name: "TOYOTA",     value: 22, color: "#10B981" },
  { name: "MITSUBISHI", value: 18, color: "#F59E0B" },
  { name: "KOMATSU",    value: 12, color: "#EF4444" },
  { name: "LINDE",      value: 8,  color: "#8B5CF6" },
  { name: "อื่นๆ",      value: 5,  color: "#64748B" },
];

export const mockTopModels = [
  { model: "HELI CPCD30",      sold: 18, revenue: 9360000  },
  { model: "TOYOTA 8FD25",     sold: 14, revenue: 10080000 },
  { model: "MITSUBISHI FD30N", sold: 12, revenue: 8160000  },
  { model: "HELI CPCD20",      sold: 10, revenue: 4500000  },
  { model: "KOMATSU FG25T-16", sold: 8,  revenue: 5200000  },
];

export const mockStockStatus = [
  { name: "พร้อมขาย",        value: 8, color: "#10B981" },
  { name: "จองแล้ว",         value: 2, color: "#F59E0B" },
  { name: "รอผ่านไฟแนนซ์",  value: 1, color: "#EF4444" },
  { name: "ส่งมอบแล้ว",     value: 2, color: "#6366F1" },
];

export const mockPaymentTypes = [
  { month: "ม.ค.", cash: 1, finance: 2 }, { month: "ก.พ.", cash: 2, finance: 2 },
  { month: "มี.ค.", cash: 2, finance: 3 }, { month: "เม.ย.", cash: 1, finance: 3 },
  { month: "พ.ค.", cash: 3, finance: 3 }, { month: "มิ.ย.", cash: 2, finance: 3 },
  { month: "ก.ค.", cash: 3, finance: 4 }, { month: "ส.ค.", cash: 2, finance: 3 },
  { month: "ก.ย.", cash: 4, finance: 4 }, { month: "ต.ค.", cash: 3, finance: 3 },
  { month: "พ.ย.", cash: 3, finance: 4 }, { month: "ธ.ค.", cash: 4, finance: 5 },
];

export const mockTransporterData: Record<string, { brand: string; model: string; capacity: string; fuel: string; color: string }> = {
  "HEL-001": { brand: "HELI",       model: "CPCD30",   capacity: "3 ตัน",   fuel: "ดีเซล",    color: "#FFCC00" },
  "TOY-002": { brand: "TOYOTA",     model: "8FD25",    capacity: "2.5 ตัน", fuel: "ดีเซล",    color: "#CC0000" },
  "MIT-003": { brand: "MITSUBISHI", model: "FD30N",    capacity: "3 ตัน",   fuel: "ดีเซล",    color: "#CC0000" },
  "HEL-004": { brand: "HELI",       model: "CPCD20",   capacity: "2 ตัน",   fuel: "ดีเซล",    color: "#FFCC00" },
  "LIN-005": { brand: "LINDE",      model: "H25D",     capacity: "2.5 ตัน", fuel: "ดีเซล",    color: "#003087" },
  "KOM-006": { brand: "KOMATSU",    model: "FG25T-16", capacity: "2.5 ตัน", fuel: "แก๊ส LPG", color: "#FF6600" },
  "HEL-007": { brand: "HELI",       model: "CPCD50",   capacity: "5 ตัน",   fuel: "ดีเซล",    color: "#FFCC00" },
  "TOY-008": { brand: "TOYOTA",     model: "8FBE15T",  capacity: "1.5 ตัน", fuel: "ไฟฟ้า",    color: "#CC0000" },
  "CRO-009": { brand: "CROWN",      model: "C5 1050",  capacity: "2 ตัน",   fuel: "ไฟฟ้า",    color: "#003366" },
  "HEL-010": { brand: "HELI",       model: "CPCD35",   capacity: "3.5 ตัน", fuel: "ดีเซล",    color: "#FFCC00" },
};

export const mockInspections: InspectionRecord[] = [
  { id: "ins1", unit_no: "HEL-001", transporter_name: "สมปอง วิ่งเก่ง",  date: "2024-05-10", images: [] },
  { id: "ins2", unit_no: "TOY-002", transporter_name: "ประยุทธ ขนดี",    date: "2024-05-15", images: [] },
  { id: "ins3", unit_no: "HEL-004", transporter_name: "วิโรจน์ ส่งไว",   date: "2024-05-22", images: [] },
  { id: "ins4", unit_no: "LIN-005", transporter_name: "สมปอง วิ่งเก่ง",  date: "2024-06-01", images: [] },
];

export const mockStockUsers = [
  { id: "su1", username: "stock01", password: "1234", name: "สต็อก แมนเนเจอร์", role: "stock" },
];

export const mockSalesUsers = [
  { id: "sal1", username: "sales01", password: "1234", name: "สมชาย ใจดี",      role: "sales", target_monthly: 3000000 },
  { id: "sal2", username: "sales02", password: "1234", name: "สมหญิง รักดี",    role: "sales", target_monthly: 2500000 },
  { id: "sal3", username: "sales03", password: "1234", name: "วิชัย แข็งแรง",   role: "sales", target_monthly: 2000000 },
];
