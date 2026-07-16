import { useState } from 'react';
import { publicEnv } from '../lib/env';

const sampleStops = [
  ['01', 'Staging — Asheville', 'START'],
  ['02', 'Craggy Gardens', 'REGROUP'],
  ['03', 'Little Switzerland', 'FUEL'],
  ['04', 'Lake Lure', 'FINISH'],
] as const;

export function RoutePlannerPage() {
  const [revision, setRevision] = useState(4);
  const mapReady = Boolean(publicEnv.googleMapsBrowserKey && publicEnv.googleMapId);
  return (
    <section className="tool-page">
      <header className="tool-header"><div><p className="kicker">KSU ROUTE LAB</p><h1>Blue Ridge Saturday</h1><p>Revision {String(revision).padStart(2, '0')} · Draft</p></div><div className="button-row"><button className="secondary-button" type="button" onClick={() => setRevision(value => value + 1)}>Save revision</button><button className="primary-button" type="button" disabled>Publish to ride</button></div></header>
      <div className="planner-grid">
        <aside className="planner-panel"><div className="metric-row"><span><b>184</b> mi</span><span><b>5:12</b> ride</span><span><b>2</b> fuel</span></div><ol className="stop-list">{sampleStops.map(([number, label, kind]) => <li key={number}><b>{number}</b><span>{label}<small>{kind}</small></span><button type="button" aria-label={`Move ${label}`}>⋮⋮</button></li>)}</ol><button className="add-stop" type="button" disabled>+ Add waypoint</button></aside>
        <div className="map-canvas"><div className="map-placeholder"><p className="kicker">GOOGLE MAPS CANVAS</p><h2>{mapReady ? 'Map adapter ready for implementation.' : 'Restricted browser key required.'}</h2><p>KSU controls, route state, and revisions stay ours. Google attribution and map controls remain visible and compliant.</p></div></div>
      </div>
    </section>
  );
}
