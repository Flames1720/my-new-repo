"""Run against a disposable PostgreSQL with auth stubs and the pilot migration installed."""
import concurrent.futures, json, uuid
import psycopg
DSN='postgresql://postgres:local-pilot-test-only@127.0.0.1:55432/postgres'
def connect(): return psycopg.connect(DSN,autocommit=True)
ids=[str(uuid.uuid4()) for _ in range(21)]
with connect() as c:
 c.execute('truncate island_private.reports,island_private.players,auth.users cascade')
 for uid in ids:c.execute('insert into auth.users values(%s,now())',(uid,))
def call(uid,sql,args=()):
 with connect() as c:
  c.execute('set role authenticated');c.execute("select set_config('request.jwt.claim.sub',%s,false)",(uid,))
  return c.execute(sql,args).fetchone()[0]
with concurrent.futures.ThreadPoolExecutor(max_workers=21) as pool:
 results=list(pool.map(lambda uid:call(uid,'select public.pilot_admit()'),ids))
assert sum(r['admitted'] for r in results)==20
uid=next(u for u,r in zip(ids,results) if r['admitted']); assert call(uid,'select public.pilot_admit()')['admitted']
def denied(sql,args=(),user=uid):
 try:call(user,sql,args)
 except psycopg.Error:return
 raise AssertionError('Unauthorized request succeeded: '+sql)
denied('select count(*) from island_private.players')
denied('select public.pilot_analytics()')
session=str(uuid.uuid4()); epoch=call(uid,'select public.pilot_consent(true)')
samples=json.dumps([{'frames':100,'windowMs':5000,'slowFrames':10,'worstFrameMs':70,'renderMs':10,'simulationMs':2,'gapMs':8,'pixelRatio':1,'canvasWidth':800,'canvasHeight':360,'actions':{'shootBtn':3},'histogram':{'le17':90,'le100':10},'costs':{'fireAvgMs':3,'fireMaxMs':5,'fireSamples':10}}])
args=(epoch,session,0,'pilot-v1','{"browser":"Chrome"}',samples)
assert call(uid,'select public.pilot_report(%s,%s,%s,%s,%s,%s)',args)
assert call(uid,'select public.pilot_report(%s,%s,%s,%s,%s,%s)',args)
with connect() as c:assert c.execute('select count(*) from island_private.reports').fetchone()[0]==1
call(uid,'select public.pilot_consent(false)')
with connect() as c:assert c.execute('select count(*) from island_private.reports').fetchone()[0]==0
denied('select public.pilot_report(%s,%s,%s,%s,%s,%s)',args)
epoch=call(uid,'select public.pilot_consent(true)');args=(epoch,session,1,'pilot-v1','{"email":"private"}',samples);denied('select public.pilot_report(%s,%s,%s,%s,%s,%s)',args)
args=(epoch,session,1,'pilot-v1','{"browser":"Chrome"}',samples);call(uid,'select public.pilot_report(%s,%s,%s,%s,%s,%s)',args)
with connect() as c:c.execute('insert into island_private.admins values(%s)',(uid,))
data=call(uid,'select public.pilot_analytics()');assert data['groups'][0]['fps']==20;assert data['groups'][0]['slow_frame_percent']==10
second=json.dumps([{'frames':100,'windowMs':2000,'slowFrames':0,'worstFrameMs':25,'renderMs':5,'simulationMs':1,'gapMs':3,'pixelRatio':1,'canvasWidth':800,'canvasHeight':360,'histogram':{'le25':100},'costs':{'fireAvgMs':1,'fireMaxMs':1,'fireSamples':1}}])
call(uid,'select public.pilot_report(%s,%s,%s,%s,%s,%s)',(epoch,session,2,'pilot-v1','{"browser":"Chrome"}',second))
data=call(uid,'select public.pilot_analytics()');assert data['groups'][0]['fps']==28.57;assert data['groups'][0]['slow_frame_percent']==5;assert data['groups'][0]['render_avg_ms']==7.5
assert data['p95_bounds'][0]['p95_upper_bound_ms']==25
phase=next(p for p in data['phase_costs'] if p['phase']=='fire');assert phase['observations']==11 and phase['average_ms']==2.818
unconfirmed=str(uuid.uuid4())
with connect() as c:c.execute('insert into auth.users values(%s,null)',(unconfirmed,))
denied('select public.pilot_admit()',user=unconfirmed)
print('PASS: 21 concurrent admissions yield exactly 20 places; existing admission, table isolation, admin gate, consent/deletion, stale epoch, deduplication, device privacy, weighted metrics and confirmed-email requirement.')
