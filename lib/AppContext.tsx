"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { Forklift, Sale, InspectionRecord, DeletedInspectionRecord, CustomFieldDef, Customer,
  STOCK_APPROVAL_FIELD } from "./types";
import {
  mockForklifts, mockSales, mockInspections,
  BRANDS, FUEL_TYPES,
  DEFAULT_VEHICLE_GROUPS, DEFAULT_CONTROL_TYPES, DEFAULT_PO_STATUSES,
  DEFAULT_LOCATIONS, DEFAULT_STOCK_STATUSES,
  DEFAULT_CUSTOMER_TYPES, FINANCE_COMPANIES, SALE_TYPES,
  DEFAULT_CAPACITY_OPTIONS, DEFAULT_HEIGHT_OPTIONS,
} from "./mockData";
import * as api from "./api";
import { supabase } from "./supabaseClient";
import { isPendingId } from "./productId";
import type { CommissionLock } from "./commission";

// ── Field configuration ───────────────────────────────────────────────────────
export interface FieldConfig {
  // Stock form dropdowns
  brands: string[];
  vehicleGroups: string[];
  fuelTypes: string[];
  controlTypes: string[];
  poStatuses: string[];
  locations: string[];
  stockStatuses: string[];
  // ปุ่มสเปก (สต๊อกกรอก + เซลล์กรอง ใช้ชุดเดียวกัน)
  capacityOptions: string[]; // น้ำหนักยก (กก.)
  heightOptions: string[];   // ยกสูง (เมตร)
  // Sales form dropdowns
  customerTypes: string[];
  financeCompanies: string[];
  saleTypes: string[];      // ประเภทการขาย
  paymentTypes: string[];   // ประเภทการชำระ
  shippingSuppliers: string[]; // ผู้ให้บริการขนส่ง (รถสไลด์)
  // Custom field definitions
  customFieldDefs: CustomFieldDef[];      // stock form custom fields
  saleExtraFieldDefs: CustomFieldDef[];   // checkout form custom fields
  // Sales filter requests
  salesFilterRequests: string[];
  // จำผู้ใช้ที่ล็อกอินด้วย Google: อีเมล (ตัวพิมพ์เล็ก) → ชื่อ/บทบาท/สถานะอนุมัติ
  knownUsers: Record<string, { name: string; role: string; status?: "approved" | "pending" | "blocked" }>;
  // อีเมลแอดมิน (จัดการสิทธิ์ที่ /admin/users)
  adminEmails: string[];
  // ล็อก snapshot ค่าคอมรายเดือน (คีย์ = YYYY-MM) — freeze ตัวเลขหลังจ่าย
  commissionLocks: Record<string, CommissionLock>;
  // รายชื่อเซลล์ที่ลาออก (ตามชื่อบนดีล) — โชว์ "(ลาออก)" ต่อท้าย · ข้อมูลเก่ายังอยู่ครบ
  resignedStaff: string[];
  // ชื่อพ้องเซลล์ (alias → ชื่อจริง) — เซลล์คนเดียวกันที่ล็อกอิน/บันทึกคนละชื่อ → รวมเป็นคนเดียว
  staffAliases: Record<string, string>;
}

const DEFAULT_FIELD_CFG: FieldConfig = {
  brands: BRANDS,
  vehicleGroups: DEFAULT_VEHICLE_GROUPS,
  fuelTypes: [...FUEL_TYPES],
  controlTypes: DEFAULT_CONTROL_TYPES,
  poStatuses: DEFAULT_PO_STATUSES,
  locations: DEFAULT_LOCATIONS,
  stockStatuses: DEFAULT_STOCK_STATUSES,
  capacityOptions: DEFAULT_CAPACITY_OPTIONS,
  heightOptions: DEFAULT_HEIGHT_OPTIONS,
  customerTypes: DEFAULT_CUSTOMER_TYPES,
  financeCompanies: FINANCE_COMPANIES,
  saleTypes: [...SALE_TYPES],
  paymentTypes: ["เงินสด", "ไฟแนนซ์", "เครดิต", "เงินสด (NO VAT)"],
  shippingSuppliers: ["วิชิตรถสไลด์", "แก่นนครรถสไลด์", "พนมดีทัวร์", "นิวสไลด์ออน", "24 ชั่วโมงรถสไลด์"],
  customFieldDefs: [],
  saleExtraFieldDefs: [],
  salesFilterRequests: [],
  knownUsers: {},
  adminEmails: ["goodrichforklift@gmail.com"], // แอดมินเริ่มต้น — แก้ได้ที่ /admin/users
  commissionLocks: {},
  resignedStaff: [],
  staffAliases: { "เซลล์ดรีม": "ธัญญา (ดรีม)" }, // ค่าเริ่มต้น — แก้/เพิ่มเองได้ที่หน้าค่าคอม
};

type DropdownField = keyof Omit<FieldConfig, "customFieldDefs" | "saleExtraFieldDefs" | "salesFilterRequests" | "knownUsers" | "adminEmails" | "commissionLocks" | "resignedStaff" | "staffAliases">;

// ── รูปแบบไฟล์สำรอง/นำเข้าข้อมูล ──
export interface BackupData {
  app: "SalesOS";
  version: number;
  exported_at: string;
  forklifts: Forklift[];
  sales: Sale[];
  inspections: InspectionRecord[];
  fieldConfig?: Partial<FieldConfig>;
}

// ── Context type ──────────────────────────────────────────────────────────────
interface AppContextType {
  forklifts: Forklift[];
  sales: Sale[];
  inspections: InspectionRecord[];
  deletedInspections: DeletedInspectionRecord[];
  customers: Customer[];
  fieldConfig: FieldConfig;
  addCustomer: (c: Customer) => void;
  updateCustomer: (c: Customer) => void;
  deleteCustomer: (id: string) => void;
  addForklift: (f: Forklift) => void;
  addForkliftsBulk: (fs: Forklift[]) => void;
  updateForklift: (f: Forklift) => void;
  deleteForklift: (id: string) => void;
  addSale: (s: Sale) => void;
  addSalesBulk: (list: Sale[]) => void;   // นำเข้าใบขายย้อนหลังทีละหลายใบ
  updateSale: (s: Sale) => void;
  deleteSale: (saleId: string) => void;
  returnSale: (saleId: string, opts: { forkStatus: string; reason?: string; date?: string }) => void; // ลูกค้าคืนสินค้า — เก็บประวัติดีลไว้ ตัดยอด/ค่าคอมออก
  approveStockSale: (saleId: string, by?: string) => void;   // ฝ่ายสต็อกอนุมัติคำขอจอง
  rejectStockSale: (saleId: string, reason: string, by?: string) => void; // ฝ่ายสต็อกปฏิเสธ → คืนรถ
  setActor: (name: string) => void;                          // ตั้งชื่อผู้ทำรายการ (สำหรับ audit log)
  exportData: () => BackupData;
  importData: (data: BackupData) => Promise<{ forklifts: number; sales: number; inspections: number }>;
  addInspection: (r: InspectionRecord, onResult?: (ok: boolean, err?: unknown) => void) => void;
  deleteInspection: (id: string) => void;
  restoreInspection: (id: string) => void;
  purgeInspection: (id: string) => void;
  refresh: () => Promise<void>;
  // Stock form field config
  updateFieldOptions: (field: DropdownField, options: string[]) => void;
  addCustomFieldDef: (name: string, type?: "text" | "select", options?: string[]) => void;
  removeCustomFieldDef: (id: string) => void;
  renameCustomFieldDef: (id: string, name: string) => void;
  addCustomFieldOption: (id: string, option: string) => void;
  removeCustomFieldOption: (id: string, idx: number) => void;
  editCustomFieldOption: (id: string, idx: number, val: string) => void;
  // Checkout extra field defs
  addSaleExtraFieldDef: (name: string, type?: "text" | "select", options?: string[]) => void;
  removeSaleExtraFieldDef: (id: string) => void;
  renameSaleExtraFieldDef: (id: string, name: string) => void;
  addSaleExtraFieldOption: (id: string, option: string) => void;
  removeSaleExtraFieldOption: (id: string, idx: number) => void;
  editSaleExtraFieldOption: (id: string, idx: number, val: string) => void;
  // Sales filter requests
  addSalesFilterRequest: (name: string) => void;
  removeSalesFilterRequest: (name: string) => void;
  toggleResignedStaff: (name: string, resigned: boolean) => void;
  setStaffAlias: (alias: string, canonical: string | null) => void;
  // ล็อก/ปลดล็อก snapshot ค่าคอมรายเดือน
  setCommissionLock: (month: string, lock: CommissionLock | null) => void;
}

const AppContext = createContext<AppContextType | null>(null);

// ── LocalStorage helpers ──────────────────────────────────────────────────────
const LS_KEYS = {
  forklifts:    "salesos_forklifts_v4",
  sales:        "salesos_sales_v2",
  inspMeta:     "salesos_insp_meta_v2",
  inspImages:   "salesos_insp_images_v2",
  deleted:      "salesos_deleted_insp_v2",
  deletedImages:"salesos_deleted_images_v2",
  fieldConfig:  "salesos_field_config_v2",
  customers:    "salesos_customers_v1",
} as const;

function lsLoad<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); if (v) return JSON.parse(v) as T; } catch {}
  return fallback;
}
function lsSave(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

function stripImages<T extends InspectionRecord>(arr: T[]): T[] {
  return arr.map(r => ({ ...r, images: [] as string[] }));
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// ── Provider ──────────────────────────────────────────────────────────────────
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted]     = useState(false);
  const [forklifts, setForklifts] = useState<Forklift[]>(mockForklifts);
  const [sales, setSales]         = useState<Sale[]>(mockSales);
  const [inspections, setInspections]         = useState<InspectionRecord[]>(mockInspections);
  const [deletedInspections, setDeletedInspections] = useState<DeletedInspectionRecord[]>([]);
  const [customers, setCustomers]             = useState<Customer[]>([]);
  const [fieldConfig, setFieldConfig]         = useState<FieldConfig>(DEFAULT_FIELD_CFG);

  // ref ข้อมูลล่าสุด — ใช้หา forklift/sale ตอนต้องอัปเดตสถานะรถผ่าน API
  const forkliftsRef   = useRef<Forklift[]>(forklifts);
  const customersRef   = useRef<Customer[]>(customers);
  useEffect(() => { customersRef.current = customers; }, [customers]);
  const salesRef       = useRef<Sale[]>(sales);
  const inspectionsRef = useRef<InspectionRecord[]>(inspections);
  const lastLocalEditRef = useRef(0); // เวลาที่แก้ข้อมูลในเครื่องล่าสุด — กัน auto-refresh ทับของที่เพิ่ง optimistic
  useEffect(() => { forkliftsRef.current = forklifts; }, [forklifts]);
  useEffect(() => { salesRef.current = sales; }, [sales]);
  useEffect(() => { inspectionsRef.current = inspections; }, [inspections]);

  // ── Audit log: ใครทำอะไรเมื่อไหร่ (จุดสำคัญ) ──
  const actorRef = useRef<string>("ระบบ");
  const setActor = useCallback((name: string) => { actorRef.current = (name || "").trim() || "ระบบ"; }, []);
  const logAudit = useCallback((action: string, entity: string, entityId: string, detail?: unknown) => {
    if (!api.apiEnabled) return;
    api.addAuditApi({ actor: actorRef.current, action, entity, entity_id: entityId, detail: detail ?? null }).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;

    // โหลดจาก localStorage (ใช้เป็น cache / fallback เมื่อไม่มี GAS หรือออฟไลน์)
    const loadFromLocal = () => {
      setForklifts(lsLoad(LS_KEYS.forklifts, mockForklifts));
      setSales(lsLoad(LS_KEYS.sales, mockSales));
      const savedMeta = lsLoad<InspectionRecord[]>(LS_KEYS.inspMeta, []);
      const savedImages = lsLoad<Record<string, string[]>>(LS_KEYS.inspImages, {});
      if (savedMeta.length > 0) {
        setInspections(savedMeta.map(r => ({ ...r, images: savedImages[r.id] ?? [] })));
      }
      const rawDeleted = lsLoad<DeletedInspectionRecord[]>(LS_KEYS.deleted, []);
      const deletedImages = lsLoad<Record<string, string[]>>(LS_KEYS.deletedImages, {});
      const now = Date.now();
      setDeletedInspections(
        rawDeleted
          .filter(r => now - new Date(r.deletedAt).getTime() < SEVEN_DAYS_MS)
          .map(r => ({ ...r, images: deletedImages[r.id] ?? [] }))
      );
      const lsOverride = lsLoad<Partial<FieldConfig>>(LS_KEYS.fieldConfig, {});
      setFieldConfig({ ...DEFAULT_FIELD_CFG, ...lsOverride });
      setCustomers(lsLoad<Customer[]>(LS_KEYS.customers, []));
    };

    (async () => {
      // โหลดจาก Google Sheets (ผ่าน GAS) ถ้าตั้งค่า NEXT_PUBLIC_GAS_URL ไว้
      if (api.apiEnabled) {
        try {
          const data = await api.bootstrap();
          if (cancelled) return;
          setForklifts(data.forklifts ?? []);
          setSales(data.sales ?? []);
          setInspections((data.inspections ?? []) as InspectionRecord[]);
          setDeletedInspections((data.deletedInspections ?? []) as DeletedInspectionRecord[]);
          setCustomers(data.customers ?? []);
          setFieldConfig({ ...DEFAULT_FIELD_CFG, ...(data.fieldConfig as Partial<FieldConfig>) });
          setMounted(true);
          return;
        } catch (e) {
          console.warn("โหลดข้อมูลจาก Google Sheets ไม่สำเร็จ — ใช้ข้อมูลในเครื่องแทน", e);
        }
      }
      if (cancelled) return;
      loadFromLocal();
      setMounted(true);
    })();

    return () => { cancelled = true; };
  }, []);

  // ── Realtime (Supabase) — เปลี่ยนที่ไหนเด้งทุกเครื่องทันที ──
  // ⚠️ บทเรียน 14 ก.ย. 2569: Supabase ระงับทั้งโปรเจกต์ (HTTP 402 exceed_egress_quota) ล็อกอินไม่ได้ทุกคน
  //    ต้นเหตุ: ทุกแท็บที่เปิดค้างโหลด "ข้อมูลทั้งหมด" (รถ ~1,000 คัน + ดีล + บันทึกรับรถพร้อมรูป + ลูกค้า)
  //    ใหม่ทุก 30 วิ (ผู้ขนส่ง 20 วิ) และโหลดใหม่ทั้งก้อนทุกครั้งที่ใครแก้อะไร 1 แถว → ดาต้าขาออกทะลุโควตา
  //    แก้: (1) realtime อัปเดตเฉพาะแถวที่เปลี่ยนจาก payload ไม่โหลดใหม่ทั้งหมด
  //         (2) poll เหลือเป็นแค่ตาข่ายกันพลาด — 5 นาที (ผู้ขนส่งไม่มี realtime = 2 นาที)
  //         (3) กลับมาที่แท็บ ดึงสดได้แต่ห่างกันอย่างน้อย 1 นาที
  useEffect(() => {
    if (!mounted || !api.apiEnabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastPull = Date.now();                 // เพิ่งโหลดตอนเปิดหน้า

    const pull = async () => {
      lastPull = Date.now();
      try {
        const data = await api.bootstrap();
        setForklifts(data.forklifts ?? []);
        setSales(data.sales ?? []);
        setInspections((data.inspections ?? []) as InspectionRecord[]);
        setDeletedInspections((data.deletedInspections ?? []) as DeletedInspectionRecord[]);
        setCustomers(data.customers ?? []);
        // ไม่อัปเดต fieldConfig จาก realtime — กัน loop การเซฟกลับ
      } catch (e) { console.warn("realtime pull", e); }
    };
    // สำรอง: payload ไม่มีข้อมูลแถว (RLS กรอง/ผิดรูปแบบ) → ค่อยโหลดทั้งหมด แบบรวบหลาย event เป็นครั้งเดียว
    const fullPullSoon = () => { clearTimeout(timer); timer = setTimeout(pull, 1500); };

    // ── อัปเดตเฉพาะแถวที่เปลี่ยน (แทนการโหลดทั้งตาราง) ──
    type Row = Record<string, unknown> & { id?: unknown };
    type RtPayload = { eventType?: string; new?: Row; old?: Row };
    const upsert = <T extends { id: string }>(list: T[], row: Row): T[] => {
      const i = list.findIndex((x) => String(x.id) === String(row.id));
      if (i < 0) return [row as unknown as T, ...list];
      const next = list.slice();
      next[i] = { ...list[i], ...(row as unknown as T) };
      return next;
    };
    const drop = <T extends { id: string }>(list: T[], id: unknown): T[] => list.filter((x) => String(x.id) !== String(id));
    const applyRow = <T extends { id: string }>(set: React.Dispatch<React.SetStateAction<T[]>>) => (p: RtPayload) => {
      const ev = p.eventType;
      if (ev === "DELETE") { if (p.old?.id == null) return fullPullSoon(); set((l) => drop(l, p.old!.id)); return; }
      if (!p.new || p.new.id == null) return fullPullSoon();
      set((l) => upsert(l, p.new!));
    };
    // บันทึกรับรถลบแบบ soft (deleted_at) → ย้ายระหว่างรายการปกติกับถังขยะ
    const applyInspection = (p: RtPayload) => {
      if (p.eventType === "DELETE") {
        if (p.old?.id == null) return fullPullSoon();
        setInspections((l) => drop(l, p.old!.id));
        setDeletedInspections((l) => drop(l, p.old!.id));
        return;
      }
      const row = p.new;
      if (!row || row.id == null) return fullPullSoon();
      if (row.deleted_at) {
        setInspections((l) => drop(l, row.id));
        setDeletedInspections((l) => upsert(l, { ...row, deletedAt: row.deleted_at }));
      } else {
        setDeletedInspections((l) => drop(l, row.id));
        setInspections((l) => upsert(l, row));
      }
    };

    // ⭐ ส่ง JWT ล็อกอินให้ realtime ก่อน subscribe — RLS เปิดอยู่ ถ้าไม่ setAuth event จะถูกบล็อก (anon เห็น 0 แถว) = ไม่ instant
    let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | undefined;
    let authSub: { subscription: { unsubscribe: () => void } } | undefined;
    (async () => {
      try {
        const { data } = await supabase!.auth.getSession();
        if (data.session?.access_token) supabase!.realtime.setAuth(data.session.access_token);
      } catch {}
      channel = supabase?.channel("salesos-db")
        .on("postgres_changes", { event: "*", schema: "public", table: "forklifts" }, applyRow(setForklifts))
        .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, applyRow(setSales))
        .on("postgres_changes", { event: "*", schema: "public", table: "inspections" }, applyInspection)
        .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, applyRow(setCustomers))
        .subscribe();
      // token refresh → อัปเดตให้ realtime ด้วย (กัน event หลุดหลัง token หมดอายุ)
      authSub = supabase?.auth.onAuthStateChange((_e, s) => { if (s?.access_token) supabase!.realtime.setAuth(s.access_token); }).data;
    })();

    // ตาข่ายกันพลาด (realtime หลุด/พลาด event) — ไม่ใช่ช่องทางหลักอีกต่อไป
    // หน้าผู้ขนส่ง (anon) ไม่ได้ realtime (RLS) จึงถี่กว่า แต่ก็ไม่ถี่แบบเดิม
    const isAnonTransporter = typeof window !== "undefined" && window.location.pathname.includes("/transporter");
    const POLL_MS = isAnonTransporter ? 2 * 60_000 : 5 * 60_000;
    const MIN_GAP_MS = 60_000;                 // กลับมาที่แท็บ: ดึงสดได้ แต่ห่างจากครั้งก่อนอย่างน้อย 1 นาที
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastPull > MIN_GAP_MS) pull();
    };
    document.addEventListener("visibilitychange", onVisible);
    const id = setInterval(() => { if (document.visibilityState === "visible") pull(); }, POLL_MS);

    return () => {
      if (channel) supabase?.removeChannel(channel);
      authSub?.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(id); clearTimeout(timer);
    };
  }, [mounted]);

  useEffect(() => { if (mounted) lsSave(LS_KEYS.forklifts, forklifts); }, [forklifts, mounted]);
  useEffect(() => { if (mounted) lsSave(LS_KEYS.sales, sales); }, [sales, mounted]);
  useEffect(() => { if (mounted) lsSave(LS_KEYS.customers, customers); }, [customers, mounted]);
  useEffect(() => {
    if (!mounted) return;
    lsSave(LS_KEYS.inspMeta, stripImages(inspections));
    const imgMap: Record<string, string[]> = {};
    inspections.forEach(r => { if (r.images.length > 0) imgMap[r.id] = r.images; });
    lsSave(LS_KEYS.inspImages, imgMap);
  }, [inspections, mounted]);
  useEffect(() => {
    if (!mounted) return;
    lsSave(LS_KEYS.deleted, stripImages(deletedInspections as InspectionRecord[]).map(
      (r, i) => ({ ...r, deletedAt: (deletedInspections[i] as DeletedInspectionRecord).deletedAt })
    ));
    const deletedImgMap: Record<string, string[]> = {};
    deletedInspections.forEach(r => { if (r.images.length > 0) deletedImgMap[r.id] = r.images; });
    lsSave(LS_KEYS.deletedImages, deletedImgMap);
  }, [deletedInspections, mounted]);
  useEffect(() => {
    if (!mounted) return;
    lsSave(LS_KEYS.fieldConfig, fieldConfig);
    if (api.apiEnabled) api.saveFieldConfigApi(fieldConfig).catch(() => {});
  }, [fieldConfig, mounted]);

  // ── Customer CRUD (เฟส 3) ──────────────────────────────────────────────────
  const addCustomer = useCallback((c: Customer) => {
    lastLocalEditRef.current = Date.now();
    setCustomers(p => [c, ...p]);
    if (api.apiEnabled) api.addCustomerApi(c).catch(e => console.warn("addCustomer", e));
  }, []);
  const updateCustomer = useCallback((c: Customer) => {
    lastLocalEditRef.current = Date.now();
    setCustomers(p => p.map(x => x.id === c.id ? c : x));
    if (api.apiEnabled) api.updateCustomerApi(c).catch(e => console.warn("updateCustomer", e));
  }, []);
  const deleteCustomer = useCallback((id: string) => {
    lastLocalEditRef.current = Date.now();
    setCustomers(p => p.filter(x => x.id !== id));
    if (api.apiEnabled) api.deleteCustomerApi(id).catch(e => console.warn("deleteCustomer", e));
  }, []);

  // ── Forklift CRUD ─────────────────────────────────────────────────────────
  const addForklift = useCallback((f: Forklift) => {
    lastLocalEditRef.current = Date.now();
    setForklifts(p => [f, ...p]);
    if (api.apiEnabled) api.addForkliftApi(f).catch(e => console.warn("addForklift", e));
  }, []);
  // เพิ่มรถหลายคันพร้อมกัน (อัปโหลดจากไฟล์) — optimistic + upsert เป็นก้อน
  const addForkliftsBulk = useCallback((fs: Forklift[]) => {
    if (fs.length === 0) return;
    lastLocalEditRef.current = Date.now();
    setForklifts(p => [...fs, ...p]);
    if (api.apiEnabled) api.bulkUpsertForkliftsApi(fs).catch(e => console.warn("addForkliftsBulk", e));
    logAudit(`นำเข้ารถเข้าสต็อก ${fs.length} คัน`, "forklift", fs[0].id, { count: fs.length, ids: fs.slice(0, 20).map(f => f.id), pi: fs[0].pi_no });
  }, []);
  const updateForklift = useCallback((f: Forklift) => {
    const before = forkliftsRef.current.find(x => x.id === f.id);
    lastLocalEditRef.current = Date.now();
    setForklifts(p => p.map(x => x.id === f.id ? f : x));
    if (api.apiEnabled) api.updateForkliftApi(f).catch(e => console.warn("updateForklift", e));
    // ⭐ (23 ก.ย. 2569) ชื่อยี่ห้อ/รุ่นในใบขายเป็น "สำเนาข้อความ" ไม่ได้ join กับทะเบียนรถ
    //    แก้ชื่อรุ่นที่รถแล้วใบขายยังค้างชื่อเก่า → รายงาน (รุ่นขายดี/วางแผนสั่งสต็อก) ยังโชว์ชื่อผิด
    //    จึงอัปเดตใบขายของคันนั้นตามไปด้วย (เฉพาะยี่ห้อ/รุ่น — ฟิลด์อื่นของใบขายไม่แตะ)
    // ⭐ (25 ก.ย. 2569) SN ก็เป็นสำเนาในใบขาย (forklift_unit_no) — รถสั่งผลิตที่เพิ่งได้ SN
    //    ใบขายจะค้างรหัสชั่วคราว (PI#4) ทำให้หน้าประวัติการขายโชว์ "PI#4" แทน SN จริง
    const snFilled = !String(before?.SN ?? "").trim() && !!String(f.SN ?? "").trim();
    if (before && (String(before.model ?? "") !== String(f.model ?? "") || String(before.brand ?? "") !== String(f.brand ?? "") || snFilled)) {
      const linked = salesRef.current.filter(s => s.forklift_id === f.id);
      if (linked.length) {
        const fix = (s: Sale): Sale => ({
          ...s, forklift_brand: f.brand, forklift_model: f.model,
          // เติม SN ลงใบขายเมื่อรถเพิ่งได้ SN (ของเดิมเป็นรหัสชั่วคราว/ว่าง เท่านั้น — ไม่ทับ SN ที่กรอกไว้แล้ว)
          ...(snFilled && (!String(s.forklift_unit_no ?? "").trim() || isPendingId(s.forklift_unit_no))
            ? { forklift_unit_no: f.SN } : {}),
        });
        setSales(p => p.map(s => (s.forklift_id === f.id ? fix(s) : s)));
        if (api.apiEnabled) linked.forEach(s => api.updateSaleApi(fix(s)).catch(e => console.warn("sync sale model", e)));
        logAudit("แก้ชื่อรุ่นในใบขายตามรถ", "forklift", f.id, {
          from: `${before.brand} ${before.model}`, to: `${f.brand} ${f.model}`, ใบขายที่อัปเดต: linked.length,
        });
      }
    }
    // audit: log เฉพาะ field สำคัญที่เปลี่ยน
    if (before) {
      const ch: Record<string, { from: unknown; to: unknown }> = {};
      (["status", "cost_price", "stock_price", "location", "SN", "received_date", "pi_no"] as (keyof Forklift)[])
        .forEach(k => { if (String(before[k] ?? "") !== String(f[k] ?? "")) ch[k] = { from: before[k] ?? "", to: f[k] ?? "" }; });
      if (Object.keys(ch).length) logAudit(ch.status ? "เปลี่ยนสถานะรถ" : "แก้ไขข้อมูลรถ", "forklift", f.id, { model: `${f.brand} ${f.model}`, changes: ch });
    }
  }, []);
  const deleteForklift = useCallback((id: string) => {
    const before = forkliftsRef.current.find(f => f.id === id);
    lastLocalEditRef.current = Date.now();
    setForklifts(p => p.filter(f => f.id !== id));
    if (api.apiEnabled) api.deleteForkliftApi(id).catch(e => console.warn("deleteForklift", e));
    logAudit("ลบรถออกจากสต็อก", "forklift", id, before ? { model: `${before.brand} ${before.model}`, SN: before.SN, status: before.status } : null);
  }, []);

  // ── Sale CRUD ─────────────────────────────────────────────────────────────
  // อัปโหลดรูปหลักฐานการชำระ (base64 → Drive URL) ถ้ายังไม่ได้อัปโหลด
  const uploadPaymentProof = async (s: Sale): Promise<Sale> => {
    // อัปโหลด base64 ที่ยังค้าง → Drive URL (ปกติหน้าขายอัปตอนแนบแล้ว นี่คือ fallback)
    const up = async (b64: string, i: number) => {
      const mime = /^data:(.*?);base64,/.exec(b64)?.[1] || "image/jpeg";
      return (await api.uploadImageApi(b64, mime, `payment_${s.id}_${i}`)).url;
    };
    let out = s;
    try {
      // หลายรูป (payment_proofs)
      if (Array.isArray(s.payment_proofs) && s.payment_proofs.some(p => p.startsWith("data:"))) {
        const urls = await Promise.all(s.payment_proofs.map((p, i) => p.startsWith("data:") ? up(p, i) : Promise.resolve(p)));
        out = { ...out, payment_proofs: urls, payment_proof: urls[0] ?? out.payment_proof };
      }
      // รูปเดี่ยว (backward compat)
      if (out.payment_proof && out.payment_proof.startsWith("data:")) {
        out = { ...out, payment_proof: await up(out.payment_proof, 0) };
      }
      return out;
    } catch (e) { console.warn("upload payment_proof", e); return out; } // อัปไม่ได้ → เก็บ base64 ไปก่อน
  };
  // สถานะรถตามดีล → ชุดสถานะรวมใหม่ (5 ส.ค. 2026): ติดจอง(รอโอนมัดจำ)/มัดจำแล้ว-เงินสด/มัดจำแล้ว-ไฟแนนซ์/ปิดการขายแล้ว
  const forkliftStatusForSale = (s: Sale): string => {
    const st = String(s.sale_status ?? "").trim();
    const pay = String(s.payment_type ?? "");
    const isFin = pay.includes("ไฟแนนซ์") || st.includes("ไฟแนนซ์");
    if (!st || st === "ขายแล้ว" || st.includes("ปิดการขาย") || st.includes("จัดส่งแล้ว") || st.includes("ส่งมอบ")) return "ปิดการขายแล้ว";
    if (st === "จอง" || st === "จอง/รอโอน" || st === "จองมัดจำ") return "ติดจอง (รอโอนมัดจำ)"; // จองไว้ ยังไม่โอนมัดจำ
    // มัดจำแล้ว / รอไฟแนนซ์ / รอจัดส่ง → มัดจำแล้ว แยกตามการชำระ
    if (st.includes("มัดจำ") || st.includes("ไฟแนนซ์") || st === "รอจัดส่ง") return isFin ? "มัดจำแล้ว/ไฟแนนซ์" : "มัดจำแล้ว/เงินสด";
    return st; // ค่าใหม่ผ่านตรงๆ
  };
  // ── ยกเลิกเกตอนุมัติจอง (5 ส.ค. 2026): เซลล์จอง → ตั้งสถานะรถทันที ไม่ต้องรอสต็อกอนุมัติ ──
  const approvalOf = (s: Sale) => String(s.custom_fields?.[STOCK_APPROVAL_FIELD] ?? "");
  const forkStatusGated = (s: Sale): string => {
    if (approvalOf(s) === "ปฏิเสธ") return "พร้อมขาย";  // ดีลเก่าที่เคยถูกปฏิเสธ → คืนรถ
    return forkliftStatusForSale(s);                    // ตั้งสถานะตามดีลตรงๆ
  };
  const withApprovalMarker = (s: Sale): Sale => s;      // ไม่มีเกตอนุมัติแล้ว

  const addSale = useCallback((s0: Sale) => {
    lastLocalEditRef.current = Date.now();
    // จอง/กันสต็อก → ติดมาร์ก "รออนุมัติ" · ปิดการขายจริง → ตัดจองออกอัตโนมัติ (ไม่ต้องรอสต็อก)
    const s = withApprovalMarker(s0);
    setSales(p => [s, ...p]); // optimistic (โชว์รูป base64 ทันที)
    const nextStatus = forkStatusGated(s);
    setForklifts(p => p.map(f => f.id === s.forklift_id ? { ...f, status: nextStatus } : f));
    if (api.apiEnabled) {
      (async () => {
        const saved = await uploadPaymentProof(s);
        if (saved !== s) setSales(p => p.map(x => x.id === s.id ? saved : x)); // เปลี่ยน base64 → URL
        api.addSaleApi(saved).catch(e => console.warn("addSale", e));
        const target = forkliftsRef.current.find(f => f.id === s.forklift_id);
        if (target) api.updateForkliftApi({ ...target, status: nextStatus }).catch(e => console.warn("updateForklift", e));
      })();
    }
    logAudit("บันทึกการขาย/จอง", "sale", s.id, { forklift: s.forklift_id, model: `${s.forklift_brand} ${s.forklift_model}`, status: s.sale_status, customer: s.customer_name, amount: s.actual_sale });
  }, []);
  // ── เพิ่มใบขายทีละหลายใบ (นำเข้าใบขายย้อนหลังจากไฟล์บัญชี) ──
  // (25 ก.ย. 2569) รถหลายร้อยคันมีสถานะ "ขายแล้ว" แต่ไม่มีใบขาย → ไม่มีชื่อเซลล์/ลูกค้า
  // เรียก addSale ทีละใบ = ยิง API หลายร้อยครั้ง → ใช้ bulk upsert ครั้งเดียวแทน
  const addSalesBulk = useCallback((list: Sale[]) => {
    if (list.length === 0) return;
    lastLocalEditRef.current = Date.now();
    setSales(p => {
      const m = new Map(p.map(x => [x.id, x]));
      list.forEach(x => m.set(x.id, x));
      return [...m.values()];
    });
    // สถานะรถให้ตรงกับใบขายที่เพิ่ง เติมเข้าไป (เช่น คันที่ยังค้าง "พร้อมขาย" ทั้งที่ขายไปแล้ว)
    const status = new Map(list.map(x => [x.forklift_id, forkStatusGated(x)]));
    const touched: Forklift[] = [];
    setForklifts(p => p.map(f => {
      const st = status.get(f.id);
      if (!st || f.status === st) return f;
      const next = { ...f, status: st };
      touched.push(next);
      return next;
    }));
    if (api.apiEnabled) {
      (async () => {
        await api.bulkUpsertSalesApi(list).catch(e => console.warn("addSalesBulk", e));
        if (touched.length) await api.bulkUpsertForkliftsApi(touched).catch(e => console.warn("addSalesBulk/forklifts", e));
      })();
    }
    logAudit(`นำเข้าใบขายย้อนหลัง ${list.length} ใบ`, "sale", list[0].id,
      { count: list.length, ids: list.slice(0, 20).map(x => x.id), forklifts: touched.length });
  }, []);

  // แก้ไขดีลที่ทำไปแล้ว — อัปเดตข้อมูล + ปรับสถานะรถ (เคารพเกตอนุมัติ · ปิดการขายจริงตัดจองอัตโนมัติ)
  const updateSale = useCallback((s0: Sale) => {
    lastLocalEditRef.current = Date.now();
    const s = withApprovalMarker(s0);
    const nextStatus = forkStatusGated(s);
    setSales(p => p.map(x => x.id === s.id ? s : x));
    setForklifts(p => p.map(f => f.id === s.forklift_id ? { ...f, status: nextStatus } : f));
    if (api.apiEnabled) {
      (async () => {
        const saved = await uploadPaymentProof(s);
        if (saved !== s) setSales(p => p.map(x => x.id === s.id ? saved : x));
        api.updateSaleApi(saved).catch(e => console.warn("updateSale", e));
        const target = forkliftsRef.current.find(f => f.id === s.forklift_id);
        if (target) api.updateForkliftApi({ ...target, status: nextStatus }).catch(e => console.warn("updateForklift", e));
      })();
    }
  }, []);
  // ── ฝ่ายสต็อกอนุมัติ/ปฏิเสธคำขอจอง ──
  const approveStockSale = useCallback((saleId: string, by?: string) => {
    lastLocalEditRef.current = Date.now();
    const sale = salesRef.current.find(s => s.id === saleId);
    if (!sale) return;
    const stamp = new Date().toLocaleString("th-TH");
    const ns: Sale = { ...sale, custom_fields: { ...(sale.custom_fields || {}), [STOCK_APPROVAL_FIELD]: "อนุมัติแล้ว", "อนุมัติเมื่อ": stamp, "อนุมัติโดย": by || "สต็อก" } };
    const finalStatus = forkStatusGated(ns); // = สถานะจริงตามดีล (จอง/รอจัดส่ง/...)
    setSales(p => p.map(x => x.id === saleId ? ns : x));
    setForklifts(p => p.map(f => f.id === sale.forklift_id ? { ...f, status: finalStatus } : f));
    if (api.apiEnabled) {
      api.updateSaleApi(ns).catch(e => console.warn("approveSale", e));
      const target = forkliftsRef.current.find(f => f.id === sale.forklift_id);
      if (target) api.updateForkliftApi({ ...target, status: finalStatus }).catch(e => console.warn("updateForklift", e));
    }
    logAudit("อนุมัติจอง", "sale", saleId, { forklift: sale.forklift_id, model: `${sale.forklift_brand} ${sale.forklift_model}`, customer: sale.customer_name, by: by || "สต็อก" });
  }, []);
  const rejectStockSale = useCallback((saleId: string, reason: string, by?: string) => {
    lastLocalEditRef.current = Date.now();
    const sale = salesRef.current.find(s => s.id === saleId);
    if (!sale) return;
    const stamp = new Date().toLocaleString("th-TH");
    const ns: Sale = { ...sale, custom_fields: { ...(sale.custom_fields || {}), [STOCK_APPROVAL_FIELD]: "ปฏิเสธ", "เหตุผลปฏิเสธ": reason || "", "อนุมัติเมื่อ": stamp, "อนุมัติโดย": by || "สต็อก" } };
    setSales(p => p.map(x => x.id === saleId ? ns : x));
    setForklifts(p => p.map(f => f.id === sale.forklift_id ? { ...f, status: "พร้อมขาย" } : f)); // คืนรถสู่สต็อก
    if (api.apiEnabled) {
      api.updateSaleApi(ns).catch(e => console.warn("rejectSale", e));
      const target = forkliftsRef.current.find(f => f.id === sale.forklift_id);
      if (target) api.updateForkliftApi({ ...target, status: "พร้อมขาย" }).catch(e => console.warn("updateForklift", e));
    }
    logAudit("ปฏิเสธจอง", "sale", saleId, { forklift: sale.forklift_id, model: `${sale.forklift_brand} ${sale.forklift_model}`, customer: sale.customer_name, reason: reason || "", by: by || "สต็อก" });
  }, []);

  const deleteSale = useCallback((saleId: string) => {
    lastLocalEditRef.current = Date.now();
    const sale = salesRef.current.find(s => s.id === saleId);
    setSales(prev => {
      if (sale) setForklifts(fls => fls.map(f => f.id === sale.forklift_id ? { ...f, status: "พร้อมขาย" } : f));
      return prev.filter(s => s.id !== saleId);
    });
    if (api.apiEnabled) {
      api.deleteSaleApi(saleId).catch(e => console.warn("deleteSale", e));
      if (sale) {
        const target = forkliftsRef.current.find(f => f.id === sale.forklift_id);
        if (target) api.updateForkliftApi({ ...target, status: "พร้อมขาย" }).catch(e => console.warn("updateForklift", e));
      }
    }
  }, []);

  // ── รับคืนสินค้า (ลูกค้าคืน) ──────────────────────────────────────────────
  // เก็บ record ขายเดิมไว้ครบ (ลูกค้า/เซลล์/ยอด/ใบกำกับ) แต่ติดสถานะ "คืนสินค้า"
  // → isClosedSale=false ทำให้หลุดจากยอดขาย/ค่าคอมอัตโนมัติ · ยังโชว์ในประวัติพร้อมป้าย "คืนแล้ว"
  const returnSale = useCallback((saleId: string, opts: { forkStatus: string; reason?: string; date?: string }) => {
    lastLocalEditRef.current = Date.now();
    const sale = salesRef.current.find(s => s.id === saleId);
    if (!sale) return;
    const when = opts.date || new Date().toISOString().slice(0, 10);
    const fStatus = opts.forkStatus || "เคลม/รับกลับ"; // ปลายทางรถ: พร้อมขาย (ขายใหม่) หรือ เคลม/รับกลับ (พักไว้)
    const ns: Sale = { ...sale, sale_status: "คืนสินค้า", custom_fields: { ...(sale.custom_fields || {}), "คืนสินค้าเมื่อ": when, "เหตุผลคืน": opts.reason || "", "สถานะก่อนคืน": sale.sale_status || "" } };
    setSales(p => p.map(x => x.id === saleId ? ns : x));
    setForklifts(p => p.map(f => f.id === sale.forklift_id ? { ...f, status: fStatus } : f));
    if (api.apiEnabled) {
      api.updateSaleApi(ns).catch(e => console.warn("returnSale", e));
      const target = forkliftsRef.current.find(f => f.id === sale.forklift_id);
      if (target) api.updateForkliftApi({ ...target, status: fStatus }).catch(e => console.warn("updateForklift", e));
    }
    logAudit("รับคืนสินค้า", "sale", saleId, { forklift: sale.forklift_id, model: `${sale.forklift_brand} ${sale.forklift_model}`, customer: sale.customer_name, amount: sale.actual_sale, reason: opts.reason || "", ปลายทางรถ: fStatus });
  }, []);

  // ── Inspection CRUD ───────────────────────────────────────────────────────
  const addInspection = useCallback((r: InspectionRecord, onResult?: (ok: boolean, err?: unknown) => void) => {
    lastLocalEditRef.current = Date.now();
    setInspections(p => [r, ...p]); // optimistic — แสดงรูป base64 ทันที
    if (!api.apiEnabled) { onResult?.(true); return; }
    (async () => {
      // ⭐ บันทึก record ก่อนเลย (มีรูป base64) — กันข้อมูลหายถ้า Google Drive ช้า/ล่ม/ค้าง
      //    (addInspectionApi เป็น upsert → บันทึกซ้ำ id เดิมได้ · เดิมรออัป Drive ก่อน insert ทำให้หายถ้าอัปพัง)
      try {
        await api.addInspectionApi(r);
        onResult?.(true); // insert ลง DB สำเร็จ (รูปยัง base64 · อัป Drive ต่อเบื้องหลัง)
      } catch (e) {
        console.warn("addInspection insert(base64)", e); // insert ไม่ผ่าน → แจ้งผู้ใช้ + คงไว้ใน state รอ retry
        onResult?.(false, e);
        return;
      }
      // อัปรูป base64 → Google Drive แล้ว "อัปเดต record" เป็น URL เบื้องหลัง (ทีละรูป · fail คง base64 ไว้)
      const urlMap = new Map<string, string>();
      let anyUploaded = false;
      const urls = await Promise.all((r.images || []).map(async (img) => {
        if (!img.startsWith("data:")) return img; // เป็น URL อยู่แล้ว
        try {
          const mime = /^data:(.*?);base64,/.exec(img)?.[1] || "image/jpeg";
          const url = (await api.uploadImageApi(img, mime, `${r.unit_no}_${r.id}`)).url;
          urlMap.set(img, url); anyUploaded = true;
          return url;
        } catch (e) {
          console.warn("uploadImage failed — คง base64 ไว้ใน DB", e);
          return img; // อัปไม่ขึ้น → คง base64 (บันทึกไว้แล้ว ไม่หาย · ลองใหม่ทีหลังได้)
        }
      }));
      if (!anyUploaded) return; // ไม่มีรูปที่อัปขึ้น Drive สำเร็จ → base64 ยังอยู่ใน DB แล้ว จบ
      const slots = r.image_slots
        ? Object.fromEntries(Object.entries(r.image_slots).map(([k, v]) => [k, (v && urlMap.get(v)) ?? v]))
        : undefined;
      const record: InspectionRecord = { ...r, images: urls, image_slots: slots as InspectionRecord["image_slots"] };
      lastLocalEditRef.current = Date.now();
      setInspections(p => p.map(x => x.id === r.id ? record : x)); // เปลี่ยน base64 → URL (เท่าที่อัปสำเร็จ)
      try {
        await api.addInspectionApi(record); // upsert ทับด้วย URL
      } catch (e) {
        console.warn("addInspection update(url)", e);
      }
    })();
  }, []);
  const deleteInspection = useCallback((id: string) => {
    lastLocalEditRef.current = Date.now();
    setInspections(prev => {
      const item = prev.find(r => r.id === id);
      if (item) setDeletedInspections(d => [{ ...item, deletedAt: new Date().toISOString() }, ...d]);
      return prev.filter(r => r.id !== id);
    });
    if (api.apiEnabled) api.deleteInspectionApi(id).catch(e => console.warn("deleteInspection", e));
  }, []);
  const restoreInspection = useCallback((id: string) => {
    lastLocalEditRef.current = Date.now();
    setDeletedInspections(prev => {
      const item = prev.find(r => r.id === id);
      if (item) {
        const { deletedAt: _dt, ...record } = item;
        setInspections(ins => [record, ...ins]);
      }
      return prev.filter(r => r.id !== id);
    });
    if (api.apiEnabled) api.restoreInspectionApi(id).catch(e => console.warn("restoreInspection", e));
  }, []);
  const purgeInspection = useCallback((id: string) => {
    lastLocalEditRef.current = Date.now();
    setDeletedInspections(p => p.filter(r => r.id !== id));
    if (api.apiEnabled) api.purgeInspectionApi(id).catch(e => console.warn("purgeInspection", e));
  }, []);

  // ── Shared field-config helper ─────────────────────────────────────────────
  const updateFieldOptions = useCallback((field: DropdownField, options: string[]) => {
    setFieldConfig(prev => ({ ...prev, [field]: options }));
  }, []);

  // ── Stock custom field CRUD ───────────────────────────────────────────────
  const addCustomFieldDef = useCallback((name: string, type: "text" | "select" = "text", options: string[] = []) => {
    const def: CustomFieldDef = { id: `cf_${Date.now()}`, name: name.trim(), type, options: type === "select" ? options : undefined };
    setFieldConfig(prev => ({ ...prev, customFieldDefs: [...prev.customFieldDefs, def] }));
  }, []);
  const removeCustomFieldDef = useCallback((id: string) => {
    setFieldConfig(prev => ({ ...prev, customFieldDefs: prev.customFieldDefs.filter(d => d.id !== id) }));
  }, []);
  const renameCustomFieldDef = useCallback((id: string, name: string) => {
    setFieldConfig(prev => ({
      ...prev,
      customFieldDefs: prev.customFieldDefs.map(d => d.id === id ? { ...d, name: name.trim() } : d),
    }));
  }, []);
  const addCustomFieldOption = useCallback((id: string, option: string) => {
    setFieldConfig(prev => ({
      ...prev,
      customFieldDefs: prev.customFieldDefs.map(d =>
        d.id === id ? { ...d, options: [...(d.options ?? []), option.trim()] } : d
      ),
    }));
  }, []);
  const removeCustomFieldOption = useCallback((id: string, idx: number) => {
    setFieldConfig(prev => ({
      ...prev,
      customFieldDefs: prev.customFieldDefs.map(d =>
        d.id === id ? { ...d, options: (d.options ?? []).filter((_, i) => i !== idx) } : d
      ),
    }));
  }, []);
  const editCustomFieldOption = useCallback((id: string, idx: number, val: string) => {
    setFieldConfig(prev => ({
      ...prev,
      customFieldDefs: prev.customFieldDefs.map(d => {
        if (d.id !== id) return d;
        const opts = [...(d.options ?? [])]; opts[idx] = val.trim(); return { ...d, options: opts };
      }),
    }));
  }, []);

  // ── Sale extra field CRUD (checkout form) ─────────────────────────────────
  const addSaleExtraFieldDef = useCallback((name: string, type: "text" | "select" = "text", options: string[] = []) => {
    const def: CustomFieldDef = { id: `sef_${Date.now()}`, name: name.trim(), type, options: type === "select" ? options : undefined };
    setFieldConfig(prev => ({ ...prev, saleExtraFieldDefs: [...prev.saleExtraFieldDefs, def] }));
  }, []);
  const removeSaleExtraFieldDef = useCallback((id: string) => {
    setFieldConfig(prev => ({ ...prev, saleExtraFieldDefs: prev.saleExtraFieldDefs.filter(d => d.id !== id) }));
  }, []);
  const renameSaleExtraFieldDef = useCallback((id: string, name: string) => {
    setFieldConfig(prev => ({
      ...prev,
      saleExtraFieldDefs: prev.saleExtraFieldDefs.map(d => d.id === id ? { ...d, name: name.trim() } : d),
    }));
  }, []);
  const addSaleExtraFieldOption = useCallback((id: string, option: string) => {
    setFieldConfig(prev => ({
      ...prev,
      saleExtraFieldDefs: prev.saleExtraFieldDefs.map(d =>
        d.id === id ? { ...d, options: [...(d.options ?? []), option.trim()] } : d
      ),
    }));
  }, []);
  const removeSaleExtraFieldOption = useCallback((id: string, idx: number) => {
    setFieldConfig(prev => ({
      ...prev,
      saleExtraFieldDefs: prev.saleExtraFieldDefs.map(d =>
        d.id === id ? { ...d, options: (d.options ?? []).filter((_, i) => i !== idx) } : d
      ),
    }));
  }, []);
  const editSaleExtraFieldOption = useCallback((id: string, idx: number, val: string) => {
    setFieldConfig(prev => ({
      ...prev,
      saleExtraFieldDefs: prev.saleExtraFieldDefs.map(d => {
        if (d.id !== id) return d;
        const opts = [...(d.options ?? [])]; opts[idx] = val.trim(); return { ...d, options: opts };
      }),
    }));
  }, []);

  // ── Sales filter requests ─────────────────────────────────────────────────
  const addSalesFilterRequest = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setFieldConfig(prev => {
      if (prev.salesFilterRequests.includes(trimmed)) return prev;
      return { ...prev, salesFilterRequests: [...prev.salesFilterRequests, trimmed] };
    });
  }, []);
  const removeSalesFilterRequest = useCallback((name: string) => {
    setFieldConfig(prev => ({ ...prev, salesFilterRequests: prev.salesFilterRequests.filter(r => r !== name) }));
  }, []);

  // ── ล็อก/ปลดล็อก snapshot ค่าคอมรายเดือน (freeze ตัวเลขหลังจ่าย) ──
  const setCommissionLock = useCallback((month: string, lock: CommissionLock | null) => {
    if (!month) return;
    setFieldConfig(prev => {
      const locks = { ...(prev.commissionLocks || {}) };
      if (lock) locks[month] = lock; else delete locks[month];
      return { ...prev, commissionLocks: locks };
    });
  }, []);

  // เพิ่ม/ถอน เซลล์ลาออก (ตามชื่อบนดีล) — โชว์ "(ลาออก)" ต่อท้าย · ไม่แตะข้อมูลเก่า
  const toggleResignedStaff = useCallback((name: string, resigned: boolean) => {
    const n = (name || "").trim(); if (!n) return;
    setFieldConfig(prev => {
      const set = new Set(prev.resignedStaff || []);
      if (resigned) set.add(n); else set.delete(n);
      return { ...prev, resignedStaff: [...set] };
    });
  }, []);

  // ตั้ง/ลบ ชื่อพ้องเซลล์ (alias → ชื่อจริง) — canonical="" หรือ =alias เพื่อลบ · รวมเซลล์คนเดียวกัน
  const setStaffAlias = useCallback((alias: string, canonical: string | null) => {
    const a = (alias || "").trim(); if (!a) return;
    const c = (canonical || "").trim();
    setFieldConfig(prev => {
      const m = { ...(prev.staffAliases || {}) };
      if (c && c !== a) m[a] = c; else delete m[a];
      return { ...prev, staffAliases: m };
    });
  }, []);

  // ── สำรอง / นำเข้าข้อมูล (กันข้อมูลหายถ้าระบบมีปัญหา) ──
  const exportData = useCallback((): BackupData => ({
    app: "SalesOS",
    version: 1,
    exported_at: new Date().toISOString(),
    forklifts: forkliftsRef.current,
    sales: salesRef.current,
    inspections: inspectionsRef.current,
    fieldConfig,
  }), [fieldConfig]);

  // นำเข้าข้อมูลจากไฟล์สำรอง — เขียนทับด้วย upsert (ไม่ลบของเดิมที่ไม่มีในไฟล์)
  const importData = useCallback(async (data: BackupData) => {
    if (!data || data.app !== "SalesOS" || !Array.isArray(data.forklifts)) {
      throw new Error("ไฟล์ไม่ถูกต้อง — ต้องเป็นไฟล์สำรองของ SalesOS เท่านั้น");
    }
    const fks = data.forklifts ?? [], sls = data.sales ?? [], ins = data.inspections ?? [];
    // อัปเดต state ทันที (optimistic) — รวมกับของเดิม โดยของในไฟล์ทับ id ที่ซ้ำ
    const mergeById = <T extends { id: string }>(cur: T[], incoming: T[]) => {
      const map = new Map(cur.map(x => [x.id, x]));
      incoming.forEach(x => map.set(x.id, x));
      return [...map.values()];
    };
    setForklifts(p => mergeById(p, fks));
    setSales(p => mergeById(p, sls));
    setInspections(p => mergeById(p, ins as InspectionRecord[]));
    if (data.fieldConfig) setFieldConfig(prev => ({ ...prev, ...data.fieldConfig }));
    if (api.apiEnabled) {
      if (fks.length) await api.bulkUpsertForkliftsApi(fks);
      if (sls.length) await api.bulkUpsertSalesApi(sls);
      if (ins.length) await api.bulkUpsertInspectionsApi(ins as InspectionRecord[]);
    }
    return { forklifts: fks.length, sales: sls.length, inspections: ins.length };
  }, []);

  // ดึงข้อมูลใหม่จาก Google Sheets ทันที (ปุ่มรีเฟรชเอง)
  const refresh = useCallback(async () => {
    if (!api.apiEnabled) return;
    try {
      const data = await api.bootstrap();
      setForklifts(data.forklifts ?? []);
      setSales(data.sales ?? []);
      setInspections((data.inspections ?? []) as InspectionRecord[]);
      setDeletedInspections((data.deletedInspections ?? []) as DeletedInspectionRecord[]);
      setCustomers(data.customers ?? []);
    } catch (e) { console.warn("refresh", e); }
  }, []);

  return (
    <AppContext.Provider value={{
      forklifts, sales, inspections, deletedInspections, customers, fieldConfig,
      addCustomer, updateCustomer, deleteCustomer,
      addForklift, addForkliftsBulk, updateForklift, deleteForklift,
      addSale, addSalesBulk, updateSale, deleteSale, returnSale, approveStockSale, rejectStockSale, setActor,
      exportData, importData,
      addInspection, deleteInspection, restoreInspection, purgeInspection,
      refresh,
      updateFieldOptions,
      addCustomFieldDef, removeCustomFieldDef, renameCustomFieldDef,
      addCustomFieldOption, removeCustomFieldOption, editCustomFieldOption,
      addSaleExtraFieldDef, removeSaleExtraFieldDef, renameSaleExtraFieldDef,
      addSaleExtraFieldOption, removeSaleExtraFieldOption, editSaleExtraFieldOption,
      addSalesFilterRequest, removeSalesFilterRequest,
      toggleResignedStaff,
      setStaffAlias,
      setCommissionLock,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}
