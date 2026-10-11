"""Disposable localhost database only; all fixture changes roll back."""
import json,uuid
from pathlib import Path
import psycopg
DSN='postgresql://postgres:local-pilot-test-only@127.0.0.1:55432/postgres'
owner,player,private=[str(uuid.uuid4()) for _ in range(3)]
with psycopg.connect(DSN) as c:
 c.execute('delete from island_private.players');c.execute('delete from island_private.admins')
 for uid,consent in [(owner,True),(player,True),(private,False)]:
  c.execute('insert into auth.users values(%s,now())',(uid,))
  c.execute('insert into island_private.players(user_id,consent,progress) values(%s,%s,%s)',(uid,consent,json.dumps({'xp':100,'earnedXp':500,'bestWave':5,'totalRuns':2,'totalKills':20,'unlockedWildcards':['shockwave','quick-hands']})))
 c.execute('insert into island_private.admins values(%s)',(owner,))
 for uid,frames,slow,avg,obs,age in [(owner,100,10,3,10,0),(player,300,0,1,30,0),(owner,1000,50,2,10,10)]:
  sample={'windowMs':5000,'frames':frames,'slowFrames':slow,'renderMs':avg,'simulationMs':1,'gapMs':2,'worstFrameMs':75,'pixelRatio':1,'canvasWidth':800,'canvasHeight':360,'wave':3,'livingZombies':2,'actions':{'shootBtn':3,'runtimeError':1},'histogram':{'le25':frames-slow,'le100':slow},'costs':{'fireAvgMs':avg,'fireMaxMs':5,'fireSamples':obs}}
  c.execute("insert into island_private.reports(user_id,session_id,sequence,build,device,samples,received_at) values(%s,%s,0,'center-fixture',%s,%s,now()-make_interval(days=>%s))",(uid,str(uuid.uuid4()),json.dumps({'browser':'Chrome','os':'Android'}),json.dumps([sample]),age))
 assert not c.execute("select has_function_privilege('anon','public.pilot_control_center(integer,text)','execute')").fetchone()[0]
 c.execute('set local role authenticated')
 def call(uid,days=7,build='center-fixture'):
  c.execute("select set_config('request.jwt.claim.sub',%s,true)",(uid,))
  return c.execute('select public.pilot_control_center(%s,%s)',(days,build)).fetchone()[0]
 for uid,days in [(player,7),(None,7),(owner,500)]:
  try:
   with c.transaction():call(uid,days)
  except psycopg.Error:pass
  else:raise AssertionError('Unauthorized/invalid request succeeded')
 data=call(owner);summary=data['summary'];assert summary['fps']==40 and summary['slow_frame_percent']==2.5,summary
 assert summary['players']==2 and summary['sessions']==2 and summary['windows']==2
 assert summary['render_ms']==1.5 and summary['runtime_errors']==2
 assert data['accounts']['admitted_players']==3 and data['accounts']['sharing_players']==2
 assert data['progression']['recorded_runs']==4 and data['progression']['total_kills']==40
 assert next(r for r in data['phase_costs'] if r['phase']=='fire')['average_ms']==1.5
 assert data['daily'][0]['fps']==40 and data['waves'][0]['fps']==40
 assert next(r for r in data['cards'] if r['card']=='quick-hands')['players']==2
 assert call(owner,30)['summary']['windows']==3
 empty=call(owner,7,'missing-build');assert empty['summary']['windows']==0 and empty['summary']['fps'] is None
 Path('/workspace/scratch/control-center-fixture.json').write_text(json.dumps(data))
 c.rollback()
print('PASS: owner/anonymous/player access, date/build filters, unique players/sessions, weighted FPS/phase/slow frames, error counts, opt-in progression and empty data; all fixture changes rolled back.')
