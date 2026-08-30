import type { VehicleLocationPayload } from '@mizigox/shared';

type Listener = (payload: VehicleLocationPayload) => void;

const listeners = new Set<Listener>();

export function subscribeTracking(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishVehicleLocation(payload: VehicleLocationPayload) {
  for (const listener of listeners) {
    listener(payload);
  }
}
