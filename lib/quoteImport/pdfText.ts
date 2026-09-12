"use client";
// lib/quoteImport/pdfText.ts — อ่าน text layer ของ PDF ในเบราว์เซอร์ (pdfjs-dist)
// ทำงานฝั่ง client 100% ไฟล์ไม่ออกนอกเครื่อง
//
// ⭐ สำคัญ (12 ก.ย. 2569): ต้อง **เรียงข้อความตามตำแหน่งจริงบนหน้ากระดาษ** ก่อนส่งให้ parser
//    เดิมต่อข้อความตามลำดับที่ฝังใน PDF (`items.map(str).join(" ")`) ซึ่ง "ไม่ใช่ลำดับที่ตาเห็น"
//    ใบ HCTH-BFL2026091402 ของจริงฝังมาแบบ: ตัวเลขทั้งคอลัมน์มาก่อน → ชื่อรุ่นอยู่ท้ายไฟล์
//    และ **CBD20-WS มาก่อน CBD15-WS (สลับกับที่พิมพ์บนใบ)**
//    → parser จับรุ่นคู่กับจำนวนผิดหมด = ต้นตอที่แท้จริงของบั๊ก "อ่านใบผิดรุ่น/ผิดจำนวน"
//    ตอนนี้จัดเรียงใหม่ตามพิกัด (บน→ล่าง · ซ้าย→ขวา) ให้เหมือนที่คนอ่าน แล้วค่อยส่งต่อ

// lazy-load pdfjs เฉพาะตอนใช้ (ก้อนใหญ่ ไม่อยากติด bundle หน้าอื่น)
let _lib: typeof import("pdfjs-dist") | null = null;
/** โหลด pdfjs ครั้งเดียวแล้วใช้ซ้ำ — ใช้ทั้งอ่าน text layer และเรนเดอร์หน้าไป OCR */
export async function getPdfjs() {
  if (_lib) return _lib;
  const lib = await import("pdfjs-dist");
  // worker แยกไฟล์ — bundler แปลง URL นี้เป็น asset จริงตอน build
  lib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
  _lib = lib;
  return lib;
}

interface Cell { x: number; y: number; h: number; s: string }

/**
 * จัดข้อความเป็นบรรทัดตามตำแหน่งจริง — คืนข้อความแบบที่ "ตาอ่าน" ไม่ใช่ลำดับที่ฝังในไฟล์
 * pdfjs ให้ transform = [a,b,c,d,e,f] · e = แกน X · f = แกน Y (จุดกำเนิดอยู่มุมล่างซ้าย)
 */
export function orderTextItems(items: unknown[]): string {
  const cells: Cell[] = [];
  for (const it of items) {
    const o = it as { str?: string; transform?: number[]; height?: number };
    const s = typeof o.str === "string" ? o.str : "";
    if (!s.trim() || !Array.isArray(o.transform)) continue;
    cells.push({
      x: o.transform[4],
      y: o.transform[5],
      h: Math.abs(o.height || o.transform[3]) || 10,
      s,
    });
  }
  // บนลงล่าง (Y มาก = อยู่บน) · ตำแหน่งเท่ากันเรียงซ้ายไปขวา
  cells.sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: Cell[][] = [];
  let curY: number | null = null;
  for (const c of cells) {
    // เซลล์ที่อยู่ "แถวเดียวกัน" มี Y ต่างกันได้เล็กน้อย (ตัวอักษรคนละขนาดในแถวเดียว)
    const tol = Math.max(2, c.h * 0.6);
    if (curY === null || Math.abs(curY - c.y) > tol) { lines.push([c]); curY = c.y; }
    else lines[lines.length - 1].push(c);
  }
  return lines
    .map((l) => l.sort((a, b) => a.x - b.x).map((c) => c.s).join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** อ่านข้อความทั้งหมดจาก PDF (ทุกหน้า) — คืน "" ถ้าเป็นสแกนไม่มี text layer */
export async function readPdfText(file: File): Promise<string> {
  const lib = await getPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await lib.getDocument({ data }).promise;
  let text = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    text += orderTextItems(tc.items) + "\n";
  }
  return text;
}

/** เดาว่าเป็นสแกนไหม (text layer สั้นผิดปกติ = น่าจะสแกน ต้องใช้ OCR) */
export function looksScanned(text: string): boolean {
  return text.replace(/\s/g, "").length < 40;
}
