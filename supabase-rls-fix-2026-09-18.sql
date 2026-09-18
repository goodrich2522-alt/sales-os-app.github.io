-- ============================================================
-- แก้เตือนความปลอดภัย Supabase: rls_disabled_in_public (18 ก.ย. 2569)
-- อาการ: "ตารางนี้สามารถเข้าถึงได้โดยสาธารณะ — ใครก็ตามที่มี URL ของโปรเจกต์
--        สามารถอ่าน แก้ไข และลบข้อมูลทั้งหมดในตารางนี้ได้"
--
-- ตรวจแล้ว (18 ก.ย. 2569) 6 ตารางที่แอปใช้ **ปลอดภัยดีอยู่แล้ว**:
--   forklifts · sales · inspections · app_config · customers · audit_log
--   (ยิง REST ด้วย anon key แบบไม่ล็อกอิน → คืน 0 แถวทุกตาราง)
-- → ตารางที่ถูกเตือนเป็นตารางที่ "สร้างตรงใน Supabase" ไม่ได้อยู่ในโค้ดแอป
--   สคริปต์นี้จึงหาเองจากฐานข้อมูล ไม่ต้องรู้ชื่อล่วงหน้า
--
-- วิธีใช้: Supabase Dashboard → SQL Editor → รันทีละขั้น (ขั้น 1 อ่านอย่างเดียว)
-- ============================================================


-- ── ขั้นที่ 1 — ตรวจก่อน (อ่านอย่างเดียว ไม่แก้อะไร) ─────────────────────────
-- ดูว่าตารางไหนยังไม่เปิด RLS และ anon (คนทั่วไปที่ไม่ล็อกอิน) ทำอะไรได้บ้าง
-- ⚠️ ถ้าแถวไหน "เปิด RLS แล้ว" = false และ "anon อ่านได้" = true → ข้อมูลเปิดโล่งอยู่จริง

select
  c.relname                                             as "ตาราง",
  c.relrowsecurity                                      as "เปิด RLS แล้ว",
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = c.relname)   as "จำนวน policy",
  (select n_live_tup from pg_stat_user_tables s
    where s.schemaname = 'public' and s.relname = c.relname)     as "จำนวนแถว (ประมาณ)",
  has_table_privilege('anon', c.oid, 'SELECT')          as "anon อ่านได้",
  has_table_privilege('anon', c.oid, 'INSERT')
    or has_table_privilege('anon', c.oid, 'UPDATE')
    or has_table_privilege('anon', c.oid, 'DELETE')     as "anon เขียน/ลบได้"
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'          -- r = ตารางจริง
order by c.relrowsecurity, c.relname;


-- ── ขั้นที่ 2 — เปิด RLS ให้ทุกตารางที่ยังไม่เปิด ───────────────────────────
-- เปิด RLS โดยไม่ใส่ policy = **ปฏิเสธทุกคำขอ** จาก anon/ผู้ใช้ที่ล็อกอิน
-- (service_role และเจ้าของตารางยังเข้าได้ → Dashboard ยังดูข้อมูลได้ปกติ)
--
-- ⚠️ ปลอดภัยกับแอปนี้ เพราะแอปใช้แค่ 6 ตารางที่เปิด RLS + มี policy ครบแล้ว
--    ตารางอื่นแอปไม่ได้เรียกเลย ปิดไปไม่กระทบการใช้งาน
--    แต่ถ้าขั้นที่ 1 แสดงตารางที่ไม่คุ้นชื่อและอาจมีคนอื่นใช้อยู่ → หยุดถามก่อน

do $$
declare t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  loop
    execute format('alter table public.%I enable row level security', t.relname);
    raise notice 'เปิด RLS แล้ว: %', t.relname;
  end loop;
end $$;


-- ── ขั้นที่ 3 — ตรวจซ้ำว่าไม่เหลือตารางที่เปิดโล่ง ──────────────────────────
-- ควรได้ 0 แถว

select c.relname as "ยังไม่เปิด RLS"
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;


-- ============================================================
-- ส่วนเสริม — ใช้เมื่อจำเป็นเท่านั้น
-- ============================================================

-- (ก) ตารางนั้นเป็นของเก่า/ไม่ได้ใช้แล้ว → ตัดสิทธิ์ anon ออกให้ขาด
--     (เปิด RLS อย่างเดียวก็กันได้แล้ว อันนี้กันอีกชั้น)
-- revoke all on public.<ชื่อตาราง> from anon, authenticated;

-- (ข) ตารางนั้นแอปต้องใช้จริง → ใส่ policy ตามโมเดลสิทธิ์เดิมของโปรเจกต์
--     (ฟังก์ชัน is_approved() / is_admin() / user_role() มีอยู่แล้วจาก
--      supabase-phase1-rls-2026-07-13.sql)
--
-- create policy "<ชื่อตาราง>_select" on public.<ชื่อตาราง>
--   for select to authenticated using (public.is_approved());
--
-- create policy "<ชื่อตาราง>_write" on public.<ชื่อตาราง>
--   for all to authenticated
--   using (public.is_admin()) with check (public.is_admin());

-- (ค) ตารางนั้นเป็นข้อมูลชั่วคราวที่ไม่ต้องเก็บแล้ว → ลบทิ้งไปเลย
--     ⚠️ ลบแล้วกู้ไม่ได้ ดู "จำนวนแถว" จากขั้นที่ 1 ก่อนเสมอ
-- drop table public.<ชื่อตาราง>;
