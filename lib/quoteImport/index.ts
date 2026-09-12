// lib/quoteImport/index.ts — เดาผู้ผลิตจากข้อความ แล้วส่งให้ parser ของเจ้านั้น

import { parseHeli } from "./heli";
import { parseEp } from "./ep";
import { parseRockman } from "./rockman";
import { parseHangcha } from "./hangcha";
import { parseStaxxSerialSheet, parseStaxxProforma, normalizeStaxxModel } from "./staxx";
import { QuoteParseResult, QuoteVendor } from "./types";

export * from "./types";
export { isKdRef, hasKdMark, leadDaysFrom, KD_LEAD_MIN_DAYS, KD_LEAD_MAX_DAYS } from "./madeToOrder";
export { readPdfText, looksScanned } from "./pdfText";
export { readExcelRows, isExcelFile } from "./excelRead";
export { isImageFile, readImageText } from "./imageOcr";

/** เดาผู้ผลิตจากคำเฉพาะในเอกสาร */
export function detectVendor(text: string): QuoteVendor {
  if (/HELI\s*SOUTHEAST|HELI\b/i.test(text)) return "HELI";
  if (/EP\s*Distribution|ep-ep\.com|ep-zl\.com|Quote\s*No\.?\s*:?\s*EPZL/i.test(text)) return "EP";
  if (/NINGBO|STAXX/i.test(text)) return "STAXX";
  if (/cnc-?moving|rockman/i.test(text)) return "ROCKMAN";
  if (/HANGCHA/i.test(text)) return "HANGCHA";
  return "unknown";
}

/** อ่านข้อความใบเสนอราคา (PDF text layer) → รายการรถ */
export function parseQuoteText(text: string): QuoteParseResult {
  const vendor = detectVendor(text);
  switch (vendor) {
    case "HELI":
      return parseHeli(text);
    case "EP":
      return parseEp(text);
    case "ROCKMAN":
      return parseRockman(text);
    case "STAXX":
      return parseStaxxProforma(text);   // Proforma PDF → รุ่น+ราคา FOB (SN มาจาก Excel แยก)
    case "HANGCHA":
      return parseHangcha(text);         // Proforma Invoice → SN + รุ่น + สเปก + ราคา
    default:
      return { vendor, vehicles: [], rawText: text };
  }
}

export { normalizeStaxxModel };

/** อ่าน Serial No. List (Excel) → รายการรถ STAXX พร้อม SN */
export function parseQuoteExcel(rows: string[][]): QuoteParseResult {
  const vehicles = parseStaxxSerialSheet(rows);
  return { vendor: "STAXX", vehicles, rawText: "" };
}
