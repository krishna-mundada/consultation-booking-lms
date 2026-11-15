-- The state of a consultation, worked out once in the database so a list can sort and filter by exactly what
-- its badge says (ADR 0007, A29). Before this the Status column sorted the raw `status` (scheduled or
-- cancelled), so a completed consultation sat among the scheduled ones.
--
--   cancelled  it will not happen
--   complete   it happened and was marked complete
--   awaiting   its time has come but it is not marked complete ("Not marked complete")
--   scheduled  still to come
--
-- Added at the end of the view: CREATE OR REPLACE VIEW can add columns only after the existing ones.
create or replace view public.consultation_details
with (security_invoker = true) as
  select
    c.id, c.student_id, c.tutor_id, c.reason, c.scheduled_at, c.status, c.completed,
    c.created_at, c.updated_at,
    t.display_name as tutor_name,
    s.display_name as student_name,
    case
      when c.status = 'cancelled' then 'cancelled'
      when c.completed then 'complete'
      when c.scheduled_at <= now() then 'awaiting'
      else 'scheduled'
    end as state
  from public.consultations c
  left join public.profiles t on t.id = c.tutor_id
  left join public.profiles s on s.id = c.student_id;
