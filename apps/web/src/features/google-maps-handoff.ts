import type { RouteWaypoint } from './route-library-repository';

export const portableIntermediateLimit = 3;

export type GoogleMapsHandoff = {
  url: string;
  segmentNumber: number;
  segmentCount: number;
  startLabel: string;
  endLabel: string;
  nextLegLabel: string | null;
  fidelityWarning: string | null;
  browserWaypointWarning: string;
};

function coordinate(point: RouteWaypoint) {
  return `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`;
}

function segmentUrl(points: RouteWaypoint[]) {
  const parameters = new URLSearchParams({
    api: '1',
    origin: coordinate(points[0]),
    destination: coordinate(points.at(-1)!),
    travelmode: 'driving',
    dir_action: 'navigate',
  });
  const intermediates = points.slice(1, -1);
  if (intermediates.length) parameters.set('waypoints', intermediates.map(coordinate).join('|'));
  return `https://www.google.com/maps/dir/?${parameters.toString()}`;
}

export function buildGoogleMapsHandoffs(points: RouteWaypoint[], intermediateLimit = portableIntermediateLimit) {
  if (points.length < 2) return [];
  const maximumLocations = Math.max(2, intermediateLimit + 2);
  const segments: RouteWaypoint[][] = [];
  let start = 0;
  while (start < points.length - 1) {
    const windowEnd = Math.min(points.length, start + maximumLocations);
    // Prefer ending a leg at a real stop so riders are never navigated to a
    // pass-through shaping point; fall back to the count boundary when the
    // window holds no stop. Mirrors the mobile app's segmentation.
    let boundary = windowEnd - 1;
    if (windowEnd < points.length && points[boundary].kind === 'via') {
      for (let index = boundary - 1; index > start; index -= 1) {
        if (points[index].kind !== 'via') { boundary = index; break; }
      }
    }
    segments.push(points.slice(start, boundary + 1));
    start = boundary;
  }
  return segments.map((segment, index): GoogleMapsHandoff => {
    const shapingIndex = segment.findIndex((point, pointIndex) => pointIndex > 0 && pointIndex < segment.length - 1 && point.kind === 'via');
    const shapingPoint = shapingIndex >= 0 ? segment[shapingIndex] : null;
    return {
      url: segmentUrl(segment),
      segmentNumber: index + 1,
      segmentCount: segments.length,
      startLabel: segment[0].displayName,
      endLabel: segment.at(-1)!.displayName,
      // The next leg starts at this segment's boundary stop. Showing that
      // boundary is more useful than showing the next leg's distant finish.
      nextLegLabel: index < segments.length - 1 ? segment.at(-1)!.displayName : null,
      fidelityWarning: shapingPoint ? `Google Maps may choose a different road after ${shapingPoint.displayName}. Add another Ride through point if this stretch matters.` : null,
      browserWaypointWarning: 'This link may open with fewer stops in a mobile browser. Open in the Google Maps app for the full leg.',
    };
  });
}
