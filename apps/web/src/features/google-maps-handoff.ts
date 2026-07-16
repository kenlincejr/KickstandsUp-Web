import type { RouteWaypoint } from './route-library-repository';

export const portableIntermediateLimit = 3;

export type GoogleMapsHandoff = {
  url: string;
  segmentNumber: number;
  segmentCount: number;
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
    const end = Math.min(points.length, start + maximumLocations);
    segments.push(points.slice(start, end));
    start = end - 1;
  }
  return segments.map((segment, index): GoogleMapsHandoff => ({
    url: segmentUrl(segment),
    segmentNumber: index + 1,
    segmentCount: segments.length,
  }));
}
