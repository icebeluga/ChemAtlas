// Keep browser PDF caches out of the next login session.
const cleanup = new Set<() => void>();
export function onContentClear(callback: () => void) {
  cleanup.add(callback);
  return () => { cleanup.delete(callback); };
}
export function clearContent() {
  for (const callback of cleanup) callback();
}
