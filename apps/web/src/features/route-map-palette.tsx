// The planner's floating disc rail, bound to a route-leg editor.
//
// This is presentation only: every disc calls an action the editor already
// exposes and the existing list controls already invoke. START/FINISH arm
// map placement for the origin/destination exactly as the "Place S on map"
// recovery button does; STOP/RIDE THRU begin a placement CHAIN, staying armed
// across clicks the way the device rail does. Nothing new reaches the server.
//
// START/FINISH deliberately do NOT chain, matching the device: a route has one
// of each, so re-arming after placing one would be a mistake waiting to happen.
// They also never need to mint — `createRouteLegDraft`/`legToDay` always seed a
// blank origin and destination, and neither can be removed (the list's × only
// renders for intermediates), so `origin`/`destination` are always present.
import { ControlPalette, ClearGlyph, FinishGlyph, RoadGlyph, StartGlyph, StopGlyph } from '../design/control-language';
import { isRoutePointComplete } from './route-point-identity';
import type { RouteLegEditorApi } from './use-route-leg-editor';

export function RouteMapPalette({ editor, disabled, onClear, clearLabel = 'Clear' }: {
  editor: RouteLegEditorApi;
  disabled?: boolean;
  /** Supplied only where a clear-all already exists on the page. */
  onClear?: () => void;
  clearLabel?: string;
}) {
  const points = editor.draft.points;
  const origin = points[0];
  const destination = points.length > 1 ? points[points.length - 1] : undefined;
  const armed = editor.activePlacementPointId;
  const armedPoint = armed ? points.find((point) => point.id === armed) : undefined;
  const atCap = points.length >= editor.maxPoints;

  const arm = (pointId: string) => {
    editor.actions.setSelectedPointId(pointId);
    editor.actions.setSearchingPointId(null);
    editor.actions.setActivePlacementPointId(armed === pointId ? null : pointId);
  };

  return (
    <ControlPalette
      items={[
        {
          id: 'start',
          caption: 'Start',
          glyph: <StartGlyph />,
          tone: 'ink',
          active: Boolean(origin && armed === origin.id),
          done: Boolean(origin && isRoutePointComplete(origin)),
          disabled: disabled || !origin,
          label: origin && isRoutePointComplete(origin) ? 'Move the start by clicking the map' : 'Set the start by clicking the map',
          onPress: () => origin && arm(origin.id),
        },
        {
          id: 'stop',
          caption: 'Stop',
          glyph: <StopGlyph />,
          tone: 'rust',
          active: armedPoint?.kind === 'stop',
          disabled: disabled || atCap,
          // Chained: stays lit so the rider keeps clicking the map to lay stops,
          // instead of returning to the rail between every one.
          label: editor.chainKind === 'stop' ? 'Click the map for each stop — click Stop again when done' : 'Add stops by clicking the map',
          onPress: () => editor.actions.beginChain('stop'),
        },
        {
          id: 'via',
          caption: 'Ride thru',
          glyph: <RoadGlyph />,
          tone: 'moss',
          active: armedPoint?.kind === 'via',
          disabled: disabled || atCap,
          label: editor.chainKind === 'via' ? 'Click the map for each road — click Ride thru again when done' : 'Add ride-through roads by clicking the map',
          onPress: () => editor.actions.beginChain('via'),
        },
        {
          id: 'finish',
          caption: 'Finish',
          glyph: <FinishGlyph />,
          tone: 'ink',
          active: Boolean(destination && armed === destination.id),
          done: Boolean(destination && isRoutePointComplete(destination)),
          disabled: disabled || !destination,
          label: destination && isRoutePointComplete(destination) ? 'Move the finish by clicking the map' : 'Set the finish by clicking the map',
          onPress: () => destination && arm(destination.id),
        },
      ]}
      quiet={onClear ? [{
        id: 'clear',
        caption: clearLabel,
        glyph: <ClearGlyph />,
        disabled,
        label: 'Clear this route and start over',
        onPress: onClear,
      }] : undefined}
    />
  );
}
