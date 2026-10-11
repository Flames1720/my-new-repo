export type AchievementProgress = {
  bestRunKills: number; bestClearedWave: number; totalBossKills: number;
  lifetimeMeters: number; closeCall: boolean;
};
export type AchievementDefinition = {
  id: string; name: string; description: string; metric: keyof AchievementProgress;
  target: number; xp: number;
};
export const ACHIEVEMENTS: AchievementDefinition[] = [
  { id:'first-ten', name:'FIRST TEN', description:'Eliminate 10 infected in a single run.', metric:'bestRunKills', target:10, xp:40 },
  { id:'three-waves', name:'FIND YOUR FEET', description:'Clear wave 3 in a single run.', metric:'bestClearedWave', target:3, xp:50 },
  { id:'five-waves', name:'HOLD THE LINE', description:'Clear wave 5 in a single run.', metric:'bestClearedWave', target:5, xp:75 },
  { id:'ten-waves', name:'ISLAND VETERAN', description:'Clear wave 10 in a single run.', metric:'bestClearedWave', target:10, xp:100 },
  { id:'boss-hunter', name:'BOSS HUNTER', description:'Defeat 3 bosses across your runs.', metric:'totalBossKills', target:3, xp:125 },
  { id:'long-road', name:'THE LONG ROAD', description:'Travel 1,000 metres on land across your runs.', metric:'lifetimeMeters', target:1000, xp:75 },
  { id:'close-call', name:'CLOSE CALL', description:'Drop to 15 HP or less, then clear that wave alive.', metric:'closeCall', target:1, xp:100 },
  { id:'island-secured', name:'ISLAND SECURED', description:'Clear all 100 waves in one run.', metric:'bestClearedWave', target:100, xp:250 },
];
export function achievementValue(definition: AchievementDefinition, progress: AchievementProgress): number {
  const value = Number(progress[definition.metric]);
  return Number.isFinite(value) ? Math.max(0, Math.min(definition.target, value)) : 0;
}
export function eligibleAchievements(progress: AchievementProgress, earned: readonly string[]): AchievementDefinition[] {
  return ACHIEVEMENTS.filter(definition => !earned.includes(definition.id) && achievementValue(definition, progress) >= definition.target);
}
