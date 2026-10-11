-- Admission and reports are accessible only through authenticated, scoped RPCs.
create schema if not exists island_private;
revoke all on schema island_private from public, anon;
grant usage on schema island_private to authenticated;
create table island_private.config (id boolean primary key default true check(id), player_limit integer not null check(player_limit between 1 and 20));
insert into island_private.config values(true,20);
create table island_private.players (
 user_id uuid primary key references auth.users(id) on delete cascade,
 joined_at timestamptz not null default now(), consent boolean,
 consent_epoch uuid not null default gen_random_uuid(), consent_at timestamptz,
 consent_version text, progress jsonb not null default '{}'::jsonb
);
create table island_private.admins (user_id uuid primary key references auth.users(id) on delete cascade);
create table island_private.reports (
 id bigint generated always as identity primary key,
 user_id uuid not null references island_private.players(user_id) on delete cascade,
 session_id uuid not null, sequence integer not null check(sequence >= 0),
 build text not null, device jsonb not null, samples jsonb not null,
 received_at timestamptz not null default now(), unique(user_id,session_id,sequence)
);
create index reports_player_received on island_private.reports(user_id,received_at);
create index reports_received on island_private.reports(received_at);
alter table island_private.config enable row level security;
alter table island_private.players enable row level security;
alter table island_private.admins enable row level security;
alter table island_private.reports enable row level security;
revoke all on all tables in schema island_private from public,anon,authenticated;

create function island_private.admit() returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid(); p island_private.players; cap integer;
begin
 if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null) then raise exception 'Confirmed account required' using errcode='42501'; end if;
 select player_limit into cap from island_private.config where id=true for update;
 select * into p from island_private.players where user_id=uid;
 if not found then
  if (select count(*) from island_private.players)>=cap then return jsonb_build_object('admitted',false,'full',true); end if;
  insert into island_private.players(user_id) values(uid) returning * into p;
 end if;
 return jsonb_build_object('admitted',true,'consent',p.consent,'epoch',p.consent_epoch,'progress',p.progress,'admin',exists(select 1 from island_private.admins where user_id=uid));
end $$;
create function island_private.consent(allowed boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare epoch uuid;
begin
 if allowed is null then raise exception 'Consent choice required'; end if;
 update island_private.players set consent=allowed,consent_epoch=gen_random_uuid(),consent_at=now(),consent_version='pilot-v1' where user_id=auth.uid() returning consent_epoch into epoch;
 if epoch is null then raise exception 'Admission required' using errcode='42501'; end if;
 if not allowed then delete from island_private.reports where user_id=auth.uid(); end if;
 return epoch;
end $$;
create function island_private.save_progress(value jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if jsonb_typeof(value)<>'object' or octet_length(value::text)>16384 then raise exception 'Invalid progress'; end if;
 update island_private.players set progress=value where user_id=auth.uid();
 if not found then raise exception 'Admission required' using errcode='42501'; end if;
end $$;
create function island_private.ingest(epoch uuid, session_id uuid, sequence integer, build text, device jsonb, samples jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare p island_private.players; s jsonb; k text; v jsonb;
begin
 select * into p from island_private.players where user_id=auth.uid() for update;
 if not found or p.consent is not true or p.consent_epoch<>epoch or epoch is null then raise exception 'Reporting consent required' using errcode='42501'; end if;
 if session_id is null or sequence is null or sequence<0 or build is null or build !~ '^[a-zA-Z0-9._-]{1,64}$' or jsonb_typeof(device)<>'object' or jsonb_typeof(samples)<>'array' or jsonb_array_length(samples) not between 1 and 12 or octet_length(samples::text)>65536 then raise exception 'Invalid report'; end if;
 if exists(select 1 from island_private.reports r where r.user_id=p.user_id and r.session_id=ingest.session_id and r.sequence=ingest.sequence) then return true; end if;
 if (select count(*) from island_private.reports where user_id=p.user_id and received_at>now()-interval '1 hour')>=240 then raise exception 'Report rate exceeded'; end if;
 for k,v in select * from jsonb_each(device) loop
  if k not in ('browser','os','cores','memoryGB','width','height','dpr') or jsonb_typeof(v) not in ('number','string','null') or length(v::text)>40 then raise exception 'Invalid device field'; end if;
 end loop;
 for s in select * from jsonb_array_elements(samples) loop
  if jsonb_typeof(s)<>'object' then raise exception 'Invalid sample'; end if;
  for k,v in select * from jsonb_each(s) loop
   if k in ('actions','costs','histogram') then
    if jsonb_typeof(v)<>'object' or octet_length(v::text)>4096 then raise exception 'Invalid counters'; end if;
    if exists(select 1 from jsonb_each(v) e where e.key !~ '^[a-zA-Z0-9_]{1,48}$' or jsonb_typeof(e.value)<>'number' or (e.value::text)::numeric<0 or (e.value::text)::numeric>1000000000) then raise exception 'Invalid counter'; end if;
   elsif k in ('windowMs','frames','slowFrames','worstFrameMs','callbackMs','gapMs','simulationMs','renderMs','drawCalls','wave','livingZombies','chunkQueueDepth','pixelRatio','canvasWidth','canvasHeight','longTasks') then
    if jsonb_typeof(v)<>'number' or (v::text)::numeric<0 or (v::text)::numeric>1000000000 then raise exception 'Invalid metric'; end if;
   else raise exception 'Unknown sample field'; end if;
  end loop;
  if not(s ? 'frames' and s ? 'windowMs') or (s->>'windowMs')::numeric<=0 then raise exception 'Sample duration required'; end if;
 end loop;
 delete from island_private.reports where received_at<now()-interval '90 days';
 insert into island_private.reports(user_id,session_id,sequence,build,device,samples) values(p.user_id,session_id,sequence,build,device,samples);
 return true;
end $$;
create function island_private.analytics() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; associations jsonb; distributions jsonb;
begin
 if not exists(select 1 from island_private.admins where user_id=auth.uid()) then raise exception 'Administrator required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into result from (
  select r.build,r.device->>'browser' browser,r.device->>'os' os,s->>'pixelRatio' pixel_ratio,s->>'canvasWidth' canvas_width,s->>'canvasHeight' canvas_height,
   count(*) windows,count(distinct r.user_id) players,
   round(1000*sum((s->>'frames')::numeric)/nullif(sum((s->>'windowMs')::numeric),0),2) fps,
   round(100*sum((s->>'slowFrames')::numeric)/nullif(sum((s->>'frames')::numeric),0),2) slow_frame_percent,
   max((s->>'worstFrameMs')::numeric) worst_frame_ms,
   round(sum((s->>'renderMs')::numeric*(s->>'frames')::numeric)/nullif(sum((s->>'frames')::numeric),0),2) render_avg_ms,
   round(sum((s->>'simulationMs')::numeric*(s->>'frames')::numeric)/nullif(sum((s->>'frames')::numeric),0),2) simulation_avg_ms,
   round(sum((s->>'gapMs')::numeric*(s->>'frames')::numeric)/nullif(sum((s->>'frames')::numeric),0),2) gap_avg_ms
  from island_private.reports r cross join lateral jsonb_array_elements(r.samples) s
  where r.received_at>now()-interval '90 days'
  group by r.build,r.device->>'browser',r.device->>'os',s->>'pixelRatio',s->>'canvasWidth',s->>'canvasHeight'
 ) t;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into associations from (
  select r.build, a.key action, count(*) windows, sum(a.value::text::numeric) occurrences,
   round(100*sum((s->>'slowFrames')::numeric)/nullif(sum((s->>'frames')::numeric),0),2) slow_frame_percent,
   round(sum((s->>'renderMs')::numeric*(s->>'frames')::numeric)/nullif(sum((s->>'frames')::numeric),0),2) render_avg_ms
  from island_private.reports r cross join lateral jsonb_array_elements(r.samples) s
  cross join lateral jsonb_each(coalesce(s->'actions','{}'::jsonb)) a
  where r.received_at>now()-interval '90 days' and a.value::text::numeric>0
  group by r.build,a.key
 ) t;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into distributions from (
  select r.build,s->>'pixelRatio' pixel_ratio,s->>'canvasWidth' canvas_width,s->>'canvasHeight' canvas_height,h.key frame_bucket,sum(h.value::text::numeric) frames
  from island_private.reports r cross join lateral jsonb_array_elements(r.samples) s
  cross join lateral jsonb_each(coalesce(s->'histogram','{}'::jsonb)) h
  where r.received_at>now()-interval '90 days'
  group by r.build,s->>'pixelRatio',s->>'canvasWidth',s->>'canvasHeight',h.key
 ) t;
 return jsonb_build_object('groups',result,'action_associations',associations,'frame_distributions',distributions,'note','Measured timings and action associations indicate possible contributors; scheduling gaps are not GPU measurements.');
end $$;
revoke all on all functions in schema island_private from public,anon;
grant execute on all functions in schema island_private to authenticated;
create function public.pilot_admit() returns jsonb language sql security invoker set search_path='' as $$ select island_private.admit() $$;
create function public.pilot_consent(allowed boolean) returns uuid language sql security invoker set search_path='' as $$ select island_private.consent(allowed) $$;
create function public.pilot_save_progress(value jsonb) returns void language sql security invoker set search_path='' as $$ select island_private.save_progress(value) $$;
create function public.pilot_report(epoch uuid,session_id uuid,sequence integer,build text,device jsonb,samples jsonb) returns boolean language sql security invoker set search_path='' as $$ select island_private.ingest(epoch,session_id,sequence,build,device,samples) $$;
create function public.pilot_analytics() returns jsonb language sql security invoker set search_path='' as $$ select island_private.analytics() $$;
revoke all on function public.pilot_admit(),public.pilot_consent(boolean),public.pilot_save_progress(jsonb),public.pilot_report(uuid,uuid,integer,text,jsonb,jsonb),public.pilot_analytics() from public,anon;
grant execute on function public.pilot_admit(),public.pilot_consent(boolean),public.pilot_save_progress(jsonb),public.pilot_report(uuid,uuid,integer,text,jsonb,jsonb),public.pilot_analytics() to authenticated;

create function island_private.purge_expired_reports() returns bigint language plpgsql security definer set search_path='' as $$
declare deleted bigint;
begin
 delete from island_private.reports where received_at<now()-interval '90 days';
 get diagnostics deleted = row_count; return deleted;
end $$;
revoke all on function island_private.purge_expired_reports() from public,anon,authenticated;
