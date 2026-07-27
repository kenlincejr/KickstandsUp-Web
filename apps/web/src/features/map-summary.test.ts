import { describe, expect, it } from 'vitest';
import { mapSummaryLine } from './map-summary';

const base = { pointCount: 2, placedCount: 0, previewStale: false, routing: false };

describe('mapSummaryLine', () => {
  it('prompts instead of counting when nothing is placed yet', () => {
    // A fresh draft already holds two blank endpoints, so "2 points" would be
    // a lie about progress — the rider has placed nothing.
    expect(mapSummaryLine(base)).toBe('Choose Start, then click the map to begin');
  });

  it('reads like the device bar once a route is previewed', () => {
    expect(mapSummaryLine({
      pointCount: 5, placedCount: 5, distanceMeters: 86_900, durationSeconds: 3_660, previewStale: false, routing: false,
    })).toBe('Itinerary · 5 points · 54 mi · 1h 1m');
  });

  it('drops the sub-hour "0h" the way the device does', () => {
    expect(mapSummaryLine({
      pointCount: 2, placedCount: 2, distanceMeters: 32_000, durationSeconds: 2_880, previewStale: false, routing: false,
    })).toBe('Itinerary · 2 points · 20 mi · 48m');
  });

  it('withholds stale numbers rather than showing a distance the route no longer has', () => {
    const line = mapSummaryLine({
      pointCount: 5, placedCount: 5, distanceMeters: 86_900, durationSeconds: 3_660, previewStale: true, routing: false,
    });
    expect(line).toBe('Itinerary · 5 points · not updated');
    expect(line).not.toContain('54 mi');
  });

  it('says routing while a preview is in flight, and outranks stale', () => {
    expect(mapSummaryLine({ ...base, pointCount: 3, placedCount: 3, previewStale: true, routing: true }))
      .toBe('Itinerary · 3 points · routing…');
  });

  it('asks for a preview when points are placed but never measured', () => {
    expect(mapSummaryLine({ ...base, pointCount: 3, placedCount: 2 }))
      .toBe('Itinerary · 3 points · preview for distance');
  });

  it('singularizes one point', () => {
    expect(mapSummaryLine({ ...base, pointCount: 1, placedCount: 1 })).toBe('Itinerary · 1 point · preview for distance');
  });
});
