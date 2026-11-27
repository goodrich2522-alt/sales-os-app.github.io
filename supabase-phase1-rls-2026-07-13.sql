-- ============================================================
-- DEV-PLAN เฟส 1 — RLS + Auth · 13 ก.ค. 2026
-- ส่วน A: ฟังก์ชัน + policy + seed (รันได้ปลอดภัย — ยังไม่บังคับใช้จนกว่าจะเปิด RLS)
-- ส่วน B: เปิด RLS (รันหลัง deploy โค้ดใหม่เท่านั้น — ไม่งั้นแอปเวอร์ชันเก่าอ่านข้อมูลไม่ได้)
--
-- โมเดลสิทธิ์: อิง knownUsers/adminEmails ใน app_config (id=1)
--   - ยังไม่อนุมัติ/ไม่ล็อกอิน = อ่าน-เขียนอะไรไม่ได้เลย
--   - admin = ทำได้ทุกอย่าง · stock = จัดการ forklifts · sales = จัดการ sales +
--     อัปเดตสถานะรถ · transporter = บันทึกตรวจรถ + อัปเดตสถานะรถ
--   - app_config เขียนผ่าน RPC เท่านั้น (merge ทีละส่วน กัน config ทับกัน)
-- ============================================================

-- ── A1. ฟังก์ชันช่วย (SECURITY DEFINER = อ่าน app_config ได้แม้ RLS เปิด) ──
create or replace function public.jwt_email() returns text
language sql stable as $$
  select lower(coalesce(auth.jwt()->>'email', ''))
$$;

create or replace function public.access_user() returns jsonb
language sql stable security definer set search_path = public as $$
  select data->'knownUsers'->public.jwt_email() from public.app_config where id = 1
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select data->'adminEmails' @> to_jsonb(public.jwt_email()) from public.app_config where id = 1),
    false)
$$;

create or replace function public.is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or (public.access_user() is not null
          and coalesce(public.access_user()->>'status', 'approved') = 'approved')
$$;

create or replace function public.user_role() returns text
language sql stable security definer set search_path = public as $$
  select public.access_user()->>'role'
$$;

-- ── A2. RPC สำหรับแอป ──
-- เช็คสิทธิ์ตัวเอง (ใช้ได้แม้ยังไม่อนุมัติ — เห็นเฉพาะข้อมูลตัวเอง ไม่เห็นรายชื่อคนอื่น)
create or replace function public.my_access() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('user', public.access_user(), 'is_admin', public.is_admin())
$$;

-- ลงทะเบียนตัวเอง (ผู้ใช้ใหม่ = pending เสมอ · ห้ามแก้ role/status ตัวเอง)
create or replace function public.register_me(p_name text, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare em text := public.jwt_email();
begin
  if em = '' then raise exception 'ต้องล็อกอินก่อน'; end if;
  if p_role not in ('sales', 'stock', 'transporter') then raise exception 'บทบาทไม่ถูกต้อง'; end if;
  update public.app_config set data = jsonb_set(
    data, array['knownUsers', em],
    case
      when data->'knownUsers'->em is null
        then jsonb_build_object('name', p_name, 'role', p_role, 'status', 'pending')
      when coalesce(data->'knownUsers'->em->>'status', 'approved') = 'pending'
        then (data->'knownUsers'->em) || jsonb_build_object('name', p_name) -- แก้ได้แค่ชื่อระหว่างรอ
      else data->'knownUsers'->em -- อนุมัติ/ระงับแล้ว = ห้ามแตะ
    end)
  where id = 1;
end $$;

-- เซฟ fieldConfig แบบ merge เฉพาะ key ที่ส่งมา (ตัด knownUsers/adminEmails ทิ้งเสมอ — จัดการผ่าน admin เท่านั้น)
create or replace function public.merge_field_config(cfg jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_approved() then raise exception 'ยังไม่ได้รับอนุมัติ'; end if;
  update public.app_config
     set data = data || (cfg - 'knownUsers' - 'adminEmails')
   where id = 1;
end $$;

-- แอดมิน: เขียน knownUsers + adminEmails ทั้งก้อน
create or replace function public.admin_update_access(p_known_users jsonb, p_admin_emails jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'เฉพาะแอดมิน'; end if;
  if jsonb_typeof(p_admin_emails) <> 'array' or jsonb_array_length(p_admin_emails) < 1 then
    raise exception 'ต้องมีแอดมินอย่างน้อย 1 คน';
  end if;
  update public.app_config
     set data = data || jsonb_build_object('knownUsers', p_known_users, 'adminEmails', p_admin_emails)
   where id = 1;
end $$;

-- ── A3. สิทธิ์เรียกฟังก์ชัน ──
revoke execute on function public.register_me(text, text),
  public.merge_field_config(jsonb), public.admin_update_access(jsonb, jsonb)
  from public, anon;
grant execute on function public.my_access(), public.register_me(text, text),
  public.merge_field_config(jsonb), public.admin_update_access(jsonb, jsonb)
  to authenticated;
grant execute on function public.jwt_email(), public.access_user(), public.is_admin(),
  public.is_approved(), public.user_role(), public.my_access()
  to anon, authenticated;

-- ── A4. seed adminEmails ลง app_config (ถ้ายังไม่มี) ──
-- ⚠️ repo นี้เป็น public — ใส่อีเมลจริงลงไปไม่ได้ (บอกใบ้ว่าต้องไปเจาะบัญชีไหน)
--    แทนที่ <อีเมลแอดมิน> ด้วยอีเมลจริงตอนวางใน Supabase SQL Editor เท่านั้น
update public.app_config
   set data = data || '{"adminEmails": ["<อีเมลแอดมิน>"]}'::jsonb
 where id = 1 and not (data ? 'adminEmails');

-- ── A5. Policies (มีผลเมื่อเปิด RLS ในส่วน B) ──
-- forklifts: อ่าน=อนุมัติแล้ว · เพิ่ม/ลบ=สต็อก · แก้=สต็อก/เซลล์(ปิดดีล)/ผู้ขนส่ง(รับรถ)
drop policy if exists forklifts_select on public.forklifts;
drop policy if exists forklifts_insert on public.forklifts;
drop policy if exists forklifts_update on public.forklifts;
drop policy if exists forklifts_delete on public.forklifts;
create policy forklifts_select on public.forklifts for select
  using (public.is_approved());
create policy forklifts_insert on public.forklifts for insert
  with check (public.is_admin() or (public.is_approved() and public.user_role() = 'stock'));
create policy forklifts_update on public.forklifts for update
  using (public.is_admin() or (public.is_approved() and public.user_role() in ('stock', 'sales', 'transporter')))
  with check (public.is_admin() or (public.is_approved() and public.user_role() in ('stock', 'sales', 'transporter')));
create policy forklifts_delete on public.forklifts for delete
  using (public.is_admin() or (public.is_approved() and public.user_role() = 'stock'));

-- sales: อ่าน=อนุมัติแล้ว · เขียน/ลบ=เซลล์
drop policy if exists sales_select on public.sales;
drop policy if exists sales_write on public.sales;
drop policy if exists sales_update on public.sales;
drop policy if exists sales_delete on public.sales;
create policy sales_select on public.sales for select
  using (public.is_approved());
create policy sales_write on public.sales for insert
  with check (public.is_admin() or (public.is_approved() and public.user_role() = 'sales'));
create policy sales_update on public.sales for update
  using (public.is_admin() or (public.is_approved() and public.user_role() = 'sales'))
  with check (public.is_admin() or (public.is_approved() and public.user_role() = 'sales'));
create policy sales_delete on public.sales for delete
  using (public.is_admin() or (public.is_approved() and public.user_role() = 'sales'));

-- inspections: ทุกคนที่อนุมัติแล้วใช้ได้ (งานปฏิบัติการ ไม่ใช่ข้อมูลเงิน)
drop policy if exists inspections_select on public.inspections;
drop policy if exists inspections_insert on public.inspections;
drop policy if exists inspections_update on public.inspections;
drop policy if exists inspections_delete on public.inspections;
create policy inspections_select on public.inspections for select using (public.is_approved());
create policy inspections_insert on public.inspections for insert with check (public.is_approved());
create policy inspections_update on public.inspections for update
  using (public.is_approved()) with check (public.is_approved());
create policy inspections_delete on public.inspections for delete using (public.is_approved());

-- app_config: อ่าน=อนุมัติแล้ว · เขียนตรงไม่ได้เลย (บังคับผ่าน RPC ด้านบน)
drop policy if exists app_config_select on public.app_config;
create policy app_config_select on public.app_config for select using (public.is_approved());

-- ============================================================
-- ส่วน B: สวิตช์บังคับใช้ — ⚠️ รันหลัง deploy โค้ดใหม่แล้วเท่านั้น
--
-- ข้อค้นพบ 13 ก.ค. 2026: RLS "เปิดอยู่แล้ว" ทุกตาราง แต่มี policy `open_all`
-- (using true / with check true ให้ anon+authenticated) เปิดประตูโล่งไว้
-- → สวิตช์จริงคือ "ลบ open_all" · rollback คือ "สร้าง open_all กลับ"
--
-- ✅ ส่วน A รันแล้ว + ทดสอบบังคับใช้จริงผ่านครบ 20/20 เคส (13 ก.ค. 2026)
--    ตอนนี้คืน open_all ไว้ก่อน รอ deploy โค้ดใหม่ → ค่อยรันส่วน B ถาวร
-- ============================================================

-- B1) บังคับใช้จริง (ลบประตูโล่ง):
-- drop policy if exists open_all on public.forklifts;
-- drop policy if exists open_all on public.sales;
-- drop policy if
