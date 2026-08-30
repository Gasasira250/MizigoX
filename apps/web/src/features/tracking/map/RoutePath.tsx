import type { MapPathPoint } from './types';
import { formatCoordinates } from '../format';

export function RoutePathSummary({ path }: { path: MapPathPoint[] }) {
  if (path.length === 0) {
    return <p className="text-sm text-slate-500">No recorded path points yet.</p>;
  }
  return (
    <p className="text-sm text-slate-600">
      Path: {path.length} authenticated points from{' '}
      {formatCoordinates(path[0]!.latitude, path[0]!.longitude)} to{' '}
      {formatCoordinates(path[path.length - 1]!.latitude, path[path.length - 1]!.longitude)}.
    </p>
  );
}
