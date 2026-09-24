-- ============================================================
-- เพิ่มแอดมินเต็มสิทธิ์: woralakpor789@gmail.com  (24 ก.ย. 2569)
--
-- ทำไมต้องรันอันนี้ด้วย: สิทธิ์แอดมินมี 2 ชั้น
--   ชั้นที่ 1 (ฝั่งแอป)      — แก้ในโค้ดแล้ว (OWNER_EMAILS ใน lib/auth.ts) → เห็นเมนู/ปุ่มของแอดมิน
--   ชั้นที่ 2 (ฐานข้อมูล)    — RLS ใน Supabase ใช้ฟังก์ชัน is_admin() ซึ่งอ่านรายชื่อจาก
--                              app_config.data->'adminEmails' เท่านั้น ไม่รู้จักค่าที่ฮาร์ดโค้ดในแอป
--   → ถ้าไม่รันอันนี้ จะเห็นปุ่มแอดมิน แต่บางอย่างที่ต้องใช้สิทธิ์เขียนระดับแอดมินจะยังทำไม่ได้
--
-- วิธีใช้: Supabase Dashboard → SQL Editor → รันทีละขั้น (ขั้น 1 อ่านอย่างเดียว)
-- ============================================================


-- ── ขั้นที่ 1 — ดูรายชื่อแอดมินปัจจุบัน (อ่านอย่างเดียว) ─────────────────────
select data->'adminEmails' as "แอดมินตอนนี้"
from public.app_config
where id = 1;


-- ── ขั้นที่ 2 — เพิ่มอีเมลเข้าไป (ถ้ายังไม่มี) ───────────────────────────────
-- เขียนแบบ "มีอยู่แล้วไม่ทำอะไร" รันซ้ำกี่ครั้งก็ปลอดภัย ไม่ทำให้ชื่อซ้ำ
update public.app_config
set data = jsonb_set(
      data,
      '{adminEmails}',
      coalesce(data->'adminEmails', '[]'::jsonb) || to_jsonb('woralakpor789@gmail.com'::text),
      true
    )
where id = 1
  and not coalesce(data->'adminEmails' @> to_jsonb('woralakpor789@gmail.com'::text), false);


-- ── ขั้นที่ 3 — ตรวจซ้ำว่าเพิ่มเข้าไปแล้ว ──────────────────────────────────
-- ต้องเห็น woralakpor789@gmail.com อยู่ในรายการ และคอลัมน์ "เป็นแอดมินแล้ว" = true
select
  data->'adminEmails'                                                   as "แอดมินหลังแก้",
  coalesce(data->'adminEmails' @> to_jsonb('woralakpor789@gmail.com'::text), false)
                                                                        as "เป็นแอดมินแล้ว"
from public.app_config
where id = 1;


-- ============================================================
-- ถอนออกภายหลัง (ถ้าต้องการ)
-- ============================================================
-- update public.app_config
-- set data = jsonb_set(data, '{adminEmails}',
--       (select coalesce(jsonb_agg(e), '[]'::jsonb)
--        from jsonb_array_elements(data->'adminEmails') e
--        where e <> to_jsonb('woralakpor789@gmail.com'::text)), true)
-- where id = 1;
