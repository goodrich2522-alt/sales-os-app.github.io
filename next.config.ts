import type { NextConfig } from "next";
import { execSync } from "node:child_process";

// basePath สำหรับ GitHub Pages (repo sales-os-app.github.io → เสิร์ฟที่ /sales-os-app.github.io)
// ตั้งผ่าน env ได้ (เช่น ปล่อยว่างตอนเทสต์ local) ค่าเริ่มต้น = /sales-os-app.github.io
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "/sales-os-app.github.io";

// ── ป้ายเวอร์ชัน (18 ก.ย. 2569) ──
// เอาไว้ดูว่าเครื่องที่เปิดอยู่โหลดโค้ดใหม่แล้วหรือยัง — เคยเสียเวลาไล่บั๊กที่แก้ไปแล้ว
// เพราะเบราว์เซอร์ยังใช้ไฟล์เก่า (GitHub Pages ให้ HTML แคชได้ 10 นาที)
const buildStamp = (() => {
  let rev = "dev";
  try { rev = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { /* ไม่มี git ก็ข้าม */ }
  const t = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${rev} · ${p(t.getDate())}/${p(t.getMonth() + 1)} ${p(t.getHours())}:${p(t.getMinutes())}`;
})();

const nextConfig: NextConfig = {
  output: "export",            // สร้างเว็บ static (โฟลเดอร์ out/) สำหรับ GitHub Pages
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  trailingSlash: true,         // ให้ทุกหน้าออกเป็น .../index.html (เปิดบน Pages ได้ตรง)
  images: { unoptimized: true },// GitHub Pages ไม่มี image optimizer ของ Next
  env: { NEXT_PUBLIC_BUILD: buildStamp },  // โชว์ในหน้านำเข้า — ดูว่าเครื่องนั้นใช้โค้ดเวอร์ชันไหน
};

export default nextConfig;
