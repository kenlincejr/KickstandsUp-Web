// The planner's floating disc rail, bound to a route-leg editor.
//
// This is presentation only: every disc calls an action the editor already
// exposes and the existing list controls already invoke. START/FINISH arm
// map placement for the origin/destination exactly as the "Place S on map"
// recovery button does; STOP/RIDE THRU call `addIntermediate`, which already
// arms placement for the point it inserts. Nothing new reaches the server.
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
          label: 'Add a stop, then click the map to place it',
          onPress: () => editor.actions.addIntermediate('stop'),
        },
        {
          id: 'via',
          caption: 'Ride thru',
          glyph: <RoadGlyph />,
          tone: 'moss',
          active: armedPoint?.kind === 'via',
          disabled: disabled || atCap,
          label: 'Add a ride-through road, then click the map to place it',
          onPress: () => editor.actions.addIntermediate('via'),
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
