"use client";
// lib/quoteImport/pdfText.ts — อ่าน text layer ของ PDF ในเบราว์เซอร์ (pdfjs-dist)
// ทำงานฝั่ง client 100% ไฟล์ไม่ออกนอกเครื่อง · ใช้กับใบ text layer (HELI/STAXX/ROCKMAN)

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

/** อ่านข้อความทั้งหมดจาก PDF (ทุกหน้า) — คืน "" ถ้าเป็นสแกนไม่มี text layer */
export async function readPdfText(file: File): Promise<string> {
  const lib = await getPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await lib.getDocument({ data }).promise;
  let text = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    text += tc.items.map((i) => ("str" in i ? i.str : "")).join(" ") + "\n";
  }
  return text;
}

/** เดาว่าเป็นสแกนไหม (text layer สั้นผิดปกติ = น่าจะสแกน ต้องใช้ OCR) */
export function looksScanned(text: string): boolean {
  return text.replace(/\s/g, "").length < 40;
}
