import { useEffect, useRef, useState } from 'react';

type Coordinate = { latitude: number; longitude: number };
// Tokens come from the full itinerary, never from the resolved marker list.
// Empty points must not make W3 appear as W2 on the map.
type MapPoint = Coordinate & { id: string; displayName: string; kind: 'origin' | 'stop' | 'via' | 'destination'; token: string; purpose: string; selected: boolean };

type GoogleListener = { remove(): void };
type GoogleMap = {
  fitBounds(bounds: GoogleBounds, padding?: number): void;
  setCenter(center: { lat: number; lng: number }): void;
  setZoom(zoom: number): void;
};
type GoogleBounds = { extend(point: { lat: number; lng: number }): void };
type GoogleMarker = { map: GoogleMap | null };
type GooglePolyline = { setMap(map: GoogleMap | null): void };
type GoogleTrafficLayer = { setMap(map: GoogleMap | null): void };
type GoogleMaps = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMap;
  Marker: new (options: Record<string, unknown>) => GoogleMarker;
  Polyline: new (options: Record<string, unknown>) => GooglePolyline;
  TrafficLayer: new () => GoogleTrafficLayer;
  marker: { AdvancedMarkerElement: new (options: Record<string, unknown>) => GoogleMarker };
  LatLngBounds: new () => GoogleBounds;
  event: { addListener(instance: object, eventName: string, handler: (event: { latLng?: { lat(): number; lng(): number } }) => void): GoogleListener };
};

declare global {
  interface Window { google?: { maps?: GoogleMaps } }
}

let loader: Promise<GoogleMaps> | null = null;

function loadMaps(key: string) {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (loader) return loader;
  loader = new Promise<GoogleMaps>((resolve, reject) => {
    const callback = `ksuGoogleMapsReady${crypto.randomUUID().replaceAll('-', '')}`;
    const script = document.createElement('script');
    const finish = () => {
      const maps = window.google?.maps;
      delete (window as unknown as Record<string, unknown>)[callback];
      if (maps) resolve(maps); else reject(new Error('Google Maps did not initialize.'));
    };
    (window as unknown as Record<string, unknown>)[callback] = finish;
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&libraries=marker&callback=${callback}`;
    script.onerror = () => reject(new Error('Google Maps could not load. Check the browser-key restrictions.'));
    document.head.append(script);
  });
  return loader;
}

export function GoogleRouteMap({ apiKey, mapId, points, routePoints, selectedPointId, showTraffic, onMapClick, onPointMoved, onPointSelected }: {
  apiKey?: string;
  mapId?: string;
  points: MapPoint[];
  routePoints: Coordinate[];
  selectedPointId: string | null;
  showTraffic: boolean;
  onMapClick: (coordinate: Coordinate) => void;
  onPointMoved: (id: string, coordinate: Coordinate) => void;
  onPointSelected: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<GoogleMap | null>(null);
  const maps = useRef<GoogleMaps | null>(null);
  const traffic = useRef<GoogleTrafficLayer | null>(null);
  const clickHandler = useRef(onMapClick);
  const moveHandler = useRef(onPointMoved);
  const selectHandler = useRef(onPointSelected);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  clickHandler.current = onMapClick;
  moveHandler.current = onPointMoved;
  selectHandler.current = onPointSelected;

  useEffect(() => {
    if (!apiKey || !host.current) return;
    let active = true;
    let listener: GoogleListener | null = null;
    void loadMaps(apiKey).then((loaded) => {
      if (!active || !host.current) return;
      maps.current = loaded;
      map.current = new loaded.Map(host.current, {
        center: { lat: 39.5, lng: -98.35 }, zoom: 4, mapId,
        streetViewControl: false, fullscreenControl: true, mapTypeControl: false,
      });
      listener = loaded.event.addListener(map.current, 'click', (event) => {
        if (event.latLng) clickHandler.current({ latitude: event.latLng.lat(), longitude: event.latLng.lng() });
      });
      setReady(true);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Google Maps is unavailable.');
    });
    return () => { active = false; listener?.remove(); traffic.current?.setMap(null); traffic.current = null; setReady(false); };
  }, [apiKey, mapId]);

  useEffect(() => {
    if (!ready || !map.current || !maps.current) return;
    if (showTraffic) {
      traffic.current ??= new maps.current.TrafficLayer();
      traffic.current.setMap(map.current);
    } else traffic.current?.setMap(null);
  }, [ready, showTraffic]);

  useEffect(() => {
    if (!map.current || !maps.current) return;
    const { Polyline, LatLngBounds, event } = maps.current;
    const markers = points.map((point) => {
      const marker = new maps.current!.marker.AdvancedMarkerElement({
        map: map.current, position: { lat: point.latitude, lng: point.longitude },
        title: `${point.token}, ${point.purpose}, ${point.displayName}. Press Enter to edit.`,
        gmpClickable: true, gmpDraggable: true, zIndex: point.id === selectedPointId ? 100 : 1,
        content: markerContent(point),
      });
      event.addListener(marker, 'dragend', (mapEvent) => {
        if (mapEvent.latLng) moveHandler.current(point.id, { latitude: mapEvent.latLng.lat(), longitude: mapEvent.latLng.lng() });
      });
      event.addListener(marker, 'gmp-click', () => selectHandler.current(point.id));
      return marker;
    });
    // Keep the route above Google traffic. Without an explicit z-index, dense
    // traffic lines can visually erase the rider's planned route.
    const routeCasing = routePoints.length > 1 ? new Polyline({
      map: map.current, path: routePoints.map((point) => ({ lat: point.latitude, lng: point.longitude })),
      geodesic: true, strokeColor: '#1a1207', strokeOpacity: .92, strokeWeight: 11, zIndex: 90,
    }) : null;
    const line = routePoints.length > 1 ? new Polyline({
      map: map.current, path: routePoints.map((point) => ({ lat: point.latitude, lng: point.longitude })),
      geodesic: true, strokeColor: '#ffb52b', strokeOpacity: 1, strokeWeight: 6, zIndex: 100,
    }) : null;
    const visible = routePoints.length ? routePoints : points;
    if (visible.length) {
      const bounds = new LatLngBounds();
      visible.forEach((point) => bounds.extend({ lat: point.latitude, lng: point.longitude }));
      if (visible.length === 1) { map.current.setCenter({ lat: visible[0].latitude, lng: visible[0].longitude }); map.current.setZoom(12); }
      else map.current.fitBounds(bounds, 64);
    }
    return () => { markers.forEach((marker) => { marker.map = null; }); routeCasing?.setMap(null); line?.setMap(null); };
  }, [points, routePoints, selectedPointId]);

  if (!apiKey) return <div className="map-placeholder"><p className="kicker">MAP SETUP REQUIRED</p><h2>The route engine is ready.</h2><p>Add the dedicated, referrer-restricted Google Maps browser key to render the live map. Place search and route calculations continue through KSU’s protected server boundary.</p></div>;
  if (error) return <div className="map-placeholder"><p className="kicker">MAP UNAVAILABLE</p><h2>Google Maps did not load.</h2><p>{error}</p></div>;
  return <div className="google-route-map" aria-label="Route map. Select a route point, then use Place on map to place that exact point. Drag a marker to refine it." ref={host} role="application" />;
}

function markerContent(point: MapPoint) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = `route-map-marker ${point.kind} ${point.selected ? 'selected' : ''}`;
  element.textContent = point.token;
  element.setAttribute('aria-label', `${point.token}, ${point.purpose}, ${point.displayName}. Press Enter to edit.`);
  return element;
}
