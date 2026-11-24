// A decision push or a changed request tells any open regularization screen to reload.
type Listener = () => void;
const listeners = new Set<Listener>();

export function onRegularizationChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitRegularizationChanged(): void {
  listeners.forEach((l) => l());
}
