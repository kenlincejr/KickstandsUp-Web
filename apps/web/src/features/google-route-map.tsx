import { useEffect, useRef, useState } from 'react';

type Coordinate = { latitude: number; longitude: number };
type MapPoint = Coordinate & { id: string; displayName: string };

type GoogleListener = { remove(): void };
type GoogleMap = {
  fitBounds(bounds: GoogleBounds, padding?: number): void;
  setCenter(center: { lat: number; lng: number }): void;
  setZoom(zoom: number): void;
};
type GoogleBounds = { extend(point: { lat: number; lng: number }): void };
type GoogleMarker = { setMap(map: GoogleMap | null): void };
type GooglePolyline = { setMap(map: GoogleMap | null): void };
type GoogleTrafficLayer = { setMap(map: GoogleMap | null): void };
type GoogleMaps = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMap;
  Marker: new (options: Record<string, unknown>) => GoogleMarker;
  Polyline: new (options: Record<string, unknown>) => GooglePolyline;
  TrafficLayer: new () => GoogleTrafficLayer;
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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=${callback}`;
    script.onerror = () => reject(new Error('Google Maps could not load. Check the browser-key restrictions.'));
    document.head.append(script);
  });
  return loader;
}

export function GoogleRouteMap({ apiKey, mapId, points, routePoints, showTraffic, onMapClick, onPointMoved }: {
  apiKey?: string;
  mapId?: string;
  points: MapPoint[];
  routePoints: Coordinate[];
  showTraffic: boolean;
  onMapClick: (coordinate: Coordinate) => void;
  onPointMoved: (id: string, coordinate: Coordinate) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<GoogleMap | null>(null);
  const maps = useRef<GoogleMaps | null>(null);
  const traffic = useRef<GoogleTrafficLayer | null>(null);
  const clickHandler = useRef(onMapClick);
  const moveHandler = useRef(onPointMoved);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  clickHandler.current = onMapClick;
  moveHandler.current = onPointMoved;

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
    const { Marker, Polyline, LatLngBounds, event } = maps.current;
    const markers = points.map((point, index) => {
      const marker = new Marker({
        map: map.current, position: { lat: point.latitude, lng: point.longitude }, label: String(index + 1),
        title: point.displayName || `Waypoint ${index + 1}`, draggable: true,
      });
      event.addListener(marker, 'dragend', (mapEvent) => {
        if (mapEvent.latLng) moveHandler.current(point.id, { latitude: mapEvent.latLng.lat(), longitude: mapEvent.latLng.lng() });
      });
      return marker;
    });
    const line = routePoints.length > 1 ? new Polyline({
      map: map.current, path: routePoints.map((point) => ({ lat: point.latitude, lng: point.longitude })),
      geodesic: true, strokeColor: '#f5a623', strokeOpacity: 1, strokeWeight: 5,
    }) : null;
    const visible = routePoints.length ? routePoints : points;
    if (visible.length) {
      const bounds = new LatLngBounds();
      visible.forEach((point) => bounds.extend({ lat: point.latitude, lng: point.longitude }));
      if (visible.length === 1) { map.current.setCenter({ lat: visible[0].latitude, lng: visible[0].longitude }); map.current.setZoom(12); }
      else map.current.fitBounds(bounds, 64);
    }
    return () => { markers.forEach((marker) => marker.setMap(null)); line?.setMap(null); };
  }, [points, routePoints]);

  if (!apiKey) return <div className="map-placeholder"><p className="kicker">MAP SETUP REQUIRED</p><h2>The route engine is ready.</h2><p>Add the dedicated, referrer-restricted Google Maps browser key to render the live map. Place search and route calculations continue through KSU’s protected server boundary.</p></div>;
  if (error) return <div className="map-placeholder"><p className="kicker">MAP UNAVAILABLE</p><h2>Google Maps did not load.</h2><p>{error}</p></div>;
  return <div className="google-route-map" aria-label="Route map. Click to add a waypoint; drag a numbered marker to refine its position." ref={host} role="application" />;
}
