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

/** คำที่ต้องเจอในเอกสารจริงของผู้ผลิต — ใช้ตัดสินว่า OCR อ่านได้เนื้อความจริงหรือได้แต่ขยะ */
const DOC_WORDS = /HELI|HANGCHA|ROCKMAN|STAXX|PROFORMA|INVOICE|CONTRACT|SALES\s*CONTRACT|ใบกำกับภาษี|ใบเสนอราคา/i;
/** รหัสเอกสาร/รุ่นรถ — เจอแล้วมั่นใจว่าอ่านถูกมุม */
const DOC_CODES = /\b[A-Z]\d{6,9}-\d{2,3}\b|\bCPCD\d|\bCBD\d|\bCDD\d|\bCPD\d/i;

const looksLikeDoc = (t: string) => DOC_WORDS.test(t) && DOC_CODES.test(t);
/** คะแนนไว้เทียบว่ามุมไหนอ่านได้ดีกว่า — ให้น้ำหนักคำสำคัญมากกว่าความยาว */
const score = (r: { txt: string; conf: number }) =>
  (DOC_WORDS.test(r.txt) ? 1000 : 0) + (DOC_CODES.test(r.txt) ? 1000 : 0) + r.conf * 5 + Math.min(r.txt.length, 2000) / 100;

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

      /** เรนเดอร์หน้านี้ที่มุมที่กำหนด แล้ว OCR — คืนข้อความกับคะแนนความน่าเชื่อ */
      const tryAngle = async (rotation: number) => {
        const viewport = page.getViewport({ scale, rotation });
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
        canvas.width = 0; canvas.height = 0;   // คืนแรมทันที (ไฟล์หลายหน้า)
        return { txt: data.text || "", conf: data.confidence || 0 };
      };

      let best = await tryAngle(0);
      // ⭐ (21 ต.ค. 2569) ใบสแกนบางใบ "ตะแคง" มา — OCR อ่านตรง ๆ ได้แต่ขยะ
      //    เจอจริง C20726201-052.pdf: หมุน 0° ความมั่นใจ 36% อ่านไม่ได้สักคำ
      //    หมุน 270° ความมั่นใจ 74% อ่านออกทันที "PROFORMA INVOICE ... HELI SOUTHEAST ASIA"
      //    → ถ้าผลแรกดูไม่เข้าท่า ลองหมุนอีก 3 มุมแล้วเอาอันที่ดีที่สุด
      if (!looksLikeDoc(best.txt)) {
        for (const deg of [270, 90, 180]) {
          onProgress?.(p, pages, 0);
          const r = await tryAngle(deg);
          if (score(r) > score(best)) best = r;
          if (looksLikeDoc(best.txt)) break;   // เจอมุมที่ใช่แล้ว ไม่ต้องลองต่อ
        }
      }
      text += best.txt + "\n";
      page.cleanup();
    }
  } finally {
    await worker.terminate();
  }
  return text;
}
