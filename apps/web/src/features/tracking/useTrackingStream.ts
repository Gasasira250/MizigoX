import type { VehicleLocationPayload } from '@mizigox/shared';
import { useEffect } from 'react';
import { getAccessToken } from '../../shared/api/client';

export function useTrackingStream(
  enabled: boolean,
  onLocation: (payload: VehicleLocationPayload) => void,
) {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const controller = new AbortController();
    let buffer = '';

    async function connect() {
      const token = getAccessToken();
      const response = await fetch('/api/v1/tracking/stream', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: 'include',
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';
        for (const chunk of chunks) {
          const dataLine = chunk.split('\n').find((line) => line.startsWith('data: '));
          if (!dataLine) {
            continue;
          }
          try {
            onLocation(JSON.parse(dataLine.slice(6)) as VehicleLocationPayload);
          } catch {
            // ignore malformed frames
          }
        }
      }
    }

    void connect().catch(() => undefined);
    return () => controller.abort();
  }, [enabled, onLocation]);
}
