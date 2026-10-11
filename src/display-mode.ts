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
