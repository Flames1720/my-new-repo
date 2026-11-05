/**
 * Arena lobby entry — injects ARENA tab + panel and wires solo / create / join.
 * Loaded from index.html as a module; does not require editing main.ts.
 */
import { ArenaMode } from './arena-mode';

let arenaMode: ArenaMode | null = null;
let wired = false;

function getArena(): ArenaMode {
  if (!arenaMode) {
    arenaMode = new ArenaMode();
    arenaMode.onExit = () => {
      document.querySelector('#survivalLobby')?.classList.add('show');
      const status = document.querySelector('#arenaRoomStatus') as HTMLElement | null;
      if (status) status.textContent = 'Ready · left arena';
    };
  }
  return arenaMode;
}

function ensureArenaLobbyUI(): void {
  const nav = document.querySelector('.lobbyNav');
  if (nav && !nav.querySelector('[data-lobby-page="arena"]')) {
    const missionBtn = nav.querySelector('[data-lobby-page="mission"]');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.lobbyPage = 'arena';
    btn.textContent = 'ARENA';
    if (missionBtn?.nextSibling) missionBtn.parentElement?.insertBefore(btn, missionBtn.nextSibling);
    else nav.appendChild(btn);
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-lobby-page]').forEach((b) => {
        b.classList.toggle('active', b === btn);
        (b as HTMLElement).removeAttribute('aria-current');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-current', 'page');
      document.querySelectorAll('[data-lobby-panel]').forEach((p) => {
        p.classList.toggle('active', (p as HTMLElement).dataset.lobbyPanel === 'arena');
      });
    });
  }

  if (document.querySelector('[data-lobby-panel="arena"]')) return;

  const stage = document.querySelector('.lobbyStage');
  if (!stage) return;

  const section = document.createElement('section');
  section.className = 'lobbyHero lobbyPage';
  section.dataset.lobbyPanel = 'arena';
  section.setAttribute('aria-label', 'Arena FPS');
  section.innerHTML = `
    <div class="missionDetails" style="max-width:560px">
      <p class="lobbyEyebrow"><span>02</span> · MULTIPLAYER ARENA</p>
      <h1>ARENA<br><em>FPS</em></h1>
      <p class="lobbyTagline">TIGHT MAP · BOTS OR FRIENDS<br><strong>Play solo or create a room for friends anywhere.</strong></p>
      <div class="lobbyQuickStats" aria-label="Arena parameters">
        <div><strong>8</strong><span>MAX PLAYERS</span></div>
        <div><strong>BOTS</strong><span>SOLO MODE</span></div>
        <div><strong>FAST</strong><span>LIGHT MAP</span></div>
      </div>
      <div id="arenaRoomPanel" style="margin-top:18px;display:grid;gap:10px">
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
          <button id="arenaSoloBtn" type="button">PLAY SOLO (BOTS)</button>
          <button id="arenaCreateRoomBtn" type="button">CREATE ROOM</button>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
          <input id="arenaJoinCode" type="text" maxlength="8" placeholder="ROOM CODE" aria-label="Room code"
            style="text-transform:uppercase;letter-spacing:.12em;padding:10px 12px;border:1px solid #456351;background:#0d1614;color:#edf3eb;border-radius:4px;width:140px;font-weight:800" />
          <button id="arenaJoinRoomBtn" type="button">JOIN ROOM</button>
        </div>
        <p id="arenaRoomStatus" role="status" style="margin:0;color:#83bd95;font-size:12px;letter-spacing:.06em">Ready · no room yet</p>
        <p style="margin:0;color:#819087;font-size:11px;line-height:1.45">Friends open the same game link, enter your room code, and join from any location.</p>
      </div>
    </div>`;
  stage.appendChild(section);
}

export function wireArenaLobby(): void {
  if (wired) return;
  ensureArenaLobbyUI();
  wired = true;

  const solo = document.querySelector('#arenaSoloBtn') as HTMLButtonElement | null;
  const createBtn = document.querySelector('#arenaCreateRoomBtn') as HTMLButtonElement | null;
  const joinBtn = document.querySelector('#arenaJoinRoomBtn') as HTMLButtonElement | null;
  const codeInput = document.querySelector('#arenaJoinCode') as HTMLInputElement | null;
  const status = document.querySelector('#arenaRoomStatus') as HTMLElement | null;
  const lobby = document.querySelector('#survivalLobby');

  solo?.addEventListener('click', () => {
    lobby?.classList.remove('show');
    getArena().startSolo(5);
  });

  createBtn?.addEventListener('click', async () => {
    if (status) status.textContent = 'Creating room…';
    lobby?.classList.remove('show');
    const code = await getArena().startCreateRoom('Player');
    if (status) status.textContent = code ? `Room ${code} · share with friends` : 'Create failed (check Supabase)';
  });

  joinBtn?.addEventListener('click', async () => {
    const code = (codeInput?.value || '').trim();
    if (!code) {
      if (status) status.textContent = 'Enter a room code first';
      return;
    }
    if (status) status.textContent = `Joining ${code.toUpperCase()}…`;
    lobby?.classList.remove('show');
    const ok = await getArena().startJoinRoom(code);
    if (status) status.textContent = ok ? `Joined ${code.toUpperCase()}` : 'Join failed';
  });
}

function boot() {
  let tries = 0;
  const tick = () => {
    tries++;
    if (document.querySelector('.lobbyNav') || document.querySelector('#survivalLobby')) {
      wireArenaLobby();
      return;
    }
    if (tries < 40) setTimeout(tick, 250);
  };
  tick();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
