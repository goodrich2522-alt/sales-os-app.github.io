// lib/api.ts — ตัวเชื่อมต่อฐานข้อมูล Supabase (realtime)
// คงชื่อฟังก์ชันเดิมไว้ เพื่อให้ AppContext/หน้าต่างๆ ไม่ต้องแก้
// หมายเหตุ: อัปโหลดรูป inspection ยังใช้ GAS→Drive เดิม (ยังไม่ย้ายรูป)

import { supabase, supabaseEnabled } from "./supabaseClient";
import type {
  Forklift, Sale, InspectionRecord, DeletedInspectionRecord, Customer,
} from "./types";

const GAS_URL = process.env.NEXT_PUBLIC_GAS_URL ?? "";
export const apiEnabled = supabaseEnabled;

export interface BootstrapData {
  forklifts: Forklift[];
  sales: Sale[];
  inspections: InspectionRecord[];
  deletedInspections: DeletedInspectionRecord[];
  customers: Customer[];
  fieldConfig: Record<string, unknown>;
}

function sb() {
  if (!supabase) throw new Error("Supabase ยังไม่ถูกตั้งค่า (NEXT_PUBLIC_SUPABASE_URL/ANON_KEY)");
  return supabase;
}

/** โหมดผู้ขนส่ง = ล็อกอินด้วยชื่อเล่น+เบอร์ ไม่มี Supabase session → แตะตารางตรงไม่ได้ (RLS) */
// โหมดผู้ขนส่ง = ต้องอยู่หน้า /transporter จริงๆ ด้วย — ไม่ใช่แค่มี transporter_name ค้างใน localStorage
// (เดิมเช็คแค่ localStorage ทำให้หน้าขาย/สต็อกที่เคยเปิดหน้าผู้ขนส่งมาก่อน โหลด RPC ที่ตัดราคาทุน/ดีลออก)
const isTransporterMode = () =>
  typeof window !== "undefined" &&
  window.location.pathname.includes("/transporter") &&
  !!localStorage.getItem("transporter_name");

// RPC คืน setof — PostgREST cap ที่ 1000 แถว/ครั้ง → วนดึงทีละ 1000 จนครบ (เหมือน fetchAllRows)
// กันปัญหารถเกิน 1000 คันหายจากหน้าผู้ขนส่ง (เดิมเรียก RPC ครั้งเดียว ได้แค่ 1000 คันแรก)
async function fetchAllRpc(fn: string): Promise<Record<string, unknown>[]> {
  const c = sb();
  const PAGE = 1000;
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await c.rpc(fn).range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as Record<string, unknown>[];
    out.push(...rows);
    if (rows.length < PAGE) break; // ได้ไม่ครบหน้า = หมดแล้ว
  }
  return out;
}

/** โหลดข้อมูลผ่าน RPC เฉพาะที่ผู้ขนส่งจำเป็นต้องใช้ (ไม่มีราคาทุน/ข้อมูลลูกค้า) */
async function bootstrapTransporter(): Promise<BootstrapData> {
  const [fk, ins] = await Promise.all([
    fetchAllRpc("transporter_stock"),
    fetchAllRpc("transporter_inspections"),
  ]);
  return {
    forklifts: fk as unknown as Forklift[],
    sales: [],                                   // ผู้ขนส่งไม่มีสิทธิ์เห็นดีลขาย
    inspections: ins as unknown as InspectionRecord[],
    deletedInspections: [],
    customers: [],                               // ผู้ขนส่งไม่เห็นข้อมูลลูกค้า
    fieldConfig: {},                             // ใช้ค่าเริ่มต้นในเครื่องแทน
  };
}

// ดึงทุกแถวของตาราง — Supabase/PostgREST คืนสูงสุด 1000 แถว/ครั้ง → วนดึงทีละ 1000 จนครบ
// (เดิมใช้ .limit(20000) แต่ถูก cap ที่ 1000 ทำให้รถเกิน 1000 คันหายไป)
async function fetchAllRows(table: string): Promise<Record<string, unknown>[]> {
  const c = sb();
  const PAGE = 1000;
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await c.from(table).select("*").range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as Record<string, unknown>[];
    out.push(...rows);
    if (rows.length < PAGE) break; // ได้ไม่ครบหน้า = หมดแล้ว
  }
  return out;
}

// ── อ่านข้อมูลทั้งหมดครั้งเดียว ──────────────────────────────────────────────
export async function bootstrap(): Promise<BootstrapData> {
  if (isTransporterMode()) return bootstrapTransporter();
  const c = sb();
  const [fkRows, slRows, insRows, custRows, cfg] = await Promise.all([
    fetchAllRows("forklifts"),
    fetchAllRows("sales"),
    fetchAllRows("inspections"),
    fetchAllRows("customers"),
    c.from("app_config").select("data").eq("id", 1).maybeSingle(),
  ]);
  const fk = { data: fkRows as unknown as Forklift[] };
  const sl = { data: slRows as unknown as Sale[] };
  const insAll = insRows as unknown as (InspectionRecord & { deleted_at?: string | null })[];
  const active = insAll.filter(r => !r.deleted_at) as InspectionRecord[];
  const deleted = insAll.filter(r => r.deleted_at).map(r => ({ ...r, deletedAt: r.deleted_at as string })) as DeletedInspectionRecord[];
  return {
    forklifts: (fk.data ?? []) as Forklift[],
    sales: (sl.data ?? []) as Sale[],
    inspections: active,
    deletedInspections: deleted,
    customers: (custRows as unknown as Customer[]) ?? [],
    fieldConfig: ((cfg.data as { data?: Record<string, unknown> } | null)?.data) ?? {},
  };
}

// ── Customer (ทะเบียนลูกค้า — เฟส 3) ──────────────────────────────────────────
export const addCustomerApi    = async (c: Customer) => { const { error } = await sb().from("customers").insert(c); if (error) throw error; };
export const updateCustomerApi = async (c: Customer) => {
  const { id, ...rest } = c;
  const { error } = await sb().from("customers").update({ ...rest, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
};
export const deleteCustomerApi = async (id: string) => { const { error } = await sb().from("customers").delete().eq("id", id); if (error) throw error; };

// ── Forklift ────────────────────────────────────────────────────────────────
export const addForkliftApi    = async (f: Forklift) => { const { error } = await sb().from("forklifts").upsert(f); if (error) throw error; return { id: f.id }; };
// ใช้ update ตรง (ไม่ใช่ upsert) — ใต้ RLS เซลล์/ผู้ขนส่งมีสิทธิ์แค่ UPDATE ไม่มี INSERT
export const updateForkliftApi = async (f: Forklift) => {
  // โหมดผู้ขนส่ง → แก้ได้เฉพาะ SN / PI / วันรับ / สถานะ ผ่าน RPC
  if (isTransporterMode()) {
    const { error } = await sb().rpc("transporter_set_forklift", {
      p_id: f.id, p_sn: f.SN ?? "", p_pi_no: f.pi_no ?? "",
      p_received_date: f.received_date ?? "", p_status: f.status ?? "",
    });
    if (error) throw error;
    return;
  }
  const { id, ...rest } = f;
  const { error } = await sb().from("forklifts").update(rest).eq("id", id);
  if (error) throw error;
};
export const deleteForkliftApi = async (id: string)  => { const { error } = await sb().from("forklifts").delete().eq("id", id); if (error) throw error; };

// ── Sale ──────────────────────────────────────────────────────────────────--
// ถ้าคอลัมน์ payment_proof ยังไม่มีใน DB (ยังไม่รัน migration) → retry แบบไม่มีคอลัมน์นี้ กันดีลหาย
export const addSaleApi = async (s: Sale) => {
  const { error } = await sb().from("sales").upsert(s);
  if (error) {
    const { payment_proof: _pp, payment_proofs: _pps, ...core } = s;
    const { error: e2 } = await sb().from("sales").upsert(core);
    if (e2) throw error;
  }
  return { id: s.id };
};
// แก้ไขดีลที่ทำไปแล้ว — update ตรงตาม id (ไม่สร้างใหม่)
export const updateSaleApi = async (s: Sale) => {
  const { id, ...rest } = s;
  const { error } = await sb().from("sales").update(rest).eq("id", id);
  if (error) {
    const { payment_proof: _pp, payment_proofs: _pps, ...core } = rest;
    const { error: e2 } = await sb().from("sales").update(core).eq("id", id);
    if (e2) throw error;
  }
};
export const deleteSaleApi = async (id: string) => { const { error } = await sb().from("sales").delete().eq("id", id); if (error) throw error; };

// ── Audit log (บันทึกประวัติการแก้ไขจุดสำคัญ) ─────────────────────────────────
export interface AuditEntry { id?: number; at?: string; actor?: string; action?: string; entity?: string; entity_id?: string; detail?: unknown; }
export const addAuditApi = async (e: AuditEntry) => {
  if (!apiEnabled) return;
  const { error } = await sb().from("audit_log").insert(e);
  if (error) throw error;
};
export const fetchAuditApi = async (limit = 1000): Promise<AuditEntry[]> => {
  const { data, error } = await sb().from("audit_log").select("*").order("at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as AuditEntry[];
};

// ── Bulk upsert (นำเข้าข้อมูลสำรอง / อัปโหลดสต็อกหลายคัน) — แบ่งก้อนละ 200 ──
async function bulkUpsert<T extends object>(table: string, rows: T[]) {
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb().from(table).upsert(rows.slice(i, i + 200));
    if (error) throw error;
  }
}
export const bulkUpsertForkliftsApi   = (rows: Forklift[])         => bulkUpsert("forklifts", rows);
export const bulkUpsertSalesApi       = (rows: Sale[])            => bulkUpsert("sales", rows);
export const bulkUpsertInspectionsApi = (rows: InspectionRecord[]) => bulkUpsert("inspections", rows.map(r => ({ ...r, deleted_at: null })));

// ── Inspection (soft delete = ตั้ง deleted_at) ─────────────────────────────--
export const addInspectionApi = async (r: InspectionRecord) => {
  // โหมดผู้ขนส่ง → เขียนผ่าน RPC (ไม่มี session จึงแตะตารางตรงไม่ได้)
  if (isTransporterMode()) {
    const common = {
      p_ins_id: r.id, p_unit_no: r.unit_no, p_name: r.transporter_name,
      p_phone: r.transporter_phone ?? "", p_date: r.date, p_images: r.images ?? [],
    };
    const { error } = r.role === "ผู้ส่งมอบรถ"
      ? await sb().rpc("transporter_deliver", {
          ...common, p_company: r.delivery_company ?? "", p_location: r.location_link ?? "" })
      : await sb().rpc("transporter_receive", {
          ...common, p_image_slots: r.image_slots ?? {},
          p_forklift_id: "", p_sn: "", p_pi_no: "", p_received_date: "" });
    if (error) throw error;
    return { id: r.id };
  }
  const { error } = await sb().from("inspections").upsert({ ...r, deleted_at: null });
  if (error) {
    // ⭐ FALLBACK: insert ตรงล้มเหลว (session หมดอายุ/RLS บล็อก 42501 · หรือขาดคอลัมน์)
    //    → เขียนผ่าน RPC SECURITY DEFINER (แบบผู้ขนส่ง) ที่ไม่ต้องมี session · ส่ง forklift ว่าง = ไม่แตะสถานะรถ
    //    (แก้ปัญหาฝ่ายสต็อก session ตายแล้วบันทึกรูปไม่เข้าแบบเงียบๆ)
    const rpcRes = r.role === "ผู้ส่งมอบรถ"
      ? await sb().rpc("transporter_deliver", {
          p_ins_id: r.id, p_unit_no: r.unit_no, p_name: r.transporter_name, p_phone: r.transporter_phone ?? "",
          p_date: r.date, p_images: r.images ?? [], p_company: r.delivery_company ?? "", p_location: r.location_link ?? "" })
      : await sb().rpc("transporter_receive", {
          p_ins_id: r.id, p_unit_no: r.unit_no, p_name: r.transporter_name, p_phone: r.transporter_phone ?? "",
          p_date: r.date, p_images: r.images ?? [], p_image_slots: r.image_slots ?? {},
          p_forklift_id: "", p_sn: "", p_pi_no: "", p_received_date: "" }); // forklift ว่าง = ไม่เปลี่ยนสถานะรถ
    if (rpcRes.error) {
      // สุดท้าย: ยังไม่ได้รัน migration (ขาดคอลัมน์ image_slots/delivery_company/location_link) → ตัดคอลัมน์ใหม่ทิ้ง
      const { image_slots: _slots, delivery_company: _dc, location_link: _ll, ...core } = r;
      const retry = await sb().from("inspections").upsert({ ...core, deleted_at: null });
      if (retry.error) throw error;
      console.warn("inspections ขาดคอลัมน์ใหม่ — รัน supabase-migration-2026-07-14.sql");
    }
  }
  return { id: r.id };
};
export const deleteInspectionApi  = async (id: string) => {
  // โหมดผู้ขนส่ง → ลบได้เฉพาะรายการที่ตัวเองบันทึก (RPC เช็คชื่อให้)
  if (isTransporterMode()) {
    const { error } = await sb().rpc("transporter_delete_inspection", {
      p_id: id, p_name: localStorage.getItem("transporter_name") ?? "",
    });
    if (error) throw error;
    return;
  }
  const { error } = await sb().from("inspections").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
};
export const restoreInspectionApi = async (id: string) => { const { error } = await sb().from("inspections").update({ deleted_at: null }).eq("id", id); if (error) throw error; };
export const purgeInspectionApi   = async (id: string) => { const { error } = await sb().from("inspections").delete().eq("id", id); if (error) throw error; };

// ── FieldConfig (เก็บใน app_config id=1) ────────────────────────────────────--
export const getFieldConfigApi  = async () => { const { data } = await sb().from("app_config").select("data").eq("id", 1).maybeSingle(); return ((data as { data?: Record<string, unknown> } | null)?.data) ?? {}; };
// เซฟผ่าน RPC merge_field_config — merge เฉพาะ key ที่ส่ง + DB ตัด knownUsers/adminEmails ทิ้งเสมอ
// (สิทธิ์ผู้ใช้แก้ได้ทาง admin_update_access เท่านั้น กันเครื่องที่ config เก่าทับสิทธิ์ที่แอดมินเพิ่งแก้)
export const saveFieldConfigApi = async (cfg: unknown) => {
  const { knownUsers: _ku, adminEmails: _ae, ...clean } = (cfg ?? {}) as Record<string, unknown>;
  const { error } = await sb().rpc("merge_field_config", { cfg: clean });
  if (error) {
    // fallback (ยังไม่รัน SQL เฟส 1): upsert ทั้งก้อนแบบเดิม
    const { error: e2 } = await sb().from("app_config").upsert({ id: 1, data: cfg });
    if (e2) throw e2;
  }
};
// เขียน config ทั้งก้อนตรงๆ (รวม knownUsers/adminEmails) — ใช้เฉพาะ fallback ของระบบสิทธิ์
// ช่วงที่ยังไม่รัน SQL เฟส 1 เท่านั้น · เมื่อเปิด RLS แล้วเส้นทางนี้จะถูก DB ปฏิเสธเอง
export const saveFullConfigApi = async (cfg: unknown) => {
  const { error } = await sb().from("app_config").upsert({ id: 1, data: cfg });
  if (error) throw error;
};

// ── อัปโหลดรูป inspection → ยังใช้ GAS→Drive เดิม ───────────────────────────
export const uploadImageApi = async (base64: string, mimeType: string, fileName: string) => {
  if (!GAS_URL) throw new Error("ไม่มี GAS_URL สำหรับอัปโหลดรูป");
  const res = await fetch(GAS_URL, {
    method: "POST", redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "uploadImage", payload: { base64, mimeType, fileName } }),
  });
  const json = (await res.json()) as { ok: boolean; data?: { url: string; fileId: string }; error?: string };
  if (!json.ok) throw new Error(json.error || "upload error");
  return json.data as { url: string; fileId: string };
};
