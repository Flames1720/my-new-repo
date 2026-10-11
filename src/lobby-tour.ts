/** A lightweight tour of the real lobby; it never changes purchases or loadouts. */
export class LobbyTour {
  active = false;
  private step = 0;
  private overlay = document.createElement('div');
  private spotlight = document.createElement('div');
  private panel = document.createElement('section');
  private previousFocus: HTMLElement | null = null;
  private originalInert = false;
  private steps = [
    { page: 'mission', target: '#startRunBtn', title: 'Deploy to the island', text: 'DEPLOY starts your run. Your first run begins with safe control practice before the waves. Survive as many waves as you can.' },
    { page: 'kit', target: '[data-lobby-page="kit"]', title: 'Choose your weapon', text: 'FIELD KIT lets you choose your starting weapon: a steady pistol, close-range shotgun, or automatic rifle. Select one before deploying.' },
    { page: 'wildcards', target: '[data-lobby-page="wildcards"]', title: 'Equip cards · spend XP', text: 'Pulse and Medic are your starter cards. Equip cards here to use them during a run. Earn XP from kills, cleared waves and achievements. New cards cost XP: check each price before buying. Upgrades spend the same XP balance.' },
    { page: 'mission', target: '#lobbyOptionsBtn', title: 'Make the controls yours', text: 'SETTINGS → Camera & Controls lets you customize your HUD. Two thumbs is the default. You can replay this lobby tour or the control practice there at any time.' },
  ];
  constructor(private lobby: HTMLElement, private showPage: (page: string) => void, private complete: () => void) {
    this.overlay.className = 'lobby-tour'; this.overlay.hidden = true;
    this.spotlight.className = 'lobby-tour-spotlight'; this.spotlight.setAttribute('aria-hidden', 'true');
    this.panel.className = 'lobby-tour-panel'; this.panel.setAttribute('role', 'dialog'); this.panel.setAttribute('aria-modal', 'true'); this.panel.setAttribute('aria-labelledby', 'lobbyTourTitle'); this.panel.setAttribute('aria-describedby', 'lobbyTourDescription');
    this.overlay.append(this.spotlight, this.panel); document.body.append(this.overlay);
    window.addEventListener('resize', () => { if (this.active) this.position(); });
    this.overlay.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key !== 'Tab') return;
      const buttons = Array.from(this.panel.querySelectorAll<HTMLButtonElement>('button'));
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      event.preventDefault(); buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
    });
  }
  start() {
    if (this.active) return;
    this.active = true; document.body.classList.add('lobby-tour-active'); this.step = 0; this.previousFocus = document.activeElement as HTMLElement;
    this.originalInert = this.lobby.inert; this.lobby.inert = true;
    this.overlay.hidden = false; this.draw();
  }
  private finish() {
    this.active = false; document.body.classList.remove('lobby-tour-active'); this.overlay.hidden = true; this.lobby.inert = this.originalInert;
    this.showPage('mission'); this.complete();
    (this.previousFocus?.isConnected ? this.previousFocus : this.lobby.querySelector<HTMLElement>('#startRunBtn'))?.focus();
  }
  private draw() {
    const step = this.steps[this.step]; this.showPage(step.page);
    this.panel.replaceChildren();
    const label = document.createElement('small'); label.textContent = `LOBBY TOUR · ${this.step + 1} / ${this.steps.length}`;
    const title = document.createElement('h2'); title.id = 'lobbyTourTitle'; title.textContent = step.title; title.tabIndex = -1;
    const copy = document.createElement('p'); copy.id = 'lobbyTourDescription'; copy.textContent = step.text;
    const actions = document.createElement('div'); actions.className = 'lobby-tour-actions';
    if (this.step > 0) { const back = document.createElement('button'); back.textContent = 'BACK'; back.onclick = () => { this.step--; this.draw(); }; actions.append(back); }
    const next = document.createElement('button'); next.textContent = this.step === this.steps.length - 1 ? 'FINISH TOUR' : 'NEXT';
    next.onclick = () => { if (this.step === this.steps.length - 1) this.finish(); else { this.step++; this.draw(); } };
    actions.append(next); this.panel.append(label, title, copy, actions); this.position(); title.focus();
  }
  private position() {
    const target = this.lobby.querySelector<HTMLElement>(this.steps[this.step].target);
    if (!target) return;
    target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    const rect = target.getBoundingClientRect();
    Object.assign(this.spotlight.style, { left: `${rect.left - 4}px`, top: `${rect.top - 4}px`, width: `${rect.width + 8}px`, height: `${rect.height + 8}px` });
    this.panel.classList.toggle('dock-top', rect.top > window.innerHeight / 2);
  }
}
