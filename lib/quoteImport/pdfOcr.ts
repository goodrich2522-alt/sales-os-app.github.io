"use client";
// lib/quoteImport/pdfOcr.ts — อ่าน PDF สแกน (ไม่มี text layer) ด้วย OCR ในเครื่อง
//
// ใบกำกับภาษีจากผู้ผลิตมักเป็นไฟล์สแกน → เดิมระบบขึ้นว่า "ยังไม่รองรับ"
// ที่นี่: pdfjs เรนเดอร์แต่ละหน้าเป็นรูป → tesseract อ่านเป็นข้อความ → ส่งต่อ parser เดิม
// ทำงานในเบราว์เซอร์ 100% ไฟล์ไม่ออกนอกเครื่อง (เหมือน imageOcr.ts)
//
// ⚠️ OCR อ่าน SN ผิดได้ (เคยเจอจริง M1BFS00963 → M1BFS009633)
//    ผลที่ได้ต้องผ่านหน้าตรวจทานให้คนยืนยันเสมอ — ห้ามบันทึกตรงเข้าสต็อก

import { getPdfjs } from "./pdfText";

/** ความกว้างรูปเป้าหมายตอนเรนเดอร์ — ยิ่งใหญ่ OCR ยิ่งแม่น แต่ช้า/กินแรม */
const TARGET_WIDTH = 2200;
const MAX_SCALE = 4;

export const isPdfFile = (name: string) => /\.pdf$/i.test(name);

/**
 * อ่านข้อความจาก PDF สแกนด้วย OCR (ไทย+อังกฤษ)
 * onProgress: (หน้าที่กำลังทำ, จำนวนหน้าทั้งหมด, % ของหน้านั้น)
 */
export async function readScannedPdfText(
  file: File,
  onProgress?: (page: number, pages: number, pct: number) => void,
): Promise<string> {
  const lib = await getPdfjs();
  const { createWorker } = await import("tesseract.js");

  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = doc.numPages;

  let cur = 1;                    // หน้าที่กำลัง OCR อยู่ (logger อ่านค่านี้)
  const worker = await createWorker("tha+eng", 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") onProgress?.(cur, pages, Math.round((m.progress || 0) * 100));
    },
  });

  let text = "";
  try {
    for (let p = 1; p <= pages; p++) {
      cur = p;
      onProgress?.(p, pages, 0);

      const page = await doc.getPage(p);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(MAX_SCALE, Math.max(1, TARGET_WIDTH / base.width));
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("สร้าง canvas ไม่ได้");
      // พื้นขาวก่อนวาด — PDF บางใบพื้นโปร่งใส ทำให้ OCR อ่านไม่ออก
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;

      const { data } = await worker.recognize(canvas);
      text += (data.text || "") + "\n";

      canvas.width = 0; canvas.height = 0;   // คืนแรมทันที (ไฟล์หลายหน้า)
      page.cleanup();
    }
  } finally {
    await worker.terminate();
  }
  return text;
}
