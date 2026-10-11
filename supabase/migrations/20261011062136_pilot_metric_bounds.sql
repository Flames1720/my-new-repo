create or replace function island_private.ingest(epoch uuid, session_id uuid, sequence integer, build text, device jsonb, samples jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare p island_private.players; s jsonb; k text; v jsonb;
begin
 select * into p from island_private.players where user_id=auth.uid() for update;
 if not found or p.consent is not true or p.consent_epoch<>epoch or epoch is null then raise exception 'Reporting consent required' using errcode='42501'; end if;
 if session_id is null or sequence is null or sequence<0 or build is null or build !~ '^[a-zA-Z0-9._-]{1,64}$' or jsonb_typeof(device)<>'object' or jsonb_typeof(samples)<>'array' or jsonb_array_length(samples) not between 1 and 12 or octet_length(samples::text)>65536 then raise exception 'Invalid report'; end if;
 if device->>'browser' not in ('Chrome','Firefox','Safari','Other') or device->>'os' not in ('Android','iOS','Other') then raise exception 'Invalid device category'; end if;
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
   elsif k in ('windowMs','frames','slowFrames','worstFrameMs','callbackMs','gapMs','simulationMs','renderMs','drawCalls','wave','livingZombies','chunkQueueDepth','pixelRatio','canvasWidth','canvasHeight','longTasks','callbackMaxMs','gapMaxMs','simulationMaxMs','renderMaxMs','drawCallsMax') then
    if jsonb_typeof(v)<>'number' or (v::text)::numeric<0 or (v::text)::numeric>1000000000 then raise exception 'Invalid metric'; end if;
   else raise exception 'Unknown sample field'; end if;
  end loop;
  if not(s ? 'frames' and s ? 'windowMs') or (s->>'windowMs')::numeric<=0 or (s->>'frames')::numeric<=0 or coalesce((s->>'slowFrames')::numeric,0)>(s->>'frames')::numeric then raise exception 'Sample duration required'; end if;
 end loop;
 delete from island_private.reports where received_at<now()-interval '90 days';
 insert into island_private.reports(user_id,session_id,sequence,build,device,samples) values(p.user_id,session_id,sequence,build,device,samples);
 return true;
end $$;
revoke all on function island_private.ingest(uuid,uuid,integer,text,jsonb,jsonb) from public,anon;
grant execute on function island_private.ingest(uuid,uuid,integer,text,jsonb,jsonb) to authenticated;
