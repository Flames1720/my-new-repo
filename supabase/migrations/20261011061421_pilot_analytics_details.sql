create or replace function island_private.analytics() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; associations jsonb; distributions jsonb; phases jsonb; percentiles jsonb;
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
 select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into phases from (
  select r.build, s->>'pixelRatio' pixel_ratio, s->>'canvasWidth' canvas_width, s->>'canvasHeight' canvas_height,
   phase.name phase, sum(coalesce((s->'costs'->>(phase.name||'Samples'))::numeric,(s->'costs'->>(phase.name||'Count'))::numeric,0)) observations,
   round(sum(coalesce((s->'costs'->>(phase.name||'AvgMs'))::numeric,0)*coalesce((s->'costs'->>(phase.name||'Samples'))::numeric,(s->'costs'->>(phase.name||'Count'))::numeric,0)) /
    nullif(sum(coalesce((s->'costs'->>(phase.name||'Samples'))::numeric,(s->'costs'->>(phase.name||'Count'))::numeric,0)),0),3) average_ms,
   max((s->'costs'->>(phase.name||'MaxMs'))::numeric) worst_ms
  from island_private.reports r cross join lateral jsonb_array_elements(r.samples) s
  cross join (values ('fire'),('enemyAI'),('combatEffects'),('chunkPump'),('chunkStream'),('aimQuery'),('mapUpdate'),('survivalUpdate')) phase(name)
  where r.received_at>now()-interval '90 days'
  group by r.build,s->>'pixelRatio',s->>'canvasWidth',s->>'canvasHeight',phase.name
 ) t where t.observations>0;
 with buckets as (
  select r.build,s->>'pixelRatio' pixel_ratio,s->>'canvasWidth' canvas_width,s->>'canvasHeight' canvas_height,
   case h.key when 'over1000' then 1000000000 else substring(h.key from 3)::numeric end upper_ms,sum(h.value::text::numeric) frames
  from island_private.reports r cross join lateral jsonb_array_elements(r.samples) s cross join lateral jsonb_each(coalesce(s->'histogram','{}'::jsonb)) h
  where r.received_at>now()-interval '90 days' and h.key in ('le17','le25','le34','le50','le100','le250','le500','le1000','over1000')
  group by r.build,s->>'pixelRatio',s->>'canvasWidth',s->>'canvasHeight',h.key
 ), cumulative as (
  select *,sum(frames) over(partition by build,pixel_ratio,canvas_width,canvas_height order by upper_ms) cumulative_frames,
   sum(frames) over(partition by build,pixel_ratio,canvas_width,canvas_height) total_frames from buckets
 ), bounds as (
  select build,pixel_ratio,canvas_width,canvas_height,min(upper_ms) filter(where cumulative_frames>=total_frames*0.95) p95_upper_bound_ms,max(total_frames) frames
  from cumulative group by build,pixel_ratio,canvas_width,canvas_height
 ) select coalesce(jsonb_agg(to_jsonb(bounds)),'[]'::jsonb) into percentiles from bounds;
 return jsonb_build_object('groups',result,'action_associations',associations,'frame_distributions',distributions,'phase_costs',phases,'p95_bounds',percentiles,'note','Measured timings and action associations indicate possible contributors; scheduling gaps are not GPU measurements.');
end $$;
