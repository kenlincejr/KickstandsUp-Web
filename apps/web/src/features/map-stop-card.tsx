// The card that appears over the map when a stop is selected.
//
// The device makes a rider leave the map for this: stop purpose lives only in
// the itinerary's WaypointCard (KickstandsUp route-planner-screen.tsx:980), so
// tagging a stop "food" means switching focus out of the map, finding the row,
// and opening a dropdown. The owner's complaint about "bouncing back out to the
// itinerary every time" is exactly that trip.
//
// So this surface is deliberately AHEAD of the device rather than a port of it:
// the name and the purpose both live where the rider is already looking. The
// device should follow, not the other way round.
//
// Presentation only — every control calls an editor action that already exists.
import { StampChip } from '../design/day-kit';
import { routePointIdentity } from './route-point-identity';
import type { DraftPoint } from './route-leg-editor-core';
import type { StopLabel } from './trip-stop-projection';

/** The five the device ships (src/features/rides/stop-projection.ts:102-110).
 *  Adding a sixth here silently breaks the round-trip: the wire parser drops
 *  unknown values, so a web-only label would vanish on the rider's phone. */
const STOP_LABELS: readonly { value: StopLabel; label: string }[] = [
  { value: 'gas', label: 'Gas' },
  { value: 'food', label: 'Food' },
  { value: 'scenic', label: 'Scenic' },
  { value: 'meetup', label: 'Meetup' },
  { value: 'break', label: 'Break' },
];

export function MapStopCard({ point, points, index, onSetLabels, onRemove, onDismiss, editable, canLabel }: {
  point: DraftPoint;
  points: readonly DraftPoint[];
  index: number;
  onSetLabels: (labels: StopLabel[]) => void;
  onRemove: () => void;
  onDismiss: () => void;
  editable: boolean;
  /**
   * Only the TRIP wire persists stop purpose. `PlannerWaypoint` has no
   * stopLabels field and a saved route revision cannot round-trip one, so the
   * standalone planner must NOT offer the picker — it would appear to work and
   * then vanish on reload, which is worse than not having it.
   */
  canLabel: boolean;
}) {
  const identity = routePointIdentity(points, index);
  const selected = point.stopLabels ?? [];
  const isIntermediate = point.kind === 'stop' || point.kind === 'via';

  const toggle = (value: StopLabel) => {
    onSetLabels(selected.includes(value) ? selected.filter((label) => label !== value) : [...selected, value]);
  };

  return (
    <div aria-label={`${identity.token} details`} className="ksu-map-stop-card" role="group">
      <div className="ksu-map-stop-card-head">
        <StampChip label={identity.token} tone={point.kind === 'via' ? 'moss' : 'rust'} />
        <div className="ksu-map-stop-card-name">
          <strong>{point.displayName.trim() || 'Click the map to place this point'}</strong>
          <small>{identity.purpose}</small>
        </div>
        <button aria-label="Close" className="ksu-map-stop-card-close" onClick={onDismiss} type="button">×</button>
      </div>

      {/* Vias are roads the group rides through, not places it pulls over, so
          they get no purpose picker — same rule the device and the wire use. */}
      {canLabel && point.kind === 'stop' ? (
        <fieldset className="ksu-map-stop-card-labels" disabled={!editable}>
          <legend>Why stop here?</legend>
          {STOP_LABELS.map(({ value, label }) => (
            <label className={selected.includes(value) ? 'selected' : undefined} key={value}>
              <input checked={selected.includes(value)} onChange={() => toggle(value)} type="checkbox" value={value} />
              {label}
            </label>
          ))}
        </fieldset>
      ) : null}

      {editable && isIntermediate ? (
        <button className="ksu-map-stop-card-remove" onClick={onRemove} type="button">Remove this point</button>
      ) : null}
    </div>
  );
}
