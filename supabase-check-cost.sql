-- เช็คว่าราคาทุนแฮนด์ลิฟท์เข้าไปแล้วหรือยัง — อ่านอย่างเดียว ตอบแถวเดียว
select
  count(*) filter (where coalesce(cost_price, 0) = 0) as ยังไม่มีทุน,
  count(*) filter (where coalesce(cost_price, 0) > 0) as มีทุนแล้ว,
  count(*)                                            as รวม_staxx
from public.forklifts
where upper(btrim(brand)) = 'STAXX';
