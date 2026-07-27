// Presentational route-leg editor: the readiness checklist, the ordered stop
// list, and road preferences. Markup extracted from RoutePlannerPage unchanged;
// all state lives in useRouteLegEditor so the trip editor can mount one per day.
import { Fragment, type DragEvent, type ReactNode } from 'react';
import { isRoutePointComplete, routePointIdentity } from './route-point-identity';
import type { RouteLegEditorApi } from './use-route-leg-editor';

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
        <p className="kicker">PREVIEW CHECK</p>
        <strong>{draft.previewStale ? 'Route changed after preview.' : editor.previewReady ? 'Ready to preview the road.' : 'Finish these before Preview route.'}</strong>
        <ul>
           {points.map((point, index) => {
             const identity = routePointIdentity(points, index);
             const complete = isRoutePointComplete(point);
             return <li key={point.id} className={complete ? 'complete' : ''}><span className={`stamp-chip ${complete ? 'moss' : 'rust'}`}>{complete ? 'Ready' : 'Needs a location'}</span> {identity.token} · {identity.purpose} <button onClick={() => complete ? actions.selectPoint(point.id) : (actions.selectPoint(point.id), actions.setActivePlacementPointId(point.id))} type="button">{complete ? `Select ${identity.token}` : `Place ${identity.token} on map`}</button></li>;
           })}
        </ul>
      </section>
      <ol className="planner-stop-list">
        {points.map((point, index) => <Fragment key={point.id}>
          <li id={`route-point-${instanceId}-${point.id}`} className={`${editor.draggingPointId === point.id ? 'waypoint-row dragging' : 'waypoint-row'} ${editor.selectedPointId === point.id ? 'selected' : ''}`} onClick={() => actions.selectPoint(point.id)} onDragOver={index > 0 && index < points.length - 1 ? (event) => event.preventDefault() : undefined} onDrop={index > 0 && index < points.length - 1 ? (event) => { event.preventDefault(); actions.reorderWaypoint(event.dataTransfer.getData('text/plain'), point.id); actions.setDraggingPointId(null); } : undefined}>
          <div className="stop-number">{routePointIdentity(points, index).token}</div>
          <div className="stop-editor" data-editor-instance={instanceId}>
            <label><span>{routePointIdentity(points, index).purpose.toUpperCase()}</span><input autoComplete="off" onChange={(event) => actions.updatePointQuery(point.id, event.target.value)} onFocus={() => { actions.setSearchingPointId(point.id); actions.setSelectedPointId(point.id); }} placeholder={point.kind === 'origin' ? 'Search starting place' : point.kind === 'destination' ? 'Search destination' : point.kind === 'stop' ? 'Search a stop' : 'Search a road to ride through'} value={point.displayName} /></label>
            {index > 0 && index < points.length - 1 ? <>
              <div className="waypoint-kind" aria-label={`${routePointIdentity(points, index).token} purpose`}>
                <button aria-pressed={point.kind === 'stop'} className={point.kind === 'stop' ? 'selected' : ''} onClick={() => actions.setIntermediateKind(point.id, 'stop')} type="button"><b>Stop here</b><small>Fuel, food, or regroup</small></button>
                <button aria-pressed={point.kind === 'via'} className={point.kind === 'via' ? 'selected' : ''} onClick={() => actions.setIntermediateKind(point.id, 'via')} type="button"><b>Ride through</b><small>Stay on this road</small></button>
              </div>
              <small className="point-purpose">{point.kind === 'stop' ? 'The group plans to pull over here.' : 'This holds the group to the road you picked.'}</small>
            </> : null}
            {editor.searchingPointId === point.id && editor.suggestions.length ? <div className="place-results">{editor.suggestions.map((suggestion) => <button key={suggestion.placeId} onClick={() => void actions.choosePlace(point.id, suggestion)} type="button"><b>{suggestion.primaryText}</b>{suggestion.secondaryText ? <small>{suggestion.secondaryText}</small> : null}</button>)}</div> : null}
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
          {index === 0 ? <li className="waypoint-insert"><div><p className="kicker">BUILD THE RIDE</p><strong>Add a point between Start and Finish</strong><small>Add only the point you intend to place.</small></div><div className="insert-actions"><button disabled={points.length >= maxPoints} onClick={() => actions.addIntermediate('stop')} type="button">＋ Add stop</button><button disabled={points.length >= maxPoints} onClick={() => actions.addIntermediate('via')} type="button">＋ Add ride-through road</button></div></li> : null}
        </Fragment>)}
      </ol>
      <fieldset className="route-options"><legend>Road preferences</legend>
        <label><input checked={draft.avoidHighways} onChange={(event) => actions.setAvoidance('avoidHighways', event.target.checked)} type="checkbox" /> Avoid highways</label>
        <label><input checked={draft.avoidTolls} onChange={(event) => actions.setAvoidance('avoidTolls', event.target.checked)} type="checkbox" /> Avoid tolls</label>
        <label><input checked={draft.avoidFerries} onChange={(event) => actions.setAvoidance('avoidFerries', event.target.checked)} type="checkbox" /> Avoid ferries</label>
        {roadPreferenceExtras}
      </fieldset>
    </>
  );
}
