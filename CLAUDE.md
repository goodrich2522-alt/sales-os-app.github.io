# CLAUDE.md — SalesOS-App (คู่มือสร้างแอป)

> ไฟล์นี้ = context สำหรับ **เขียนโค้ดแอปโดยเฉพาะ** ไม่ใช่เรื่องการตลาด/ธุรกิจ
> (business context อยู่ที่ CLAUDE.md ของโฟลเดอร์แม่ — แอปนี้ตั้งใจไม่ inherit)
> **ภาษา:** UI + คอมเมนต์โค้ด = ภาษาไทย · ตอบผู้ใช้ = ภาษาไทย

## แอปคืออะไร
SalesOS — ระบบจัดการขาย + สต็อกรถโฟล์คลิฟท์ ของ Good & Rich แบบเรียลไทม์
3 บทบาท: **ผู้ขนส่ง (transporter)** · **ฝ่ายสต็อก (stock)** · **ทีมขาย (sales)** + **แดชบอร์ด**

---

## Tech Stack (ตรึงเวอร์ชัน — เช็คก่อนสมมติ)
| ส่วน | ใช้ |
|------|-----|
| Framework | **Next.js 16.2.7** (App Router) · `output: "export"` = **static site** |
| UI | **React 19.2** · TypeScript 5 · **Tailwind v4** (`@tailwindcss/postcss`) |
| ไอคอน / กราฟ | `lucide-react` · `recharts` |
| Data | **Supabase** (realtime) + localStorage cache · อัปโหลดรูปยังใช้ **GAS→Drive** |
| Font | Sarabun (`next/font/google`, subset thai+latin) |
| Deploy | GitHub Actions → **GitHub Pages** (push `master`) |

> ⚠️ **Next.js 16 มี breaking changes** — เวลาไม่แน่ใจ API/convention ให้อ่านของจริงที่
> `node_modules/next/dist/...` อย่าเดาจากเวอร์ชันเก่า

---

## ข้อจำกัดสำคัญ (static export)
- **ไม่มี server** — ห้ามใช้ API Routes, Server Actions, middleware, `next/image` optimizer (`images.unoptimized: true`)
- ทุกอย่าง **client-side** — หน้าเกือบทั้งหมดเป็น `"use client"`
- **basePath = `/sales-os-app.github.io`** — อ้าง asset/manifest ต้องผ่าน `NEXT_PUBLIC_BASE_PATH` (ดู `layout.tsx`, `next.config.ts`)
- `trailingSlash: true` — ทุกหน้าออกเป็น `.../index.html`

---

## สถาปัตยกรรม
```
app/
  page.tsx                 หน้า landing เลือกบทบาท
  layout.tsx               ครอบด้วย <AppProvider> + Sarabun
  {transporter,stock,sales}/{login,main}/page.tsx
  admin/users/page.tsx     หน้าแอดมิน — อนุมัติ/ระงับ/กำหนด role ผู้ใช้
  dashboard/page.tsx       สถิติ/กราฟ (recharts) — เฉพาะผู้ใช้อนุมัติแล้ว
  dashboard/inspections/   ประวัติตรวจรับรถ
components/
  AiAssistant.tsx          "พี่เก่ง" — scaffold (ดูล่าง)
  charts/Charts.tsx · GoogleLoginButton.tsx
lib/
  AppContext.tsx           ⭐ state กลางทั้งแอป (source of truth)
  api.ts                   ตัวเชื่อม Supabase (CRUD)
  supabaseClient.ts        สร้าง client (null ถ้าไม่มี env)
  types.ts                 โดเมนไทป์ + INSPECTION_SLOTS (รูปบังคับ 6 ช่อง)
  auth.ts                  ระบบสิทธิ์: knownUsers (approved/pending/blocked) + adminEmails
  productId.ts             สร้างรหัสรถจาก SN (= forklifts.id) — ดู SN-RULES.md
  mockData.ts              default dropdown + mock fallback
```

### ระบบที่ต้องรู้ (เพิ่ม 13 ก.ค. 2026)
- **SN คือรหัสรถ** — `forklifts.id` = SN ตรงๆ (เลิกใช้รหัสอัตโนมัติ FK-0001 ตั้งแต่ 27 ก.ค. 2569) · กติกาเต็มที่ [SN-RULES.md](SN-RULES.md) · ข้อยกเว้น: SN ซ้ำจากผู้ผลิต → `SN#1`/`SN#2` · รถสั่งผลิตยังไม่มี SN → `<PI>#<ลำดับ>`
- **รูปตรวจรถ** — **ผู้รับรถ**: บังคับ 6 ช่อง (name plate, เอกสาร PI, รถ 4 มุม) เก็บใน `inspections.image_slots` (jsonb) · **ผู้ส่งมอบรถ**: รูปอิสระ (ไม่จำกัดมุม) อย่างน้อย 1 ไม่เกิน 12 รูป + กรอก `delivery_company` (บังคับ) และ `location_link` (ไม่บังคับ) — migration `supabase-migration-2026-07-14.sql` · ทั้งคู่รวมรูปไว้ที่ `images` เพื่อ backward compat · หน้าเซลล์โชว์ป้ายกำกับช่อง (เฉพาะรูปผู้รับ)
- **รหัสรถโชว์ทุกคัน** — การ์ด/แถวรถโชว์ `#{forklift.id}` (= SN) · ป้ายสีเหลือง = รถสั่งผลิตที่ยังไม่มี SN
- **ผู้ขนส่งจำโปรไฟล์** — หน้าผู้ขนส่งเก็บ `localStorage.transporter_profile` (ชื่อ+เบอร์) ข้ามการล็อกเอาต์ → หน้า login เติมให้อัตโนมัติ + ปุ่ม "เข้าใช้งานต่อ" แตะเดียว (session อยู่ที่ `transporter_name`/`transporter_phone` ถูกลบตอนออกจากระบบ แต่ profile ไม่ถูกลบ)
- **ระบบสิทธิ์ผู้ใช้ (UI-level)** — ผู้ใช้ใหม่ = "รออนุมัติ" เข้าไม่ได้จนแอดมินอนุมัติที่ `/admin/users` · role ต้องตรงหน้า (sales เข้าหน้า stock ไม่ได้) · แอดมินกำหนดใน `adminEmails` (ค่าเริ่มต้น goodrichforklift@gmail.com) · ⚠️ ยังไม่ใช่ security จริงจนกว่าจะทำ RLS (DEV-PLAN เฟส 1)

### State — ศูนย์กลางที่ `lib/AppContext.tsx`
- **แหล่งความจริงเดียว** ของ forklifts / sales / inspections / fieldConfig — ทุกหน้าดึงผ่าน `useApp()`
- **Optimistic update:** แก้ state ในเครื่องก่อน แล้วยิง API แบบ fire-and-forget (`.catch(console.warn)`)
- **Realtime:** subscribe `postgres_changes` → debounce 300ms → `bootstrap()` ใหม่ + poll สำรอง 60s ตอนแท็บ active
- **Fallback ladder:** Supabase → localStorage (`salesos_*_v2`) → mockData — แอปต้องไม่พังเมื่อไม่มี env
- แก้ CRUD ที่นี่ที่เดียว หน้าอื่นไม่ต้องแตะ · logic คู่ forklift.status ↔ sale.sale_status อยู่ใน `addSale`/`deleteSale`

### Data flow
`bootstrap()` โหลดครั้งเดียว (forklifts/sales/inspections/app_config) → ตาราง Supabase: `forklifts`, `sales`, `inspections` (soft delete = `deleted_at`), `app_config` (id=1 เก็บ fieldConfig ทั้งก้อน) · รูป inspection = base64 → อัปโหลดผ่าน `NEXT_PUBLIC_GAS_URL` แล้วเก็บ URL

---

## ENV (`.env.local` — ไม่ commit)
| ตัวแปร | ใช้ |
|--------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | เชื่อม Supabase (ว่าง = fallback local) |
| `NEXT_PUBLIC_GAS_URL` | อัปโหลดรูป inspection → Drive |
| `NEXT_PUBLIC_BASE_PATH` | เว้นว่างตอน dev · prod = `/sales-os-app.github.io` |

Prod ตั้งค่าที่ repo → Settings ▸ Secrets and variables ▸ Actions ▸ **Variables**

---

## คำสั่ง
```bash
npm run dev      # dev (hostname 0.0.0.0)
npm run build    # build static → out/
npm run lint     # eslint
```

---

## Convention
- ค่าโดเมนเป็น **ภาษาไทย** (status "พร้อมขาย"/"จอง"/"รอผ่านไฟแนนซ์"/"ปิดการขายแล้ว", บทบาท ฯลฯ) — ใช้ให้ตรง `types.ts` เป๊ะ
- dropdown ทุกตัว **user-configurable** ผ่าน `fieldConfig` (+ custom fields) — อย่า hardcode ตัวเลือกในหน้า
- คอมเมนต์สั้น กระชับ ภาษาไทย ตามสไตล์ไฟล์เดิม
- Tailwind utility-first · ไอคอนจาก `lucide-react`
- เช็ค `api.apiEnabled` / `supabase !== null` ก่อนเรียก API เสมอ

## จุดที่ยังเป็นโครง (scaffold)
- **`components/AiAssistant.tsx` "พี่เก่ง"** — UI ครบ แต่ยังไม่มีสมอง · เติมจริงแค่แก้ฟังก์ชัน `getAssistantReply()` (ต่อ LLM/GAS) ไม่ต้องแตะ UI

## แผนพัฒนา / ช่องโหว่ที่รอแก้
- **[ROADMAP.md](ROADMAP.md)** ⭐ — ลำดับงานหลักทั้งหมด (เฟส A-G) เริ่มอ่านที่นี่ก่อน
- **[DEV-PLAN.md](DEV-PLAN.md)** — ผลตรวจช่องโหว่ + โค้ดซ้ำ (13 ก.ค. 2026) แผนแก้ 4 เฟส
- ✅ **RLS เปิดใช้งานแล้ว (ยืนยัน 31 ก.ค. 2026):** forklifts/sales/inspections/app_config select ต้อง `is_approved()` · write แยกตาม role (`user_role()` = stock/sales/transporter, `is_admin()`) · **public (anon) ดึงข้อมูลไม่ได้ = 0 rows** · ผู้ขนส่ง (anon) อ่านผ่าน RPC `transporter_stock`/`transporter_inspections` (ตัดราคาทุน/ลูกค้า) · audit_log: insert เปิด, select=approved · **ที่เหลือ (optional):** column-level — ซ่อน cost_price จาก sales, ซ่อนข้อมูลลูกค้าจาก stock (staff-vs-staff เท่านั้น ไม่ใช่ public)
- **[QUOTE-IMPORT-RULES.md](QUOTE-IMPORT-RULES.md)** — กติกาอ่าน/นำเข้ารถจากใบ PI (1 รุ่น = 1 บล็อก · ต้องเทียบจำนวนกับเอกสารก่อนบันทึกเสมอ)
- **[DATA-SYNC-PLAN.md](DATA-SYNC-PLAN.md)** — ซิงก์ DB กับ Excel สต็อกจริง (gitignored — มีข้อมูลลูกค้า)
- ก่อนเพิ่มฟีเจอร์ใหม่ให้เช็คว่างานนั้นชนกับแผนหรือไม่ และอัปเดตสถานะ ☐→☑ เมื่อทำเสร็จ

## ⚠️ SN ไม่ใช่ `unit_no` (ตัดสินใจ 27 ก.ค. 2569)
- คอลัมน์จริงใน DB คือ **`forklifts."SN"`** — โค้ดต้องใช้ชื่อ `SN` ให้ตรง (เดิมใช้ `unit_no` ทำให้เขียนไม่ลง DB)
- **แต่มี `unit_no` อีก 2 ที่ที่ชื่อถูกอยู่แล้ว ห้ามแตะ:** `sales.forklift_unit_no` และ `inspections.unit_no`
- ห้าม find-replace ทั้งโปรเจกต์ — ดูรายละเอียดที่ [ROADMAP.md](ROADMAP.md) เฟส A

## 📌 แอปเป็นระบบหลัก (ตัดสินใจ 27 ก.ค. 2569)
ทีมกรอกข้อมูลในแอปอย่างเดียว — **เลิกใช้ Excel เป็นที่บันทึกงาน** (ถ้าต้องการไฟล์ให้ export ออกจากระบบ)
เดิมมี 2 แหล่งที่ไม่ตรงกันจนข้อมูลเพี้ยน · ตรวจสุขภาพข้อมูลเป็นระยะด้วย `node scripts/health-check.mjs`

## ⚠️ repo นี้เป็น public
ห้าม commit ไฟล์ที่มีชื่อลูกค้า/ราคาทุน — `.gitignore` กันไว้แล้ว: `*.xlsx`, `local-data/`, `DATA-SYNC-PLAN.md`, `sync-rules.md`

## ก่อนแก้ต้องรู้
1. state ต้องผ่าน `AppContext` — อย่าตั้ง state ซ้ำในหน้า
2. อย่าเผลอเพิ่มโค้ดฝั่ง server (จะ build ไม่ผ่านเพราะ static export)
3. เปลี่ยน type ใน `types.ts` → เช็คทั้ง `api.ts`, `AppContext.tsx`, หน้าที่ใช้
4. เพิ่ม field ใหม่ → เพิ่มใน `FieldConfig` + `DEFAULT_FIELD_CFG` ด้วย
