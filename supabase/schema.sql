


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "private"."can_write"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid()) and role = 'student'
  );
$$;


ALTER FUNCTION "private"."can_write"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."enforce_consultation_rules"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  business_zone constant text := 'Australia/Melbourne';
  v_local timestamp;
begin
  -- A time that is being set (a new booking, or a reschedule) has to be one that can be booked:
  -- at least an hour away, at most eight weeks ahead, in business hours (weekdays 9:00 to 16:30
  -- slot starts, Melbourne time). The half-hour grid itself is a CHECK on the column.
  if tg_op = 'INSERT' or new.scheduled_at is distinct from old.scheduled_at then
    if new.scheduled_at < now() + interval '1 hour' then
      raise exception 'a consultation must be at least an hour from now' using errcode = '23514';
    end if;
    if new.scheduled_at > now() + interval '56 days' then
      raise exception 'a consultation cannot be more than eight weeks ahead' using errcode = '23514';
    end if;
    v_local := new.scheduled_at at time zone business_zone;
    if extract(isodow from v_local) > 5 or v_local::time < time '09:00' or v_local::time > time '16:30' then
      raise exception 'a consultation must be on a weekday between 9:00 and 17:00 (Melbourne time)'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'INSERT' then
    -- A consultation is with a tutor.
    if not exists (select 1 from public.profiles p where p.id = new.tutor_id and p.role = 'tutor') then
      raise exception 'tutor_id must be a tutor' using errcode = '23514';
    end if;
  else
    -- Cancelled is terminal: nothing about a cancelled consultation may change.
    if old.status = 'cancelled' then
      raise exception 'a cancelled consultation cannot be changed' using errcode = '23514';
    end if;
    -- Once it has started a consultation is history: it can no longer be moved or cancelled. Only
    -- the completed tick can still be changed.
    if old.scheduled_at <= now()
       and (new.status is distinct from old.status or new.scheduled_at is distinct from old.scheduled_at) then
      raise exception 'a consultation that has started can no longer be moved or cancelled'
        using errcode = '23514';
    end if;
    -- Completed means it happened: it can be ticked only once the consultation has started. (Leaving it
    -- unticked, or unticking one that was ticked, is always fine.)
    if new.completed and not old.completed and new.scheduled_at > now() then
      raise exception 'a consultation can only be marked complete once it has started' using errcode = '23514';
    end if;
    -- Cancelling changes the status and nothing else.
    if new.status = 'cancelled'
       and (new.completed is distinct from old.completed or new.scheduled_at is distinct from old.scheduled_at) then
      raise exception 'cancelling a consultation cannot change anything else' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "private"."enforce_consultation_rules"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_first text := left(btrim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), 100);
  v_last text := left(btrim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), 100);
begin
  if v_first = '' then
    v_first := left(coalesce(nullif(btrim(split_part(new.email, '@', 1)), ''), 'User'), 100);
  end if;
  insert into public.profiles (id, first_name, last_name) values (new.id, v_first, v_last);
  return new;
end;
$$;


ALTER FUNCTION "private"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;


ALTER FUNCTION "private"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "private"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_people"("p_q" "text" DEFAULT NULL::"text", "p_roles" "text"[] DEFAULT NULL::"text"[], "p_sort" "text" DEFAULT 'name'::"text", "p_desc" boolean DEFAULT false, "p_limit" integer DEFAULT 25, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "first_name" "text", "last_name" "text", "display_name" "text", "email" "text", "role" "text", "upcoming" bigint, "total" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_pattern text;
begin
  if not (select private.is_admin()) then
    raise exception 'only an admin can list people' using errcode = '42501';
  end if;

  p_limit := least(greatest(coalesce(p_limit, 25), 1), 100);
  p_offset := greatest(coalesce(p_offset, 0), 0);
  -- The search text is data, never a pattern: escape LIKE's wildcards.
  v_pattern := case
    when nullif(btrim(p_q), '') is null then null
    else '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  end;

  return query
  select p.id, p.first_name, p.last_name, p.display_name, u.email::text, p.role,
         coalesce(t.n, 0)::bigint, count(*) over ()
  from public.profiles p
  join auth.users u on u.id = p.id
  left join lateral (
    select count(*) as n
    from public.consultations c
    where c.tutor_id = p.id and c.status = 'scheduled' and c.scheduled_at > now()
  ) t on p.role = 'tutor'
  where (p_roles is null or p.role = any (p_roles))
    and (v_pattern is null or p.display_name ilike v_pattern escape '\' or u.email ilike v_pattern escape '\')
  order by
    case when p_sort = 'name' and not p_desc then p.display_name end asc,
    case when p_sort = 'name' and p_desc then p.display_name end desc,
    case when p_sort = 'email' and not p_desc then u.email end asc,
    case when p_sort = 'email' and p_desc then u.email end desc,
    case when p_sort = 'role' and not p_desc then p.role end asc,
    case when p_sort = 'role' and p_desc then p.role end desc,
    case when p_sort = 'upcoming' and not p_desc then coalesce(t.n, 0) end asc,
    case when p_sort = 'upcoming' and p_desc then coalesce(t.n, 0) end desc,
    p.id
  limit p_limit offset p_offset;
end;
$$;


ALTER FUNCTION "public"."admin_list_people"("p_q" "text", "p_roles" "text"[], "p_sort" "text", "p_desc" boolean, "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_set_tutor"("p_user" "uuid", "p_make_tutor" boolean, "p_cancel_upcoming" boolean DEFAULT NULL::boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_role text;
  v_name text;
  v_upcoming integer;
  v_cancelled integer := 0;
begin
  if not (select private.is_admin()) then
    raise exception 'only an admin can change a tutor' using errcode = '42501';
  end if;

  -- Lock the row so two admins acting together cannot interleave.
  select p.role, p.display_name into v_role, v_name from public.profiles p where p.id = p_user for update;
  if not found then
    raise exception 'no such user' using errcode = 'P0002';
  end if;
  if v_role = 'admin' then
    raise exception 'an admin cannot be changed' using errcode = '42501';
  end if;

  if p_make_tutor then
    update public.profiles set role = 'tutor' where id = p_user and role = 'student';
    return jsonb_build_object('role', 'tutor', 'upcoming', 0, 'cancelled', 0);
  end if;

  if v_role = 'student' then
    return jsonb_build_object('role', 'student', 'upcoming', 0, 'cancelled', 0);
  end if;

  select count(*) into v_upcoming
  from public.consultations c
  where c.tutor_id = p_user and c.status = 'scheduled' and c.scheduled_at > now();

  if v_upcoming > 0 and p_cancel_upcoming is null then
    raise exception 'this tutor has % upcoming consultations: choose to cancel them or keep them', v_upcoming
      using errcode = '23514', hint = 'choose_cancel_or_keep';
  end if;

  if p_cancel_upcoming then
    with cancelled as (
      update public.consultations c
      set status = 'cancelled'
      where c.tutor_id = p_user and c.status = 'scheduled' and c.scheduled_at > now()
      returning c.student_id, c.scheduled_at
    )
    insert into public.notifications (user_id, kind, tutor_name, consultation_at)
    select student_id, 'consultation_cancelled', v_name, scheduled_at from cancelled;
    get diagnostics v_cancelled = row_count;
  end if;

  update public.profiles set role = 'student' where id = p_user;
  return jsonb_build_object('role', 'student', 'upcoming', v_upcoming, 'cancelled', v_cancelled);
end;
$$;


ALTER FUNCTION "public"."admin_set_tutor"("p_user" "uuid", "p_make_tutor" boolean, "p_cancel_upcoming" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tutor_busy_times"("p_tutor" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) RETURNS SETOF timestamp with time zone
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select c.scheduled_at
  from public.consultations c
  where c.tutor_id = p_tutor
    and c.status = 'scheduled'
    and c.scheduled_at >= p_from
    and c.scheduled_at < least(p_to, p_from + interval '35 days')
  order by c.scheduled_at;
$$;


ALTER FUNCTION "public"."tutor_busy_times"("p_tutor" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."consultations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "tutor_id" "uuid" NOT NULL,
    "reason" "text",
    "scheduled_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "completed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "consultations_reason_check" CHECK ((("reason" IS NULL) OR (("char_length"("reason") >= 1) AND ("char_length"("reason") <= 1000)))),
    CONSTRAINT "consultations_reason_not_blank" CHECK ((("reason" IS NULL) OR ("reason" ~ '\S'::"text"))),
    CONSTRAINT "consultations_scheduled_at_check" CHECK (((EXTRACT("minute" FROM ("scheduled_at" AT TIME ZONE 'UTC'::"text")) = ANY (ARRAY[(0)::numeric, (30)::numeric])) AND (EXTRACT("second" FROM ("scheduled_at" AT TIME ZONE 'UTC'::"text")) = (0)::numeric))),
    CONSTRAINT "consultations_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."consultations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'student'::"text" NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" DEFAULT ''::"text" NOT NULL,
    "display_name" "text" GENERATED ALWAYS AS ("btrim"((("first_name" || ' '::"text") || "last_name"))) STORED,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profiles_first_name_check" CHECK ((("char_length"("btrim"("first_name")) >= 1) AND ("char_length"("btrim"("first_name")) <= 100))),
    CONSTRAINT "profiles_last_name_check" CHECK (("char_length"("last_name") <= 100)),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['student'::"text", 'tutor'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."profiles" IS 'One row per auth user. role is never taken from client input.';



COMMENT ON COLUMN "public"."profiles"."display_name" IS 'Shown to other users; never the email.';



CREATE OR REPLACE VIEW "public"."consultation_details" WITH ("security_invoker"='true') AS
 SELECT "c"."id",
    "c"."student_id",
    "c"."tutor_id",
    "c"."reason",
    "c"."scheduled_at",
    "c"."status",
    "c"."completed",
    "c"."created_at",
    "c"."updated_at",
    "t"."display_name" AS "tutor_name",
    "s"."display_name" AS "student_name",
        CASE
            WHEN ("c"."status" = 'cancelled'::"text") THEN 'cancelled'::"text"
            WHEN "c"."completed" THEN 'complete'::"text"
            WHEN ("c"."scheduled_at" <= "now"()) THEN 'awaiting'::"text"
            ELSE 'scheduled'::"text"
        END AS "state"
   FROM (("public"."consultations" "c"
     LEFT JOIN "public"."profiles" "t" ON (("t"."id" = "c"."tutor_id")))
     LEFT JOIN "public"."profiles" "s" ON (("s"."id" = "c"."student_id")));


ALTER VIEW "public"."consultation_details" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "tutor_name" "text" NOT NULL,
    "consultation_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "read_at" timestamp with time zone,
    CONSTRAINT "notifications_kind_check" CHECK (("kind" = 'consultation_cancelled'::"text"))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


ALTER TABLE ONLY "public"."consultations"
    ADD CONSTRAINT "consultations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



CREATE INDEX "consultations_scheduled_idx" ON "public"."consultations" USING "btree" ("scheduled_at", "id");



CREATE INDEX "consultations_student_scheduled_idx" ON "public"."consultations" USING "btree" ("student_id", "scheduled_at", "id");



CREATE UNIQUE INDEX "consultations_student_slot_key" ON "public"."consultations" USING "btree" ("student_id", "scheduled_at") WHERE ("status" = 'scheduled'::"text");



CREATE INDEX "consultations_tutor_scheduled_idx" ON "public"."consultations" USING "btree" ("tutor_id", "scheduled_at", "id");



CREATE UNIQUE INDEX "consultations_tutor_slot_key" ON "public"."consultations" USING "btree" ("tutor_id", "scheduled_at") WHERE ("status" = 'scheduled'::"text");



CREATE INDEX "notifications_user_created_idx" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "notifications_user_unread_idx" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC) WHERE ("read_at" IS NULL);



CREATE INDEX "profiles_display_name_trgm_idx" ON "public"."profiles" USING "gin" ("display_name" "extensions"."gin_trgm_ops");



CREATE OR REPLACE TRIGGER "consultations_enforce_rules" BEFORE INSERT OR UPDATE ON "public"."consultations" FOR EACH ROW EXECUTE FUNCTION "private"."enforce_consultation_rules"();



CREATE OR REPLACE TRIGGER "consultations_set_updated_at" BEFORE UPDATE ON "public"."consultations" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



ALTER TABLE ONLY "public"."consultations"
    ADD CONSTRAINT "consultations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."consultations"
    ADD CONSTRAINT "consultations_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "public"."consultations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "consultations: admins read all" ON "public"."consultations" FOR SELECT TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "consultations: insert own" ON "public"."consultations" FOR INSERT TO "authenticated" WITH CHECK ((("student_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "private"."can_write"() AS "can_write") AND ("status" = 'scheduled'::"text") AND ("completed" = false)));



CREATE POLICY "consultations: read own" ON "public"."consultations" FOR SELECT TO "authenticated" USING (("student_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "consultations: tutors read the ones booked with them" ON "public"."consultations" FOR SELECT TO "authenticated" USING (("tutor_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "consultations: update own" ON "public"."consultations" FOR UPDATE TO "authenticated" USING ((("student_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "private"."can_write"() AS "can_write"))) WITH CHECK ((("student_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "private"."can_write"() AS "can_write")));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications: users mark their own as read" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "notifications: users read their own" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles: admins read everyone" ON "public"."profiles" FOR SELECT TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "profiles: the students booked with a tutor" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."consultations" "c"
  WHERE (("c"."student_id" = "profiles"."id") AND ("c"."tutor_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "profiles: the tutors a student has booked" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."consultations" "c"
  WHERE (("c"."tutor_id" = "profiles"."id") AND ("c"."student_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "profiles: tutors are visible to everyone signed in" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("role" = 'tutor'::"text"));



CREATE POLICY "profiles: users read their own" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid")));



GRANT USAGE ON SCHEMA "private" TO "authenticated";
GRANT USAGE ON SCHEMA "private" TO "supabase_auth_admin";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "private"."can_write"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."can_write"() TO "authenticated";



REVOKE ALL ON FUNCTION "private"."enforce_consultation_rules"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."handle_new_user"() TO "supabase_auth_admin";



REVOKE ALL ON FUNCTION "private"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_admin"() TO "authenticated";



REVOKE ALL ON FUNCTION "private"."set_updated_at"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."admin_list_people"("p_q" "text", "p_roles" "text"[], "p_sort" "text", "p_desc" boolean, "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_list_people"("p_q" "text", "p_roles" "text"[], "p_sort" "text", "p_desc" boolean, "p_limit" integer, "p_offset" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_set_tutor"("p_user" "uuid", "p_make_tutor" boolean, "p_cancel_upcoming" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_set_tutor"("p_user" "uuid", "p_make_tutor" boolean, "p_cancel_upcoming" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."tutor_busy_times"("p_tutor" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tutor_busy_times"("p_tutor" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone) TO "authenticated";



GRANT SELECT ON TABLE "public"."consultations" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."consultations" TO "service_role";



GRANT INSERT("student_id") ON TABLE "public"."consultations" TO "authenticated";



GRANT INSERT("tutor_id") ON TABLE "public"."consultations" TO "authenticated";



GRANT INSERT("reason") ON TABLE "public"."consultations" TO "authenticated";



GRANT INSERT("scheduled_at"),UPDATE("scheduled_at") ON TABLE "public"."consultations" TO "authenticated";



GRANT UPDATE("status") ON TABLE "public"."consultations" TO "authenticated";



GRANT UPDATE("completed") ON TABLE "public"."consultations" TO "authenticated";



GRANT SELECT ON TABLE "public"."profiles" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."profiles" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."consultation_details" TO "service_role";
GRANT SELECT ON TABLE "public"."consultation_details" TO "authenticated";



GRANT SELECT ON TABLE "public"."notifications" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."notifications" TO "service_role";



GRANT UPDATE("read_at") ON TABLE "public"."notifications" TO "authenticated";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";







