-- Owner-only aggregate analytics. No new player tracking or raw account data exposed.
create function island_private.progress_number(value jsonb) returns numeric language sql immutable security invoker set search_path='' as $$
 select case when jsonb_typeof(value)='number' then greatest(0,least(value::text::numeric,1000000000)) else 0 end
$$;
revoke all on function island_private.progress_number(jsonb) from public,anon,authenticated;
create or replace function island_private.control_center(days integer, selected_build text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; associations jsonb; distributions jsonb; phases jsonb; percentiles jsonb;
 summary jsonb; accounts jsonb; builds jsonb; daily jsonb; waves jsonb; progression jsonb; cards jsonb;
 since timestamptz;
begin
 if not exists(select 1 from island_private.admins where user_id=auth.uid()) then raise exception 'Administrator required' using errcode='42501'; end if;
 if days is null or days not in (1,7,30,90) or (selected_build is not null and selected_build !~ '^[a-zA-Z0-9._-]{1,64}$') then raise exception 'Invalid filter'; end if;
 since := now() - make_interval(days=>days);
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
  where r.received_at>since and (selected_build is null or r.build=selected_build)
  group by r.build,r.device->>'browser',r.device->>'os',s->>'pixelRatio',s->>'canvasWidth',s->>'canvasHeight'
 ) t;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into associations from (
  select r.build, a.key action, count(*) windows, sum(a.value::text::numeric) occurrences,
   round(100*sum((s->>'slowFrames')::numeric)/nullif(sum((s->>'frames')::numeric),0),2) slow_frame_percent,
   round(sum((s->>'renderMs')::numeric*(s->>'frames')::numeric)/nullif(sum((s->>'frames')::numeric),0),2) render_avg_ms
  from island_private.reports r cross join lateral jsonb_array_elements(r.samples) s
  cross join lateral jsonb_each(coalesce(s->'actions','{}'::jsonb)) a
  where r.received_at>since and (selected_build is null or r.build=selected_build) and a.value::text::numeric>0
  group by r.build,a.key
 ) t;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into distributions from (
  select r.build,s->>'pixelRatio' pixel_ratio,s->>'canvasWidth' canvas_width,s->>'canvasHeight' canvas_height,h.key frame_bucket,sum(h.value::text::numeric) frames
  from island_private.reports r cross join lateral jsonb_array_elements(r.samples) s
  cross join lateral jsonb_each(coalesce(s->'histogram','{}'::jsonb)) h
  where r.received_at>since and (selected_build is null or r.build=selected_build)
  group by r.build,s->>'pixelRatio',s->>'canvasWidth',s->>'canvasHeight',h.key
 ) t;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into phases from (
  select r.build, s->>'pixelRatio' pixel_ratio, s->>'canvasWidth' canvas_width, s->>'canvasHeight' canvas_height,
   phase.name phase, sum(coalesce((s->'costs'->>(phase.name||'Samples'))::numeric,(s->'costs'->>(phase.name||'Count'))::numeric,0)) observations,
   round(sum(coalesce((s->'costs'->>(phase.name||'AvgMs'))::numeric,0)*coalesce((s->'costs'->>(phase.name||'Samples'))::numeric,(s->'costs'->>(phase.name||'Count'))::numeric,0)) /
    nullif(sum(coalesce((s->'costs'->>(phase.name||'Samples'))::numeric,(s->'costs'->>(phase.name||'Count'))::numeric,0)),0),3) average_ms,
   max((s->'costs'->>(phase.name||'MaxMs'))::numeric) worst_ms
  from island_private.reports r cross join lateral jsonb_array_elements(r.samples) s
  cross join (values ('fire'),('enemyAI'),('combatEffects'),('chunkPump'),('chunkStream'),('aimQuery'),('mapUpdate'),('survivalUpdate')) phase(name)
  where r.received_at>since and (selected_build is null or r.build=selected_build)
  group by r.build,s->>'pixelRatio',s->>'canvasWidth',s->>'canvasHeight',phase.name
 ) t where t.observations>0;
 with buckets as (
  select r.build,s->>'pixelRatio' pixel_ratio,s->>'canvasWidth' canvas_width,s->>'canvasHeight' canvas_height,
   case h.key when 'over1000' then 1000000000 else substring(h.key from 3)::numeric end upper_ms,sum(h.value::text::numeric) frames
  from island_private.reports r cross join lateral jsonb_array_elements(r.samples) s cross join lateral jsonb_each(coalesce(s->'histogram','{}'::jsonb)) h
  where r.received_at>since and (selected_build is null or r.build=selected_build) and h.key in ('le17','le25','le34','le50','le100','le250','le500','le1000','over1000')
  group by r.build,s->>'pixelRatio',s->>'canvasWidth',s->>'canvasHeight',h.key
 ), cumulative as (
  select *,sum(frames) over(partition by build,pixel_ratio,canvas_width,canvas_height order by upper_ms) cumulative_frames,
   sum(frames) over(partition by build,pixel_ratio,canvas_width,canvas_height) total_frames from buckets
 ), bounds as (
  select build,pixel_ratio,canvas_width,canvas_height,min(upper_ms) filter(where cumulative_frames>=total_frames*0.95) p95_upper_bound_ms,max(total_frames) frames
  from cumulative group by build,pixel_ratio,canvas_width,canvas_height
 ) select coalesce(jsonb_agg(to_jsonb(bounds)),'[]'::jsonb) into percentiles from bounds;

 select jsonb_build_object('admitted_players',count(*),'sharing_players',count(*) filter(where consent),'capacity',(select player_limit from island_private.config where id=true),'confirmed_accounts',(select count(*) from auth.users where email_confirmed_at is not null)) into accounts from island_private.players;
 select coalesce(jsonb_agg(build order by build),'[]'::jsonb) into builds from (select distinct build from island_private.reports where received_at>since) t;
 select jsonb_build_object('windows',count(*),'players',count(distinct r.user_id),'sessions',count(distinct (r.user_id,r.session_id)),
 'captured_minutes',round(coalesce(sum((s->>'windowMs')::numeric),0)/60000,2),
 'fps',round(1000*sum((s->>'frames')::numeric)/nullif(sum((s->>'windowMs')::numeric),0),2),
 'slow_frame_percent',round(100*sum((s->>'slowFrames')::numeric)/nullif(sum((s->>'frames')::numeric),0),2),
 'render_ms',round(sum((s->>'renderMs')::numeric*(s->>'frames')::numeric)/nullif(sum((s->>'frames')::numeric),0),2),
 'simulation_ms',round(sum((s->>'simulationMs')::numeric*(s->>'frames')::numeric)/nullif(sum((s->>'frames')::numeric),0),2),
 'gap_ms',round(sum((s->>'gapMs')::numeric*(s->>'frames')::numeric)/nullif(sum((s->>'frames')::numeric),0),2),
 'latest_upload',max(r.received_at),'runtime_errors',coalesce(sum((s->'actions'->>'runtimeError')::numeric),0),'unhandled_rejections',coalesce(sum((s->'actions'->>'unhandledRejection')::numeric),0)) into summary
 from island_private.reports r cross join lateral jsonb_array_elements(r.samples) s where r.received_at>since and (selected_build is null or r.build=selected_build);
 select coalesce(jsonb_agg(to_jsonb(t) order by t.day),'[]'::jsonb) into daily from (
 select (r.received_at at time zone 'UTC')::date as day,count(*) windows,count(distinct r.user_id) players,
 round(1000*sum((s->>'frames')::numeric)/nullif(sum((s->>'windowMs')::numeric),0),2) fps,
 round(100*sum((s->>'slowFrames')::numeric)/nullif(sum((s->>'frames')::numeric),0),2) slow_frame_percent
 from island_private.reports r cross join lateral jsonb_array_elements(r.samples) s where r.received_at>since and (selected_build is null or r.build=selected_build)
 group by (r.received_at at time zone 'UTC')::date) t;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.wave),'[]'::jsonb) into waves from (
 select (s->>'wave')::numeric wave,count(*) windows,count(distinct r.user_id) players,
 round(1000*sum((s->>'frames')::numeric)/nullif(sum((s->>'windowMs')::numeric),0),2) fps,
 round(100*sum((s->>'slowFrames')::numeric)/nullif(sum((s->>'frames')::numeric),0),2) slow_frame_percent,
 round(avg((s->>'livingZombies')::numeric),2) average_living_zombies
 from island_private.reports r cross join lateral jsonb_array_elements(r.samples) s where r.received_at>since and (selected_build is null or r.build=selected_build) and (s->>'wave')::numeric between 0 and 100
 group by (s->>'wave')::numeric) t;
 select jsonb_build_object('players',count(*),'recorded_runs',coalesce(sum(island_private.progress_number(progress->'totalRuns')),0),
 'total_kills',coalesce(sum(island_private.progress_number(progress->'totalKills')),0),'best_wave',coalesce(max(island_private.progress_number(progress->'bestWave')),0),
 'average_best_wave',round(avg(island_private.progress_number(progress->'bestWave')),2),'average_available_xp',round(avg(island_private.progress_number(progress->'xp')),2),
 'average_earned_xp',round(avg(island_private.progress_number(coalesce(progress->'earnedXp',progress->'xp'))),2)) into progression from island_private.players where consent;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.players desc,t.card),'[]'::jsonb) into cards from (
 select card,count(distinct p.user_id) players from island_private.players p cross join lateral jsonb_array_elements_text(case when jsonb_typeof(p.progress->'unlockedWildcards')='array' then p.progress->'unlockedWildcards' else '[]'::jsonb end) card
 where p.consent and card in ('shockwave','field-medic','quick-hands','endurance','reinforced-vest','steady-grip','scavenger','sharpshooter') group by card) t;
 return jsonb_build_object('generated_at',now(),'days',days,'selected_build',selected_build,'accounts',accounts,'builds',builds,'summary',summary,'daily',daily,'waves',waves,'progression',progression,'cards',cards,
 'groups',result,'action_associations',associations,'frame_distributions',distributions,'phase_costs',phases,'p95_bounds',percentiles);
end $$;
revoke all on function island_private.control_center(integer,text) from public,anon;
grant execute on function island_private.control_center(integer,text) to authenticated;
create function public.pilot_control_center(days integer default 7, selected_build text default null) returns jsonb language sql security invoker set search_path='' as $$ select island_private.control_center(days,selected_build) $$;
revoke all on function public.pilot_control_center(integer,text) from public,anon;
grant execute on function public.pilot_control_center(integer,text) to authenticated;
