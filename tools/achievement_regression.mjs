import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../src/achievements.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {ACHIEVEMENTS,eligibleAchievements,achievementValue}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const empty={bestRunKills:0,bestClearedWave:0,totalBossKills:0,lifetimeMeters:0,closeCall:false};
let checks=0;
for(const goal of ACHIEVEMENTS){
 const before={...empty,[goal.metric]:goal.metric==='closeCall'?false:goal.target-1};
 assert(!eligibleAchievements(before,[]).some(g=>g.id===goal.id));checks++;
 const reached={...empty,[goal.metric]:goal.metric==='closeCall'?true:goal.target};
 assert(eligibleAchievements(reached,[]).some(g=>g.id===goal.id));checks++;
 assert(!eligibleAchievements(reached,[goal.id]).some(g=>g.id===goal.id));checks++;
 assert(!('card' in goal));checks++;
 assert.equal(achievementValue(goal,{...empty,[goal.metric]:NaN}),0);checks++;
}
assert(!eligibleAchievements({...empty,bestClearedWave:2},[]).some(g=>g.id==='three-waves'));checks++;
console.log(`${checks} achievement threshold, duplicate reward and XP-only checks passed`);
