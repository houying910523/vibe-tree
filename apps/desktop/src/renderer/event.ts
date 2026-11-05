export enum EventType {
  NEW_WORKTREE = 'vibetree:new-worktree',
  TOGGLE_VIEW = 'vibetree:toggle-view'
}

export function onEvent<K extends string>(
  eventType: K,
  eventHandler: (event: K extends keyof WindowEventMap ? WindowEventMap[K] : Event) => void
): () => void {
  const handler = eventHandler as EventListener;
  window.addEventListener(eventType, handler, true);
  return () => window.removeEventListener(eventType, handler, true);
}
