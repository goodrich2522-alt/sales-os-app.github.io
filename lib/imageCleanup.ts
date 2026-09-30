// lib/imageCleanup.ts — เก็บกวาดรูปที่ยัง "ฝังเป็นข้อมูลดิบ" (base64) ให้ขึ้นที่เก็บไฟล์แล้วเก็บแค่ลิงก์
//
// ที่มา (30 ก.ย. 2569): ตรวจข้อมูลจริงแล้วพบว่าระบบอัปรูปขึ้น Google Drive ได้ปกติ
// ใบตรวจรับรถ 77 ใบ มีรูปเป็นลิงก์ Drive แล้ว 453 รูป — แต่ยังเหลือฝังดิบ 15 รูป (+15 ช่องรูปแยก)
// กระจุกอยู่ใน 2 ใบ ขนาดรวม 6.3 MB จาก 6.4 MB ทั้งหมด
//
// สาเหตุ: ตอนนั้นอัปขึ้น Drive ไม่สำเร็จ โค้ดจับ error แล้ว "เก็บ base64 ไว้ก่อน" แบบเงียบ ๆ
// ไม่มีใครรู้ เลยค้างมาจนทุกวันนี้ · ทุกคนที่เปิดแอปต้องโหลดก้อนนี้ทุกครั้ง
//
// ไฟล์นี้เป็นฟังก์ชันล้วน (ไม่ยิง API เอง) — ตัวที่เรียกส่ง uploader เข้ามา

/** ค่าที่เป็นรูปฝังดิบ (ยังไม่ได้อัปขึ้นที่เก็บไฟล์) */
export const isInlineImage = (v: unknown) => String(v ?? "").startsWith("data:");

/** นับรูปฝังดิบในค่าชุดหนึ่ง (อาร์เรย์ หรือ map ของช่องรูป) */
export const countInline = (v: unknown): number => {
  if (Array.isArray(v)) return v.filter(isInlineImage).length;
  if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).filter(isInlineImage).length;
  return isInlineImage(v) ? 1 : 0;
};

/** ขนาดโดยประมาณของรูปฝังดิบ (ไบต์) — base64 ยาวกว่าไฟล์จริง ~4/3 */
export const inlineBytes = (v: unknown): number => {
  const one = (x: unknown) => (isInlineImage(x) ? Math.round(String(x).length * 0.75) : 0);
  if (Array.isArray(v)) return v.reduce((n: number, x) => n + one(x), 0);
  if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).reduce((n: number, x) => n + one(x), 0);
  return one(v);
};

/** อัปโหลดรูปฝังดิบใน "อาร์เรย์" ให้กลายเป็นลิงก์ — ตัวที่เป็นลิงก์อยู่แล้วไม่แตะ */
export async function liftArray(
  arr: string[] | undefined,
  upload: (dataUrl: string, name: string) => Promise<string>,
  namePrefix: string,
): Promise<{ out: string[]; done: number; failed: number }> {
  if (!Array.isArray(arr) || !arr.length) return { out: arr ?? [], done: 0, failed: 0 };
  let done = 0, failed = 0;
  const out = await Promise.all(arr.map(async (v, i) => {
    if (!isInlineImage(v)) return v;
    try { const url = await upload(v, `${namePrefix}_${i}`); done++; return url; }
    catch { failed++; return v; }          // อัปไม่สำเร็จ → เก็บของเดิมไว้ ไม่ทำข้อมูลหาย
  }));
  return { out, done, failed };
}

/** เหมือน liftArray แต่กับ map ของช่องรูป (image_slots) */
export async function liftMap(
  obj: Record<string, string> | undefined,
  upload: (dataUrl: string, name: string) => Promise<string>,
  namePrefix: string,
): Promise<{ out: Record<string, string>; done: number; failed: number }> {
  if (!obj || typeof obj !== "object") return { out: obj ?? {}, done: 0, failed: 0 };
  let done = 0, failed = 0;
  const entries = await Promise.all(Object.entries(obj).map(async ([k, v]) => {
    if (!isInlineImage(v)) return [k, v] as const;
    try { const url = await upload(v, `${namePrefix}_${k}`); done++; return [k, url] as const; }
    catch { failed++; return [k, v] as const; }
  }));
  return { out: Object.fromEntries(entries), done, failed };
}

/** ข้อความสรุปขนาด อ่านง่าย */
export const fmtBytes = (n: number) =>
  n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : n >= 1024 ? Math.round(n / 1024) + " KB" : n + " B";
