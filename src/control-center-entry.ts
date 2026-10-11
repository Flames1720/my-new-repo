import { initializePilot, pilot, fetchControlCenter, signOutPilot } from './pilot';
import { mountControlCenter } from './control-center';
import './control-center.css';
await initializePilot();
const root = document.querySelector<HTMLElement>('#controlCenter')!;
if (!pilot.enabled || !pilot.admin) {
  root.replaceChildren();
  const heading = document.createElement('h1'); heading.textContent = 'Owner access required';
  const text = document.createElement('p'); text.textContent = 'Sign in with the Island Outbreak owner account to view analytics.';
  const link = document.createElement('a'); link.href = '/'; link.textContent = 'Return to game';
  const logout=document.createElement('button');logout.textContent='SIGN OUT & SWITCH ACCOUNT';logout.onclick=async()=>{logout.disabled=true;try{await signOutPilot();}catch{text.textContent='Sign out failed. Check your connection and try again.';logout.disabled=false;}};
  root.append(heading,text,link,logout);
} else mountControlCenter(root, fetchControlCenter, signOutPilot);
