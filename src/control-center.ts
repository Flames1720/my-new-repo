type Row = Record<string, unknown>;
export type ControlCenterData = {
  generated_at:string; days:number; selected_build:string|null;
  accounts:Row; summary:Row; progression:Row; builds:string[];
  groups:Row[]; daily:Row[]; waves:Row[]; cards:Row[];
  phase_costs:Row[]; action_associations:Row[]; frame_distributions:Row[];
};
const labels:Record<string,string>={fire:'Firing',enemyAI:'Enemy AI',combatEffects:'Combat effects',chunkPump:'Chunk construction',chunkStream:'Chunk streaming',aimQuery:'Aim queries',mapUpdate:'Map drawing',survivalUpdate:'Survival update',shockwave:'Pulse', 'field-medic':'Field Medic','quick-hands':'Quick Hands',endurance:'Endurance','reinforced-vest':'Reinforced Vest','steady-grip':'Steady Grip',scavenger:'Scavenger',sharpshooter:'Sharpshooter'};
function text(tag:string, value:string, className=''):HTMLElement { const el=document.createElement(tag); el.textContent=value; el.className=className;return el; }
function numeric(value:unknown):number|null { if(value===null||value===undefined||value==='')return null;const n=Number(value);return Number.isFinite(n)?n:null; }
function number(value:unknown,digits=0):string { const n=numeric(value);return n===null?'—':n.toLocaleString(undefined,{maximumFractionDigits:digits}); }
function resolution(row:Row):string {return `${number(row.canvas_width)} × ${number(row.canvas_height)} · ${number(row.pixel_ratio,2)} DPR`;}
function table(title:string, explanation:string, rows:Row[], columns:Array<[string,(row:Row)=>string]>):HTMLElement {
 const section=text('section','','controlPanel');section.append(text('h2',title),text('p',explanation,'controlNote'));
 if(!rows.length){section.append(text('p','No matching reports yet.','controlEmpty'));return section;}
 const wrap=text('div','','controlTable');const t=document.createElement('table');const caption=text('caption',title,'controlVisuallyHidden');t.append(caption);
 const head=document.createElement('thead');const tr=document.createElement('tr');for(const [label]of columns){const th=text('th',label);th.setAttribute('scope','col');tr.append(th);}head.append(tr);t.append(head);
 const body=document.createElement('tbody');for(const row of rows){const tr=document.createElement('tr');for(const [,value]of columns)tr.append(text('td',value(row)));body.append(tr);}t.append(body);wrap.append(t);section.append(wrap);return section;
}
export function histogramSummary(rows:Row[]):{bound:string;total:number;buckets:Array<{label:string;count:number}>} {
 const keys=['le17','le25','le34','le50','le100','le250','le500','le1000','over1000'];const counts=new Map(keys.map(key=>[key,0]));
 for(const row of rows){const key=String(row.frame_bucket);if(counts.has(key))counts.set(key,counts.get(key)!+Math.max(0,numeric(row.frames)||0));}
 const total=[...counts.values()].reduce((a,b)=>a+b,0);let cumulative=0,bound='—';
 for(const key of keys){cumulative+=counts.get(key)!;if(total&&cumulative>=total*.95){bound=key==='over1000'?'>1,000 ms':`≤${key.slice(2)} ms`;break;}}
 const ranges=['≤17 ms','17–25 ms','25–34 ms','34–50 ms','50–100 ms','100–250 ms','250–500 ms','500–1,000 ms','>1,000 ms'];
 return {bound,total,buckets:keys.map((key,i)=>({label:ranges[i],count:counts.get(key)!}))};
}
export function mountControlCenter(root:HTMLElement, load:(days:number,build:string|null)=>Promise<ControlCenterData>, signOut?:()=>Promise<void>):void {
 root.innerHTML=`<header class="controlHeader"><div><p class="controlEyebrow">ISLAND OUTBREAK · OWNER ACCESS</p><h1>Control Center</h1><p>Turn player reports into the next improvement.</p></div><a href="/">BACK TO GAME ↗</a></header><form class="controlFilters"><label>Report period<select name="days"><option value="1">Last 24 hours</option><option value="7" selected>Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label><label>Game version<select name="build"><option value="">All reported versions</option></select></label><button type="submit">REFRESH DATA</button><button type="button" data-export disabled>DOWNLOAD SUMMARY</button></form><p class="controlStatus" role="status" aria-live="polite"></p><div class="controlContent"></div><footer>Performance sharing is optional. Reports expire after 90 days. This page contains aggregates, not passwords, emails, recordings or typed text.</footer>`;
 const form=root.querySelector<HTMLFormElement>('form')!, days=form.querySelector<HTMLSelectElement>('[name=days]')!, build=form.querySelector<HTMLSelectElement>('[name=build]')!;
 const status=root.querySelector<HTMLElement>('.controlStatus')!, content=root.querySelector<HTMLElement>('.controlContent')!, refresh=form.querySelector<HTMLButtonElement>('[type=submit]')!, download=form.querySelector<HTMLButtonElement>('[data-export]')!;
 if(signOut){const logout=document.createElement('button');logout.type='button';logout.textContent='SIGN OUT';logout.onclick=async()=>{logout.disabled=true;try{await signOut();}catch{status.textContent='Sign out failed. Check your connection and try again.';logout.disabled=false;}};root.querySelector('.controlHeader')!.append(logout);}
 let snapshot:ControlCenterData|null=null;
 function render(data:ControlCenterData):void {
  content.replaceChildren();const s=data.summary,a=data.accounts,p=data.progression,hist=histogramSummary(data.frame_distributions);
  const stats=text('div','','controlStats');
  for(const [label,value,detail]of [
   ['Admitted players',`${number(a.admitted_players)} / ${number(a.capacity)}`,`${number(a.confirmed_accounts)} confirmed accounts · all time`],
   ['Sharing game data',number(a.sharing_players),'Current player consent'],
   ['Reporting players',number(s.players),`${number(s.sessions)} captured sessions · selected period`],
   ['Weighted frame rate',`${number(s.fps,1)} FPS`,`${number(s.windows)} windows · ${number(s.captured_minutes,1)} captured minutes`],
   ['Slow frames',`${number(s.slow_frame_percent,1)}%`,'Frames taking longer than 50 ms'],
   ['P95 bucket bound',hist.bound,'95% of recorded frame intervals fall within this bound'],
  ]){const card=text('article','','controlStat');card.append(text('p',label),text('strong',value),text('small',detail));stats.append(card);}content.append(stats);
  const latest=s.latest_upload?new Date(String(s.latest_upload)).toUTCString():'No uploads in this selection';
  content.append(text('p',`Latest upload: ${latest}. Reporting players are not a live online count.`,'controlNote'));
  if(!Number(s.windows))content.append(text('p','No performance reports match these filters. Players must opt in and play before reports appear.','controlEmpty'));
  const health=text('section','','controlPanel');health.append(text('h2','Frame budget & stability'));
  const metrics=text('div','','controlMetricRow');for(const [label,key]of [['Rendering','render_ms'],['Simulation','simulation_ms'],['Between-frame gap','gap_ms']])metrics.append(text('p',`${label}: ${number(s[key],2)} ms`));health.append(metrics);
  health.append(text('p',`${number(s.runtime_errors)} reported runtime errors · ${number(s.unhandled_rejections)} unhandled promise rejections`));
  health.append(text('p','Gaps include browser scheduling and compositor waits. They do not measure GPU time or phone temperature. Errors are counters observed in captured windows.','controlNote'));content.append(health);
  content.append(table('Device & version comparison','FPS uses total frames / total captured duration. Timings are weighted by frame count; each row shows its sample coverage.',data.groups.slice().sort((a,b)=>(numeric(a.fps)||0)-(numeric(b.fps)||0)),[
   ['Version',r=>String(r.build)],['Device',r=>`${r.os} · ${r.browser}`],['Render resolution',resolution],['Players',r=>number(r.players)],['Windows',r=>number(r.windows)],['FPS',r=>number(r.fps,1)],['Slow frames',r=>`${number(r.slow_frame_percent,1)}%`],['Render',r=>`${number(r.render_avg_ms,2)} ms`],['Simulation',r=>`${number(r.simulation_avg_ms,2)} ms`],['Worst interval',r=>`${number(r.worst_frame_ms,1)} ms`],
  ]));
  const charts=text('div','','controlCharts');const frames=text('section','','controlPanel');frames.append(text('h2','Frame interval distribution'),text('p',`${number(hist.total)} captured frames. This describes smoothness across the selected reports.`,'controlNote'));
  for(const bucket of hist.buckets){const row=text('div','','controlBarRow');const track=text('div','','controlBarTrack'),bar=text('span','','controlBar');const pct=hist.total?bucket.count/hist.total*100:0;bar.style.width=`${pct}%`;track.append(bar);row.append(text('span',bucket.label),track,text('b',`${number(pct,1)}%`));frames.append(row);}charts.append(frames);
  charts.append(table('Daily performance','Grouped by upload day in UTC; weighted FPS. This is not a retention or daily-active-player measurement.',data.daily,[['UTC day',r=>String(r.day)],['Players',r=>number(r.players)],['Windows',r=>number(r.windows)],['FPS',r=>number(r.fps,1)],['Slow frames',r=>`${number(r.slow_frame_percent,1)}%`]]));content.append(charts);
  content.append(table('Measured phase costs','Sorted by average cost per observation. Phases can overlap and have different sampling rates; do not add these averages together.',data.phase_costs.slice().sort((a,b)=>(numeric(b.average_ms)||0)-(numeric(a.average_ms)||0)),[['Phase',r=>labels[String(r.phase)]||String(r.phase)],['Version',r=>String(r.build)],['Resolution',resolution],['Observations',r=>number(r.observations)],['Average',r=>`${number(r.average_ms,3)} ms`],['Worst',r=>`${number(r.worst_ms,1)} ms`]]));
  content.append(table('Action associations','These are windows where an action occurred, not proof that the action caused lag. A window can contain several actions.',data.action_associations,[['Action',r=>String(r.action)],['Version',r=>String(r.build)],['Count',r=>number(r.occurrences)],['Windows',r=>number(r.windows)],['Slow frames',r=>`${number(r.slow_frame_percent,1)}%`],['Rendering',r=>`${number(r.render_avg_ms,2)} ms`]]));
  content.append(table('Performance by wave','Wave 0 is preparation. These are sampled waves, not death counts or completion rates.',data.waves,[['Wave',r=>number(r.wave)],['Players',r=>number(r.players)],['Windows',r=>number(r.windows)],['FPS',r=>number(r.fps,1)],['Slow frames',r=>`${number(r.slow_frame_percent,1)}%`],['Living infected',r=>number(r.average_living_zombies,1)]]));
  const progress=text('section','','controlPanel');progress.append(text('h2','Progression & card economy'),text('p',`Lifetime saved progress for ${number(p.players)} currently consenting players. Date and version filters do not apply here. These totals are player-saved records, not verified run histories.`,'controlNote'));
  const progression=text('div','','controlMetricRow');for(const [label,key]of [['Recorded finished runs','recorded_runs'],['Total kills','total_kills'],['Best wave reached','best_wave'],['Average best wave','average_best_wave'],['Average spendable XP','average_available_xp'],['Average lifetime XP','average_earned_xp']])progression.append(text('p',`${label}: ${number(p[key],1)}`));progress.append(progression);
  const owned=text('div','','controlOwnership');for(const card of data.cards)owned.append(text('p',`${labels[String(card.card)]||card.card}: ${number(card.players)} players own this card`));progress.append(owned,text('p','Exact deaths, exits, run duration distributions and retention need dedicated run-outcome records. Current data cannot answer those reliably.','controlNote'));content.append(progress);
 }
 async function refreshData():Promise<void>{refresh.disabled=true;download.disabled=true;days.disabled=build.disabled=true;status.textContent='Loading owner analytics…';content.setAttribute('aria-busy','true');
  try{const data=await load(Number(days.value),build.value||null);snapshot=data;
   const selected=build.value;build.replaceChildren(new Option('All reported versions',''));for(const version of data.builds)build.append(new Option(version,version));if(selected&&!data.builds.includes(selected))build.append(new Option(selected,selected));build.value=selected;
   render(data);status.textContent=`Snapshot updated ${new Date(data.generated_at).toUTCString()}.`;download.disabled=false;
  }catch{snapshot=null;content.replaceChildren(text('p','Analytics could not be loaded. Check your connection and owner access, then refresh.','controlEmpty'));status.textContent='Analytics unavailable. No figures are shown from an earlier snapshot.';}
  finally{refresh.disabled=false;days.disabled=build.disabled=false;content.removeAttribute('aria-busy');}}
 form.onsubmit=e=>{e.preventDefault();void refreshData();};days.onchange=build.onchange=()=>void refreshData();
 download.onclick=()=>{if(!snapshot)return;const blob=new Blob([JSON.stringify({...snapshot,notes:['FPS is weighted by captured duration. Timing averages use observation/frame counts.','Action associations are not causal conclusions.','Progression is lifetime saved progress for consenting players; report filters do not apply.','No live online count, GPU timing, phone temperature or reliable run outcome measurement.']},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`island-outbreak-summary-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 void refreshData();
}
