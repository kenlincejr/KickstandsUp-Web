// Presentational route-leg editor: the readiness checklist, the ordered stop
// list, and road preferences. Markup extracted from RoutePlannerPage unchanged;
// all state lives in useRouteLegEditor so the trip editor can mount one per day.
import { Fragment, type DragEvent, type ReactNode } from 'react';
import { Button, RibbonRule, Select, StampChip, Toggle } from '../design/day-kit';
import { isRoutePointComplete, routePointIdentity } from './route-point-identity';
import type { RouteLegEditorApi } from './use-route-leg-editor';

/** The app's rule: an option row becomes a proper dropdown, never a row of pills. */
const intermediateKindOptions = [
  { value: 'stop', label: 'Stop here — fuel, food, or regroup' },
  { value: 'via', label: 'Ride through — stay on this road' },
];

export function RouteLegEditor({ editor, roadPreferenceExtras }: { editor: RouteLegEditorApi; roadPreferenceExtras?: ReactNode }) {
  const { draft, actions, maxPoints, instanceId } = editor;
  const points = draft.points;
  const beginWaypointDrag = (event: DragEvent<HTMLButtonElement>, pointId: string) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', pointId);
    actions.setDraggingPointId(pointId);
  };

  return (
    <>
      <section className={`preview-readiness ${editor.previewReady ? 'ready' : ''}`} aria-live="polite">
        <RibbonRule label="Preview check" />
        <strong>{draft.previewStale ? 'Route changed after preview.' : editor.previewReady ? 'Ready to preview the road.' : 'Finish these before Preview route.'}</strong>
        <ul>
           {points.map((point, index) => {
             const identity = routePointIdentity(points, index);
             const complete = isRoutePointComplete(point);
             return <li key={point.id} className={complete ? 'complete' : ''}><StampChip label={complete ? 'Ready' : 'Needs a location'} tone={complete ? 'moss' : 'rust'} /> {identity.token} · {identity.purpose} <button onClick={() => complete ? actions.selectPoint(point.id) : (actions.selectPoint(point.id), actions.setActivePlacementPointId(point.id))} type="button">{complete ? `Select ${identity.token}` : `Place ${identity.token} on map`}</button></li>;
           })}
        </ul>
      </section>
      <ol className="planner-stop-list">
        {points.map((point, index) => <Fragment key={point.id}>
          <li id={`route-point-${instanceId}-${point.id}`} className={`${editor.draggingPointId === point.id ? 'waypoint-row dragging' : 'waypoint-row'} ${editor.selectedPointId === point.id ? 'selected' : ''}`} onClick={() => actions.selectPoint(point.id)} onDragOver={index > 0 && index < points.length - 1 ? (event) => event.preventDefault() : undefined} onDrop={index > 0 && index < points.length - 1 ? (event) => { event.preventDefault(); actions.reorderWaypoint(event.dataTransfer.getData('text/plain'), point.id); actions.setDraggingPointId(null); } : undefined}>
          <div className="stop-number">{routePointIdentity(points, index).token}</div>
          <div className="stop-editor" data-editor-instance={instanceId}>
            <label><span>{routePointIdentity(points, index).purpose.toUpperCase()}</span><input className="ksu-input" autoComplete="off" onChange={(event) => actions.updatePointQuery(point.id, event.target.value)} onFocus={() => { actions.setSearchingPointId(point.id); actions.setSelectedPointId(point.id); }} placeholder={point.kind === 'origin' ? 'Search starting place' : point.kind === 'destination' ? 'Search destination' : point.kind === 'stop' ? 'Search a stop' : 'Search a road to ride through'} value={point.displayName} /></label>
            {index > 0 && index < points.length - 1 ? (
              <Select
                hint={point.kind === 'stop' ? 'The group plans to pull over here.' : 'This holds the group to the road you picked.'}
                label={`${routePointIdentity(points, index).token} purpose`}
                onChange={(value) => actions.setIntermediateKind(point.id, value as 'stop' | 'via')}
                options={intermediateKindOptions}
                value={point.kind}
              />
            ) : null}
            {editor.searchingPointId === point.id && editor.suggestions.length ? <div className="ksu-place-results">{editor.suggestions.map((suggestion) => <button key={suggestion.placeId} onClick={() => void actions.choosePlace(point.id, suggestion)} type="button"><b>{suggestion.primaryText}</b>{suggestion.secondaryText ? <small>{suggestion.secondaryText}</small> : null}</button>)}</div> : null}
            {isRoutePointComplete(point) ? <small className="resolved-place">Ready · {point.latitude!.toFixed(4)}, {point.longitude!.toFixed(4)}</small> : <div className="point-recovery"><button onClick={() => { actions.setSelectedPointId(point.id); actions.setSearchingPointId(point.id); actions.setActivePlacementPointId(null); }} type="button">Search</button><button onClick={() => { actions.setSelectedPointId(point.id); actions.setActivePlacementPointId(point.id); actions.setSearchingPointId(null); }} type="button">Place {routePointIdentity(points, index).token} on map</button></div>}
          </div>
          <div className="stop-actions">
            {index > 0 && index < points.length - 1 ? <>
               <button aria-label={`Drag ${routePointIdentity(points, index).token} to reorder`} className="drag-waypoint" draggable onDragEnd={() => actions.setDraggingPointId(null)} onDragStart={(event) => beginWaypointDrag(event, point.id)} type="button"><span aria-hidden="true">⠿</span><small>Drag</small></button>
               <button aria-label="Move waypoint up" disabled={index === 1} onClick={() => actions.movePoint(index, -1)} type="button">↑</button>
              <button aria-label="Move waypoint down" disabled={index === points.length - 2} onClick={() => actions.movePoint(index, 1)} type="button">↓</button>
               <button aria-label="Remove waypoint" onClick={() => actions.removePoint(point.id)} type="button">×</button>
            </> : null}
          </div>
          </li>
          {index === 0 ? <li className="waypoint-insert"><div><RibbonRule label="Build the ride" /><strong>Add a point between Start and Finish</strong><small>Add only the point you intend to place.</small></div><div className="insert-actions"><Button disabled={points.length >= maxPoints} onClick={() => actions.addIntermediate('stop')}>＋ Add stop</Button><Button disabled={points.length >= maxPoints} onClick={() => actions.addIntermediate('via')}>＋ Add ride-through road</Button></div></li> : null}
        </Fragment>)}
      </ol>
      <div className="ksu-preferences">
        <RibbonRule label="Road preferences" />
        <Toggle checked={draft.avoidHighways} label="Avoid highways" onChange={(checked) => actions.setAvoidance('avoidHighways', checked)} />
        <Toggle checked={draft.avoidTolls} label="Avoid tolls" onChange={(checked) => actions.setAvoidance('avoidTolls', checked)} />
        <Toggle checked={draft.avoidFerries} label="Avoid ferries" onChange={(checked) => actions.setAvoidance('avoidFerries', checked)} />
        {roadPreferenceExtras}
      </div>
    </>
  );
}
