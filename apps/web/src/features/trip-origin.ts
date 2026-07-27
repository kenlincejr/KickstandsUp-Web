// Web port of tripLegOrigin (KickstandsUp/src/features/rides/trip-legs.ts).
// Where a day's ride starts from: day 1 leaves the ride's staging spot; every
// later day leaves the place the previous day finished — the last kind:'stop'
// with finite coordinates, walking backwards and skipping vias and rest days.
// Kept byte-compatible with the device via the shared fixture in
// trip-origin.test.ts; the two surfaces must resolve identical origins or the
// web shows one trip and the device navigates another.

type OriginStop = {
  kind?: 'stop' | 'via';
  latitude?: number;
  longitude?: number;
};

export function tripLegOrigin(
  legs: ReadonlyArray<{ stops: readonly OriginStop[] }>,
  index: number,
  stagingOrigin: { latitude: number; longitude: number } | null,
): { latitude: number; longitude: number } | null {
  for (let previous = index - 1; previous >= 0; previous -= 1) {
    const finish = [...legs[previous].stops].reverse().find(
      (stop) => (stop.kind ?? 'stop') === 'stop' && Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude),
    );
    if (finish) return { latitude: finish.latitude as number, longitude: finish.longitude as number };
  }
  return stagingOrigin;
}
