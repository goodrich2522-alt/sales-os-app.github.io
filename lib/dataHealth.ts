// lib/dataHealth.ts — ตรวจสุขภาพข้อมูลสต็อก/ใบขาย (อ่านอย่างเดียว ไม่แก้อะไรเอง)
//
// ที่มา: เดิมต้องรันสคริปต์นอกแอปทุกครั้งที่อยากรู้ว่ามีข้อมูลเพี้ยนตรงไหน
// (scripts/audit-sn.mjs · scripts/audit-pi.mjs) ย้ายมาไว้ในแอปให้ทีมกดดูเองได้
// ทุกฟังก์ชันเป็น pure — ส่ง forklifts/sales เข้าไป คืนรายการที่ต้องตรวจ

import type { Forklift, Sale } from "./types";
import { modelWarning } from "./constants";
import { toIsoDate } from "./format";

/** 1 รายการที่ต้องตรวจ */
export interface HealthItem {
  id: string;            // รหัสรถ/ใบขาย (ใช้เป็น key)
  label: string;         // สิ่งที่เจอ (SN/รุ่น)
  detail: string;        // รายละเอียด + สิ่งที่ควรเป็น
  status?: string;       // สถานะรถ (ถ้ามี) — บอกว่าแก้ที่ไหน
}

/** กลุ่มการตรวจ 1 หัวข้อ */
export interface HealthCheck {
  key: string;
  title: string;
  hint: string;          // อธิบายว่าเรื่องนี้คืออะไร / แก้ยังไง
  severity: "high" | "medium";
  items: HealthItem[];
}

const t = (v: unknown) => String(v ?? "").trim();
const snOf = (f: Forklift) => t(f.SN);
const label = (f: Forklift) => `${t(f.brand)} ${t(f.model)}`.trim() || "(ไม่ระบุรุ่น)";

/** ── SN ซ้ำเป๊ะ (คนละคันแต่ SN เดียวกัน) ── */
function dupSn(forklifts: Forklift[]): HealthItem[] {
  const m = new Map<string, Forklift[]>();
  forklifts.forEach(f => {
    const sn = snOf(f).toUpperCase();
    if (!sn) return;
    m.set(sn, [...(m.get(sn) ?? []), f]);
  });
  return [...m.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([sn, list]) => ({
      id: sn,
      label: sn,
      detail: `${list.length} คันใช้ SN เดียวกัน — ${list.map(f => `${label(f)} (${t(f.status) || "—"})`).join(" · ")}`,
    }));
}

/** ── SN มีอักขระแปลก (ช่องว่างเกิน/ตัวพิมพ์เล็ก) ── */
function oddSnChars(forklifts: Forklift[]): HealthItem[] {
  return forklifts
    .filter(f => { const sn = snOf(f); return sn && /\s/.test(sn); })
    .map(f => ({
      id: f.id,
      label: snOf(f),
      detail: `มีช่องว่างใน SN — ที่ถูกน่าจะเป็น "${snOf(f).replace(/\s+/g, "")}"`,
      status: t(f.status),
    }));
}

/**
 * ── SN ความยาวไม่เท่าพวกเดียวกัน ──
 * SN ของผู้ผลิตเดียวกันจะมีจำนวนหลักคงที่ (เช่น M1BFS + 5 หลัก)
 * คันที่หลักเกิน/ขาด = พิมพ์ตกหรือเกิน (เจอจริง: M1BFS7150 ตก 0 นำหน้า · M1BFS009633 เกินมา 1 หลัก)
 */
function snLength(forklifts: Forklift[]): HealthItem[] {
  const groups = new Map<string, { f: Forklift; digits: string }[]>();
  forklifts.forEach(f => {
    const sn = snOf(f).toUpperCase();
    const m = /^(.*[A-Z])(\d+)$/.exec(sn);   // ทุกอย่างถึงตัวอักษรตัวท้าย + เลขท้าย (รองรับ 05030DU555)
    if (!m) return;
    groups.set(m[1], [...(groups.get(m[1]) ?? []), { f, digits: m[2] }]);
  });
  const out: HealthItem[] = [];
  groups.forEach((list, prefix) => {
    if (list.length < 5) return;                       // กลุ่มเล็กเกินไป ยังสรุปไม่ได้
    const count = new Map<number, number>();
    list.forEach(x => count.set(x.digits.length, (count.get(x.digits.length) ?? 0) + 1));
    const [common] = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
    list.forEach(({ f, digits }) => {
      if (digits.length === common) return;
      // สั้นไป = เกือบทุกครั้งคือตก 0 นำหน้า → เสนอค่าที่ถูกได้
      // ยาวไป = ไม่เดาทิศทาง (เคยเจอทั้งเกินหน้าและเกินหลัง เช่น M1BFS009633 → M1BFS00963)
      const guess = digits.length < common
        ? ` — น่าจะตก 0 นำหน้า → "${prefix}${digits.padStart(common, "0")}"`
        : " — เกินมา 1 หลัก เทียบกับ SN บนตัวรถ/ใบกำกับภาษีก่อนแก้ (อย่าเดา)";
      out.push({
        id: f.id,
        label: snOf(f),
        detail: `เลขท้าย ${digits.length} หลัก แต่พวก "${prefix}*" อีก ${count.get(common)} คันใช้ ${common} หลัก${guess}`,
        status: t(f.status),
      });
    });
  });
  return out;
}

/**
 * ── แถวรถสั่งผลิตค้าง ──
 * PI + รุ่นเดียวกัน มีทั้งคันที่ได้ SN จริงแล้ว และแถวรหัสชั่วคราวที่ยังไม่มี SN
 * = ตอน SN มาถึงมีการนำเข้าใหม่ทับ แถวเดิมเลยค้างเป็นรถผี (สต็อกเกินจริง)
 */
function ghostRows(forklifts: Forklift[]): HealthItem[] {
  const m = new Map<string, { withSn: Forklift[]; noSn: Forklift[] }>();
  forklifts.forEach(f => {
    const pi = t(f.pi_no);
    if (!pi) return;
    const key = `${pi}|${t(f.model).toUpperCase()}`;
    const g = m.get(key) ?? { withSn: [], noSn: [] };
    (snOf(f) ? g.withSn : g.noSn).push(f);
    m.set(key, g);
  });
  return [...m.entries()]
    .filter(([, g]) => g.withSn.length > 0 && g.noSn.length > 0)
    .map(([key, g]) => ({
      id: key,
      label: key.replace("|", " · "),
      detail: `มี SN จริง ${g.withSn.length} คัน แต่ยังมีแถวรอ SN ค้างอีก ${g.noSn.length} คัน (${g.noSn.map(f => f.id).join(", ")}) — เทียบกับใบ PI จริง ถ้าเกินให้ลบแถวที่ค้าง`,
    }));
}

/** ── ชื่อรุ่นขัดกับความจริง (เช่น CDD ที่มีคำว่า LI) ── */
function badModel(forklifts: Forklift[]): HealthItem[] {
  return forklifts
    .map(f => ({ f, warn: modelWarning(f.model) }))
    .filter(x => !!x.warn)
    .map(({ f, warn }) => ({ id: f.id, label: `${t(f.model)} (${snOf(f) || f.id})`, detail: warn!, status: t(f.status) }));
}

/** สถานะที่แปลว่า "ขายไปแล้ว" */
const SOLD = ["ปิดการขายแล้ว", "ส่งมอบแล้ว", "ขายแล้ว"];

/** ใบขายผูกกับรถคันไหน — เทียบทั้งรหัสรถและ SN (ใบเก่าบางใบผูกด้วยรหัสชั่วคราวที่เลิกใช้แล้ว) */
function saleKeys(sales: Sale[]): { byId: Set<string>; bySn: Set<string> } {
  const byId = new Set<string>(), bySn = new Set<string>();
  sales.forEach(s => {
    const id = t(s.forklift_id).toUpperCase(); if (id) byId.add(id);
    const sn = t(s.forklift_unit_no).toUpperCase(); if (sn) bySn.add(sn);
  });
  return { byId, bySn };
}

/**
 * ── รถที่ปิดการขายแล้วแต่ไม่มีใบขายผูกอยู่ ──
 * อาการที่เห็น: หน้ารับประกัน/เช็กระยะขึ้นชื่อลูกค้าและเซลล์เป็น "—"
 * สาเหตุที่พบบ่อย: เปลี่ยนสถานะเป็น "ปิดการขายแล้ว" ที่หน้าสต็อกโดยไม่ได้เปิดดีล
 * หรือดีลถูกผูกไว้กับรถคันเก่า (รหัสชั่วคราว) ที่ถูกลบ/แทนที่ไปแล้ว
 */
function soldNoSale(forklifts: Forklift[], sales: Sale[]): HealthItem[] {
  const { byId, bySn } = saleKeys(sales);
  return forklifts
    .filter(f => SOLD.includes(t(f.status)))
    .filter(f => !byId.has(t(f.id).toUpperCase()) && !(snOf(f) && bySn.has(snOf(f).toUpperCase())))
    .map(f => ({
      id: f.id,
      label: `${snOf(f) || f.id} · ${label(f)}`,
      detail: `สถานะ "${t(f.status)}" แต่ไม่มีใบขายผูกอยู่ — หน้ารับประกัน/เช็กระยะจะไม่รู้ว่าลูกค้าใคร เซลล์คนไหน${t(f.pi_no) ? ` · PI ${t(f.pi_no)}` : ""}`,
      status: t(f.status),
    }));
}

/**
 * ── ใบขายที่ผูกรถไม่เจอ (รถถูกลบ หรือรหัสรถเปลี่ยนหลังได้ SN) ──
 * ถ้า SN ในใบขายตรงกับรถที่มีอยู่ → ผูกใหม่ได้ทันที (หน้า Audit มีปุ่มให้)
 */
export function orphanSales(sales: Sale[], forklifts: Forklift[]): { s: Sale; match?: Forklift }[] {
  const byId = new Map(forklifts.map(f => [t(f.id).toUpperCase(), f]));
  const bySn = new Map(forklifts.filter(f => snOf(f)).map(f => [snOf(f).toUpperCase(), f]));
  return sales
    .filter(s => t(s.forklift_id) && !byId.has(t(s.forklift_id).toUpperCase()))
    .map(s => ({ s, match: bySn.get(t(s.forklift_unit_no).toUpperCase()) }));
}

/** สถานะรถที่แปลว่า "จอง/มัดจำ/รอไฟแนนซ์" — ขายแล้วแต่ยังไม่ปิดการขาย */
const BOOKED_RE = /จอง|มัดจำ|ไฟแนนซ์|รอจัดส่ง/;
/** รับรถเข้าคลังแล้วเกินกี่วันถึงจะเตือนให้ปิดการขาย */
export const CLOSE_SALE_ALERT_DAYS = 7;

/**
 * ── รับรถเข้าคลังแล้วแต่ยังไม่ปิดการขาย ──
 * (25 ก.ย. 2569 · ผู้ใช้สั่ง) รถถึงมือลูกค้าแล้วแต่ดีลยังค้างสถานะจอง/มัดจำ
 * → ยอดขายและค่าคอมยังไม่เข้าเดือนไหนเลย · ฝ่ายขายต้องกดปิดการขายให้จบ
 */
function receivedNotClosed(forklifts: Forklift[], sales: Sale[]): HealthItem[] {
  const byKey = new Map<string, Sale>();
  sales.forEach(s => {
    [s.forklift_id, s.forklift_unit_no].forEach(k => { const key = t(k).toUpperCase(); if (key) byKey.set(key, s); });
  });
  const now = Date.now();
  return forklifts
    .filter(f => BOOKED_RE.test(t(f.status)))
    .map(f => {
      const iso = toIsoDate(f.received_date);
      const days = iso ? Math.floor((now - new Date(iso + "T00:00:00").getTime()) / 86400000) : null;
      const deal = byKey.get(t(f.id).toUpperCase()) ?? byKey.get(snOf(f).toUpperCase());
      return { f, iso, days, deal };
    })
    .filter(x => x.days != null && x.days >= CLOSE_SALE_ALERT_DAYS)
    .sort((a, b) => (b.days ?? 0) - (a.days ?? 0))
    .map(({ f, iso, days, deal }) => ({
      id: f.id,
      label: `${snOf(f) || f.id} · ${label(f)}`,
      detail: `รับรถเข้าคลังแล้ว ${days} วัน (${iso}) แต่ดีลยังเป็น "${t(f.status)}"`
        + (deal ? ` — ลูกค้า ${t(deal.customer_name) || "(ไม่มีชื่อ)"} · เซลล์ ${t(deal.sales_staff) || "—"}` : " — ไม่พบดีลผูกอยู่")
        + " · ให้ฝ่ายขายกดปิดการขายให้จบ",
      status: t(f.status),
    }));
}

/** ── ใบขายที่ไม่ได้กรอกชื่อลูกค้า (มักเป็นดีลที่นำเข้าจากบิลภาษี) ── */
function saleNoCustomer(sales: Sale[]): HealthItem[] {
  return sales
    .filter(s => !t(s.customer_name))
    .map(s => ({
      id: s.id,
      label: `${t(s.forklift_unit_no) || t(s.forklift_id)} · ${t(s.forklift_brand)} ${t(s.forklift_model)}`.trim(),
      detail: `ใบขายนี้ไม่มีชื่อลูกค้า${t(s.sales_staff) ? ` · เซลล์ ${t(s.sales_staff)}` : " · ไม่มีชื่อเซลล์ด้วย"}${t(s.delivery_date) ? ` · ส่งมอบ ${t(s.delivery_date)}` : ""} — หน้ารับประกัน/ประวัติลูกค้าจะไม่รู้ว่าเป็นของใคร`,
      status: t(s.sale_status),
    }));
}

/** ── ใบขายที่ชื่อยี่ห้อ/รุ่นไม่ตรงกับทะเบียนรถ ── */
export function saleModelMismatch(sales: Sale[], forklifts: Forklift[]): { s: Sale; f: Forklift }[] {
  const byId = new Map(forklifts.map(f => [f.id, f]));
  const out: { s: Sale; f: Forklift }[] = [];
  sales.forEach(s => {
    const f = byId.get(s.forklift_id);
    if (!f) return;
    const modelDiff = t(s.forklift_model) && t(s.forklift_model) !== t(f.model);
    const brandDiff = t(s.forklift_brand) && t(s.forklift_brand) !== t(f.brand);
    if (modelDiff || brandDiff) out.push({ s, f });
  });
  return out;
}

/** ตรวจทั้งชุด — คืนเฉพาะหัวข้อที่ "เจอของจริง" (ไม่เจอ = ไม่ต้องโชว์) */
export function runHealthChecks(forklifts: Forklift[], sales: Sale[]): HealthCheck[] {
  const checks: HealthCheck[] = [
    { key: "dupSn", title: "SN ซ้ำกัน", severity: "high",
      hint: "คนละคันแต่ใช้ SN เดียวกัน — ถ้าผู้ผลิตให้ SN ซ้ำจริง ให้ต่อท้าย #1/#2 (ดู SN-RULES.md)",
      items: dupSn(forklifts) },
    { key: "badModel", title: "ชื่อรุ่นขัดกับความจริง", severity: "high",
      hint: "แก้ที่หน้าสต็อก → ปุ่มกรอง ⚠️ ชื่อรุ่นน่าสงสัย → แก้หลายคัน",
      items: badModel(forklifts) },
    { key: "ghost", title: "แถวรอ SN ค้าง (อาจเป็นรถผี)", severity: "high",
      hint: "SN มาแล้วแต่แถวเดิมที่ยังไม่มี SN ไม่ถูกแทนที่ → สต็อกเกินจริง เทียบกับใบ PI ก่อนลบ",
      items: ghostRows(forklifts) },
    { key: "soldNoSale", title: "ขายไปแล้วแต่ไม่มีใบขายผูกอยู่", severity: "high",
      hint: "หน้ารับประกัน/เช็กระยะจะขึ้นชื่อลูกค้าและเซลล์เป็น \"—\" · มักเกิดจากเปลี่ยนสถานะที่หน้าสต็อกโดยไม่ได้เปิดดีล หรือดีลผูกไว้กับรถคันเก่าที่ถูกแทนที่ไปแล้ว — เปิดดีลย้อนหลังให้ตรงคัน หรือเช็กว่าดีลเดิมผูกรถผิดคัน",
      items: soldNoSale(forklifts, sales) },
    { key: "recvNotClosed", title: "รับรถเข้าคลังแล้วแต่ยังไม่ปิดการขาย", severity: "high",
      hint: `รถถึงลูกค้าแล้วแต่ดีลยังค้างจอง/มัดจำเกิน ${CLOSE_SALE_ALERT_DAYS} วัน — ยอดขายและค่าคอมยังไม่เข้าเดือนไหนเลย · ให้ฝ่ายขายเปิดดีลแล้วกด "ปิดการขาย / จัดส่งแล้ว"`,
      items: receivedNotClosed(forklifts, sales) },
    { key: "saleNoCust", title: "ใบขายไม่ได้กรอกชื่อลูกค้า", severity: "medium",
      hint: "เปิดดีลนั้นในหน้าฝ่ายขายแล้วเติมชื่อลูกค้า — หน้ารับประกัน/เช็กระยะจะได้รู้ว่าเป็นของใคร (ดีลที่นำเข้าจากบิลภาษีมักไม่มีชื่อมาให้)",
      items: saleNoCustomer(sales) },
    { key: "snChars", title: "SN มีช่องว่างเกิน", severity: "medium",
      hint: "ช่องว่างใน SN ทำให้ค้นหาไม่เจอและจับคู่เอกสารพลาด",
      items: oddSnChars(forklifts) },
    { key: "snLen", title: "SN จำนวนหลักไม่เท่าพวกเดียวกัน", severity: "medium",
      hint: "มักเกิดจากพิมพ์ตก 0 นำหน้า หรือเกินมา 1 หลัก — เทียบกับ SN บนตัวรถ/ใบกำกับภาษีก่อนแก้",
      items: snLength(forklifts) },
  ];
  return checks.filter(c => c.items.length > 0);
}
