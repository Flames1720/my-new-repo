/** First-run guidance advances from observed gameplay, never from a timer. */
export class FirstRunTutorial {
  active = false;
  private step = 0;
  private x = 0; private z = 0; private yaw = 0; private ammo = 0;
  private reloadSeen = false;
  private highlighted: Element | null = null;
  private panel = document.createElement('section');
  constructor(private touch: boolean, private complete: () => void) {
    this.panel.className = 'first-run-tutorial';
    this.panel.setAttribute('aria-live', 'polite');
    this.panel.hidden = true;
    document.body.append(this.panel);
  }
  start(x: number, z: number, yaw: number, ammo: number) {
    this.active = true; this.step = 0; this.x = x; this.z = z; this.yaw = yaw; this.ammo = ammo; this.reloadSeen = false; this.draw();
  }
  stop() { this.active = false; this.panel.hidden = true; this.highlighted?.classList.remove('tutorial-highlight'); this.highlighted = null; }
  observe(x: number, z: number, yaw: number, aiming: boolean, ammo: number, reloading: boolean) {
    if (!this.active) return;
    const moved = Math.hypot(x - this.x, z - this.z) >= 2;
    const turned = Math.abs(Math.atan2(Math.sin(yaw - this.yaw), Math.cos(yaw - this.yaw))) >= 0.3;
    if (this.step === 4 && reloading) this.reloadSeen = true;
    if ((this.step === 0 && moved) || (this.step === 1 && turned) || (this.step === 2 && aiming) || (this.step === 3 && ammo < this.ammo) || (this.step === 4 && this.reloadSeen && !reloading && ammo > this.ammo)) {
      this.step++; this.x = x; this.z = z; this.yaw = yaw; this.ammo = ammo; this.draw();
    }
  }
  cardUsed() { if (this.active && this.step === 5) { this.step++; this.draw(); } }
  private draw() {
    this.highlighted?.classList.remove('tutorial-highlight');
    const steps = [
      ['Move', this.touch ? 'Drag on the left side to walk a few steps.' : 'Use WASD to walk a few steps.', '#leftMoveZone'],
      ['Look around', this.touch ? 'Swipe on the right side to turn your view.' : 'Move your mouse to turn your view.', '#lookZone'],
      ['Aim', this.touch ? 'Tap ADS with the two-thumb layout. Other layouts use hold to aim.' : 'Hold the right mouse button to aim.', '#aimBtn'],
      ['Fire', this.touch ? 'Hold FIRE. You can drag it to aim while shooting.' : 'Click the left mouse button to shoot.', '#shootBtn'],
      ['Reload', this.touch ? 'Tap RELOAD and wait for the magazine to refill.' : 'Press R and wait for the magazine to refill.', '#reloadBtn'],
      ['Use a field card', 'Tap one of your field cards below. Pulse holds enemies back; Medic heals over time.', '#wildcardBtn1'],
      ['Ready to survive', 'The map shows your sanctuary. Its green barrier protects you while it holds. Leave it to fight. Empty guns reload when you try to fire.', '#minimapContainer'],
    ];
    const [title, text, selector] = steps[this.step];
    this.panel.hidden = false;
    this.panel.replaceChildren();
    const label = document.createElement('small'); label.textContent = `PRACTICE · ${this.step + 1} / ${steps.length} · NO ENEMIES`;
    const heading = document.createElement('strong'); heading.textContent = title;
    const instruction = document.createElement('p'); instruction.textContent = text;
    this.panel.append(label, heading, instruction);
    this.highlighted = document.querySelector(selector); this.highlighted?.classList.add('tutorial-highlight');
    if (this.step === 6) { const button = document.createElement('button'); button.textContent = 'START MY FIRST WAVE'; button.onclick = () => { this.stop(); this.complete(); }; this.panel.append(button); }
  }
}
