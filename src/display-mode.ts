/** Fullscreen requires a completed touch gesture on Android, unlike combat controls. */
export function bindFullscreenAction(button: HTMLElement, activate: () => void): void {
  for (const event of ['pointerdown','pointerup','pointercancel']) button.addEventListener(event, e => e.stopPropagation());
  button.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); activate(); });
  button.style.touchAction = 'manipulation';
}
export function requestNativeFullscreen(target: HTMLElement): Promise<void> {
  if (target.requestFullscreen) return target.requestFullscreen({navigationUI:'hide'});
  const legacy = (target as HTMLElement & {webkitRequestFullscreen?: () => Promise<void> | void}).webkitRequestFullscreen;
  if (legacy) return Promise.resolve(legacy.call(target));
  return Promise.reject(new Error('Fullscreen is not supported in this browser.'));
}

/** iPhone Safari may expose no fullscreen API for arbitrary HTML elements. */
export function supportsNativeFullscreen(target: HTMLElement): boolean {
  const doc = target.ownerDocument as Document & {webkitFullscreenEnabled?: boolean};
  const legacy = target as HTMLElement & {webkitRequestFullscreen?: unknown};
  return (!!target.requestFullscreen && doc.fullscreenEnabled !== false)
    || (typeof legacy.webkitRequestFullscreen === 'function' && doc.webkitFullscreenEnabled !== false);
}

/** Guidance only: fullscreen capability remains the source of truth. */
export function browserDisplayGuidance(): string {
  const ua = navigator.userAgent;
  const safari = /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|OPiOS|Android/i.test(ua);
  const appleTouch = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (safari && appleTouch) return 'Safari: open the page menu beside the address bar and choose Hide Toolbar if available. For a standalone view, choose Share → Add to Home Screen, then open the game from that icon. Menu names vary by iOS version.';
  return 'Browser controls may remain visible. On mobile, scrolling may collapse the toolbar; use your browser’s Hide Toolbar option if available. For a standalone view, use Add to Home Screen or Install from the browser menu if offered. On desktop, use your browser’s fullscreen menu.';
}
