/**
 * Arena lobby entry — self-binds to DOM buttons so main.ts only needs one import side-effect.
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

export function wireArenaLobby(): void {
  if (wired) return;
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

// Auto-wire when module loads (after DOM ready)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => wireArenaLobby());
} else {
  setTimeout(() => wireArenaLobby(), 0);
}
