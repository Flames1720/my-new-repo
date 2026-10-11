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
