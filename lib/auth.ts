// lib/auth.ts — ระบบสิทธิ์ผู้ใช้ (เก็บใน fieldConfig บน Supabase app_config)
// - knownUsers: อีเมล → { name, role, status } · status ไม่มี = approved (ผู้ใช้เก่าก่อนมีระบบนี้)
// - adminEmails: รายชื่ออีเมลแอดมิน (จัดการสิทธิ์ได้ที่หน้า /admin/users)
// เส้นทางหลัก = RPC บน DB (my_access / register_me / admin_update_access — ดู supabase-phase1-rls-*.sql)
// ซึ่งทำงานถูกต้องแม้เปิด RLS · มี fallback อ่าน/เขียน config ตรงสำหรับช่วงที่ยังไม่รัน SQL เฟส 1
import * as api from "./api";
import { supabase } from "./supabaseClient";

export type KnownUserStatus = "approved" | "pending" | "blocked";
export type KnownUser = { name: string; role: string; status?: KnownUserStatus };
type CfgWithUsers = {
  knownUsers?: Record<string, KnownUser>;
  adminEmails?: string[];
} & Record<string, unknown>;

// แอดมินเริ่มต้น — ค่าจริงอยู่ที่ adminEmails ใน app_config (แก้ได้หน้า /admin/users)
export const DEFAULT_ADMIN_EMAILS = ["goodrichforklift@gmail.com"];

// บทบาทที่ระบบรองรับ + ป้ายภาษาไทย
export const ROLE_LABELS: Record<string, string> = {
  sales: "ทีมขาย",
  stock: "ฝ่ายสต็อก",
  transporter: "ผู้ขนส่ง",
};

const norm = (email: string) => email.trim().toLowerCase();

/** สถานะจริงของผู้ใช้ — ผู้ใช้เก่าที่ไม่มี status ถือว่าอนุมัติแล้ว */
export function userStatus(u: KnownUser | null | undefined): KnownUserStatus | null {
  if (!u) return null;
  return u.status ?? "approved";
}

/** มี session Supabase Auth ที่ "ใช้เขียนได้จริง" ไหม (ใช้กันหน้า main ค้างแบบไม่มีสิทธิ์)
 *  ⚠️ ต้องใช้ getUser() ไม่ใช่ getSession() — getSession อ่านจาก localStorage เฉยๆ token หมดอายุก็ยังคืน session
 *  → เขียนไม่เข้าแบบเงียบๆ (RLS มองเป็น anon) · getUser ตรวจกับ server จริง (หมดอายุ → refresh · refresh ไม่ได้ → error) */
export async function hasActiveSession(): Promise<boolean> {
  if (!supabase) return true; // โหมด local — ไม่มีระบบ session
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return false;               // ไม่มี session เลย → ต้องล็อกอิน
    const { data: u, error } = await supabase.auth.getUser(); // ตรวจ/รีเฟรชกับ server
    if (error) return false;                        // token หมดอายุ+รีเฟรชไม่ได้ → ล็อกอินใหม่
    return !!u.user;
  } catch {
    return true; // network สะดุดชั่วคราว → อย่าเพิ่งเตะออก (กัน false positive)
  }
}

/** ออกจากระบบ Supabase Auth (เรียกคู่กับการล้าง localStorage ตอน logout) */
export async function signOutSupabase(): Promise<void> {
  try { await supabase?.auth.signOut(); } catch { /* ไม่ critical */ }
}

/** อ่าน config สิทธิ์ล่าสุดจากเซิร์ฟ (ต้องเป็นผู้ใช้อนุมัติแล้ว/แอดมินเมื่อเปิด RLS) */
export async function getAccessConfig(): Promise<{
  knownUsers: Record<string, KnownUser>;
  adminEmails: string[];
}> {
  if (!api.apiEnabled) return { knownUsers: {}, adminEmails: DEFAULT_ADMIN_EMAILS };
  try {
    const cfg = (await api.getFieldConfigApi()) as CfgWithUsers;
    return {
      knownUsers: cfg?.knownUsers ?? {},
      adminEmails: (cfg?.adminEmails?.length ? cfg.adminEmails : DEFAULT_ADMIN_EMAILS).map(norm),
    };
  } catch {
    return { knownUsers: {}, adminEmails: DEFAULT_ADMIN_EMAILS };
  }
}

export function isAdminEmail(email: string, adminEmails: string[]): boolean {
  return adminEmails.map(norm).includes(norm(email));
}

/** เช็คสิทธิ์ตัวเองผ่าน RPC (เห็นเฉพาะข้อมูลตัวเอง — ใช้ได้แม้ยังไม่อนุมัติ) */
async function myAccessRpc(): Promise<{ user: KnownUser | null; is_admin: boolean } | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc("my_access");
    if (error || !data) return null;
    return data as { user: KnownUser | null; is_admin: boolean };
  } catch {
    return null;
  }
}

/** ค้นว่าอีเมลนี้เคยลงทะเบียนไว้หรือยัง (คืน null ถ้ายังไม่เคย / ไม่มี API) */
export async function lookupKnownUser(email: string): Promise<KnownUser | null> {
  const { knownUsers } = await getAccessConfig();
  const u = knownUsers[norm(email)];
  return u && u.name ? u : null;
}

/** ลงทะเบียนผู้ใช้ใหม่ (สถานะ pending — รอแอดมินอนุมัติ) */
export async function rememberKnownUser(
  email: string,
  name: string,
  role: string,
  status: KnownUserStatus = "pending",
): Promise<void> {
  if (!api.apiEnabled) return;
  // เส้นทางหลัก: RPC register_me (ทำงานใต้ RLS · ห้ามตั้ง role/status เองนอกจาก pending)
  if (supabase && status === "pending") {
    try {
      const { error } = await supabase.rpc("register_me", { p_name: name, p_role: role });
      if (!error) return;
    } catch { /* ตกไป fallback */ }
  }
  // fallback (ยังไม่รัน SQL เฟส 1): read-modify-write ทั้ง config แบบเดิม
  try {
    const cfg = ((await api.getFieldConfigApi()) as CfgWithUsers) || {};
    const users: Record<string, KnownUser> = cfg.knownUsers || {};
    users[norm(email)] = { ...users[norm(email)], name, role, status };
    cfg.knownUsers = users;
    await api.saveFullConfigApi(cfg);
  } catch { /* ไม่ critical */ }
}

/** แอดมิน: อัปเดตผู้ใช้/รายชื่อแอดมิน — เขียนผ่าน RPC (มี fallback เขียน config ตรง) */
export async function adminUpdateUsers(
  mutate: (users: Record<string, KnownUser>, adminEmails: string[]) => {
    users: Record<string, KnownUser>;
    adminEmails: string[];
  },
): Promise<void> {
  const cur = await getAccessConfig();
  const next = mutate(cur.knownUsers, cur.adminEmails);
  if (supabase) {
    try {
      const { error } = await supabase.rpc("admin_update_access", {
        p_known_users: next.users,
        p_admin_emails: next.adminEmails,
      });
      if (!error) return;
    } catch { /* ตกไป fallback */ }
  }
  // fallback (ยังไม่รัน SQL เฟส 1)
  const cfg = ((await api.getFieldConfigApi()) as CfgWithUsers) || {};
  cfg.knownUsers = next.users;
  cfg.adminEmails = next.adminEmails;
  await api.saveFullConfigApi(cfg);
}

/**
 * ตรวจสิทธิ์เข้าระบบตามบทบาทของหน้า
 * คืน ok=true เมื่อ: เป็นแอดมิน หรือ อนุมัติแล้ว+role ตรง (expectedRole ว่าง = role ไหนก็ได้)
 */
export async function checkAccess(email: string, expectedRole?: string): Promise<{
  ok: boolean;
  reason: "admin" | "approved" | "pending" | "blocked" | "unknown" | "role_mismatch";
  user: KnownUser | null;
}> {
  if (!api.apiEnabled) return { ok: true, reason: "approved", user: null }; // โหมด local/demo — ให้ผ่าน

  // เส้นทางหลัก: RPC (แม่นสุด — DB ตัดสินเอง ใช้ได้ใต้ RLS)
  const rpc = await myAccessRpc();
  const user = rpc ? rpc.user : null;
  let isAdmin = rpc ? rpc.is_admin : false;
  let known = user;

  // fallback (ยังไม่รัน SQL เฟส 1): อ่าน config ตรง
  if (!rpc) {
    const { knownUsers, adminEmails } = await getAccessConfig();
    known = knownUsers[norm(email)] ?? null;
    isAdmin = isAdminEmail(email, adminEmails);
  }

  if (isAdmin) return { ok: true, reason: "admin", user: known };
  if (!known) return { ok: false, reason: "unknown", user: null };
  const status = userStatus(known);
  if (status === "blocked") return { ok: false, reason: "blocked", user: known };
  if (status === "pending") return { ok: false, reason: "pending", user: known };
  if (expectedRole && known.role !== expectedRole) return { ok: false, reason: "role_mismatch", user: known };
  return { ok: true, reason: "approved", user: known };
}
