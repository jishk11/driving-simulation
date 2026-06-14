import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import maplibregl from 'maplibre-gl';

interface MapDisplayProps {
  route: [number, number][];
  currentSegmentIndex: number;
  carPosition: [number, number] | null;
  carBearing: number;
  lockCamera: boolean;
  isDarkMode: boolean;
  ambientMode: 'day' | 'night' | 'dawn' | 'dusk';
  status: string;
}

export const MapDisplay: React.FC<MapDisplayProps> = ({
  route,
  currentSegmentIndex,
  carPosition,
  carBearing,
  lockCamera,
  isDarkMode,
  ambientMode,
  status,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [isZoomingIn, setIsZoomingIn] = useState(false);
  const haloRef = useRef<HTMLDivElement>(null);

  // Dynamic halo shadow color & spread tailored to each ambient state (day, dawn, dusk, night)
  const haloShadow = useMemo(() => {
    switch (ambientMode) {
      case 'day':
        return '0 0 65px 22px rgba(147, 197, 253, 0.72), 0 0 30px 8px rgba(255, 255, 255, 0.6), inset 0 0 30px rgba(255, 255, 255, 0.3)';
      case 'dawn':
        return '0 0 60px 18px rgba(249, 115, 22, 0.6), 0 0 30px 8px rgba(236, 72, 153, 0.5), inset 0 0 35px rgba(254, 215, 170, 0.4)';
      case 'dusk':
        return '0 0 60px 20px rgba(162, 28, 175, 0.55), 0 0 30px 8px rgba(244, 63, 94, 0.45), inset 0 0 35px rgba(253, 164, 175, 0.3)';
      case 'night':
      default:
        return '0 0 70px 22px rgba(99, 102, 241, 0.5), 0 0 30px 8px rgba(59, 130, 246, 0.35), inset 0 0 40px rgba(99, 102, 241, 0.25)';
    }
  }, [ambientMode]);

  // Dynamically calculate the globe's screen size and position in pixels using map.project()
  const updateHalo = useCallback(() => {
    if (!map || !haloRef.current) return;

    const zoom = map.getZoom();
    if (zoom >= 6.5) {
      haloRef.current.style.opacity = '0';
      return;
    }

    const opacity = Math.max(0, Math.min(1, (6.0 - zoom) / 4.0));
    haloRef.current.style.opacity = opacity.toString();
    
    if (opacity <= 0) return;

    try {
      const center = map.getCenter();
      const lat = center.lat;
      const lon = center.lng;

      // Offset latitude by 30 and 60 degrees, keeping within [-90, 90]
      const latOffset1 = lat >= 0 ? lat - 30 : lat + 30;
      const latOffset2 = lat >= 0 ? lat - 60 : lat + 60;

      const centerPx = map.project(center);
      const p1Px = map.project([lon, latOffset1]);
      const p2Px = map.project([lon, latOffset2]);

      if (!centerPx || !p1Px || !p2Px) return;

      const d1 = Math.hypot(p1Px.x - centerPx.x, p1Px.y - centerPx.y);
      const d2 = Math.hypot(p2Px.x - centerPx.x, p2Px.y - centerPx.y);

      if (d1 <= 0 || d2 <= 0) return;

      const r = d1 / d2;
      const denom = 0.866025403 * r - 0.288675134;
      if (Math.abs(denom) < 0.0001) return;

      let k = (r - 0.577350269) / denom;
      k = Math.max(0, Math.min(0.99, k));

      const rScreen = (2 * d1 * (1 - 0.866025403 * k)) / Math.sqrt(1 - k * k);
      const diameter = rScreen * 2;

      const finalDiameter = diameter * 0.995;

      haloRef.current.style.width = `${finalDiameter}px`;
      haloRef.current.style.height = `${finalDiameter}px`;
      haloRef.current.style.left = `${centerPx.x}px`;
      haloRef.current.style.top = `${centerPx.y}px`;
    } catch (err) {
      console.error("Error updating halo size:", err);
    }
  }, [map]);

  // Refs to track markers so we can update them in place
  const originMarkerRef = useRef<maplibregl.Marker | null>(null);
  const destinationMarkerRef = useRef<maplibregl.Marker | null>(null);
  const carMarkerRef = useRef<maplibregl.Marker | null>(null);

  // Helper to construct custom HTML markers from SVG strings
  const createCustomMarkerElement = (html: string): HTMLElement => {
    const div = document.createElement('div');
    div.innerHTML = html.trim();
    return div.firstChild as HTMLElement;
  };

  // Helper to zoom in and fit bounds of the current route
  const fitRoute = (mapInstance: maplibregl.Map) => {
    if (route.length === 0) return;

    const executeFit = () => {
      const lats = route.map(coord => coord[0]);
      const lons = route.map(coord => coord[1]);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLon = Math.min(...lons);
      const maxLon = Math.max(...lons);

      const bounds: [[number, number], [number, number]] = [
        [minLon, minLat], // southwest (lon, lat)
        [maxLon, maxLat], // northeast (lon, lat)
      ];

      mapInstance.fitBounds(bounds, {
        padding: 80,
        maxZoom: 14,
        animate: true,
        duration: 2500, // Smooth 2.5 seconds pan and zoom transition
      });
    };

    if (mapInstance.isStyleLoaded()) {
      executeFit();
    } else {
      mapInstance.once('style.load', executeFit);
    }
  };

  const isDarkModeRef = useRef(isDarkMode);
  useEffect(() => {
    isDarkModeRef.current = isDarkMode;
  }, [isDarkMode]);

  // 1. Initialize MapLibre GL Map
  useEffect(() => {
    if (!containerRef.current) return;

    const initialStyleUrl = isDarkModeRef.current
      ? "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
      : "https://tiles.openfreemap.org/styles/liberty";

    const newMap = new maplibregl.Map({
      container: containerRef.current,
      style: initialStyleUrl,
      center: [-95.7129, 37.0902], // Center of US (longitude, latitude)
      zoom: 4,
      minZoom: 2, // Prevent zooming out excessively
      maxZoom: 20, // Prevent zooming in beyond highest detail tile level
      attributionControl: false,
      fadeDuration: 0, // Disable label collision fade-in lag
    });

    const onStyleLoad = () => {
      newMap.setProjection({ type: 'globe' });
    };

    newMap.on('style.load', onStyleLoad);

    // Add compact attribution to the bottom right
    newMap.addControl(new maplibregl.AttributionControl({ compact: true }));

    // Prevent pitch (camera tilt) at globe zoom levels so the sphere stays
    // visually centered in the viewport and perfectly aligns with the CSS halo.
    // At navigation zoom levels pitch is allowed for a natural driving POV.
    newMap.on('pitch', () => {
      if (newMap.getZoom() < 7) {
        newMap.setPitch(0);
      }
    });

    setMap(newMap);

    return () => {
      newMap.remove();
      setMap(null);
    };
  }, []);

  // Synchronize halo position and scale on camera movement or resizing
  useEffect(() => {
    if (!map) return;

    map.on('move', updateHalo);
    map.on('resize', updateHalo);
    map.on('style.load', updateHalo);

    updateHalo();

    return () => {
      map.off('move', updateHalo);
      map.off('resize', updateHalo);
      map.off('style.load', updateHalo);
    };
  }, [map, updateHalo]);

  // Call updateHalo on every render to ensure React re-renders don't cause visual desyncs
  useEffect(() => {
    updateHalo();
  });

  // 2. Synchronize Dark / Light mode tile layers & colors
  useEffect(() => {
    if (!map) return;

    const updateMapTheme = () => {
      const styleUrl = isDarkMode
        ? "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
        : "https://tiles.openfreemap.org/styles/liberty";
      
      map.setStyle(styleUrl);
    };

    updateMapTheme();
  }, [map, isDarkMode]);

  // 3. Zoom-to-Route boundary on load / update of route
  useEffect(() => {
    if (!map) return;
    fitRoute(map);
  }, [map, route]);

  // 4. Update route line layers and sources, ensuring they are re-added and populated on theme changes/style loads
  const setupRouteLayersAndData = useCallback(() => {
    if (!map) return;

    // 1. Re-add sources if missing
    if (!map.getSource('passed-route')) {
      map.addSource('passed-route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }
    if (!map.getSource('upcoming-route')) {
      map.addSource('upcoming-route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }

    // 2. Re-add layers if missing
    if (!map.getLayer('passed-route-layer')) {
      map.addLayer({
        id: 'passed-route-layer',
        type: 'line',
        source: 'passed-route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': isDarkMode ? '#cbd5e1' : '#475569',
          'line-width': 5,
          'line-opacity': isDarkMode ? 0.75 : 0.6,
        },
      });
    } else {
      map.setPaintProperty(
        'passed-route-layer',
        'line-color',
        isDarkMode ? '#cbd5e1' : '#475569'
      );
      map.setPaintProperty(
        'passed-route-layer',
        'line-opacity',
        isDarkMode ? 0.75 : 0.6
      );
    }
    
    if (!map.getLayer('upcoming-route-layer')) {
      map.addLayer({
        id: 'upcoming-route-layer',
        type: 'line',
        source: 'upcoming-route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#3b82f6',
          'line-width': 5,
          'line-opacity': 0.75,
        },
      });
    }

    // 3. Set the data
    const passedSource = map.getSource('passed-route') as maplibregl.GeoJSONSource;
    const upcomingSource = map.getSource('upcoming-route') as maplibregl.GeoJSONSource;

    if (route.length === 0) {
      if (passedSource) passedSource.setData({ type: 'FeatureCollection', features: [] });
      if (upcomingSource) upcomingSource.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    const passedCoords = route
      .slice(0, currentSegmentIndex + 1)
      .concat(carPosition ? [carPosition] : [])
      .map(coord => [coord[1], coord[0]]);

    const upcomingCoords = (carPosition ? [carPosition] : [])
      .concat(route.slice(currentSegmentIndex + 1))
      .map(coord => [coord[1], coord[0]]);

    if (passedSource && passedCoords.length >= 2) {
      passedSource.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: passedCoords,
            },
          },
        ],
      });
    } else if (passedSource) {
      passedSource.setData({ type: 'FeatureCollection', features: [] });
    }

    if (upcomingSource && upcomingCoords.length >= 2) {
      upcomingSource.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: upcomingCoords,
            },
          },
        ],
      });
    } else if (upcomingSource) {
      upcomingSource.setData({ type: 'FeatureCollection', features: [] });
    }
  }, [map, route, currentSegmentIndex, carPosition, isDarkMode]);

  useEffect(() => {
    if (!map) return;

    const handleStyleLoad = () => {
      setupRouteLayersAndData();
    };

    map.on('style.load', handleStyleLoad);

    if (map.isStyleLoaded()) {
      setupRouteLayersAndData();
    }

    return () => {
      map.off('style.load', handleStyleLoad);
    };
  }, [map, setupRouteLayersAndData]);

  // 5. Update Origin & Destination Pins
  useEffect(() => {
    if (!map) return;

    if (route.length > 0) {
      const startCoord = route[0];
      const endCoord = route[route.length - 1];

      // Origin Pin
      if (!originMarkerRef.current) {
        const el = createCustomMarkerElement(`
          <div style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; background: rgba(16, 185, 129, 0.15); border: 2px solid #10b981; color: #10b981; filter: drop-shadow(0 0 6px rgba(16, 185, 129, 0.5));">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
          </div>
        `);
        originMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([startCoord[1], startCoord[0]])
          .addTo(map);
      } else {
        originMarkerRef.current.setLngLat([startCoord[1], startCoord[0]]);
      }

      // Destination Pin
      if (!destinationMarkerRef.current) {
        const el = createCustomMarkerElement(`
          <div style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; background: rgba(244, 63, 94, 0.15); border: 2px solid #f43f5e; color: #f43f5e; filter: drop-shadow(0 0 6px rgba(244, 63, 94, 0.5));">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
          </div>
        `);
        destinationMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([endCoord[1], endCoord[0]])
          .addTo(map);
      } else {
        destinationMarkerRef.current.setLngLat([endCoord[1], endCoord[0]]);
      }
    } else {
      if (originMarkerRef.current) {
        originMarkerRef.current.remove();
        originMarkerRef.current = null;
      }
      if (destinationMarkerRef.current) {
        destinationMarkerRef.current.remove();
        destinationMarkerRef.current = null;
      }
    }
  }, [map, route]);

  // 6. Update Car Marker & Rotation
  useEffect(() => {
    if (!map) return;

    if (carPosition) {
      if (!carMarkerRef.current) {
        const el = createCustomMarkerElement(`
          <div style="display: flex; align-items: center; justify-content: center; width: 36px; height: 36px;">
            <svg viewBox="0 0 24 24" width="36" height="36" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 5px rgba(0,0,0,0.5)) drop-shadow(0 0 6px rgba(59,130,246,0.6));">
              <!-- Wheels -->
              <rect x="3" y="4" width="2.5" height="5" rx="1" fill="#1e293b" />
              <rect x="18.5" y="4" width="2.5" height="5" rx="1" fill="#1e293b" />
              <rect x="3" y="15" width="2.5" height="5" rx="1" fill="#1e293b" />
              <rect x="18.5" y="15" width="2.5" height="5" rx="1" fill="#1e293b" />
              
              <!-- Car body -->
              <rect x="5.5" y="2" width="13" height="20" rx="3.5" fill="#3b82f6" stroke="#2563eb" stroke-width="1"/>
              
              <!-- Windshield -->
              <path d="M7.5 7.5C7.5 7.5 8.5 5.5 12 5.5C15.5 5.5 16.5 7.5 16.5 7.5H7.5Z" fill="#1e293b" />
              
              <!-- Rear window -->
              <path d="M7.5 17.5C7.5 17.5 8.5 18.5 12 18.5C15.5 18.5 16.5 17.5 16.5 17.5H7.5Z" fill="#1e293b" />
              
              <!-- Roof highlight -->
              <rect x="7.5" y="9.5" width="9" height="6" rx="1" fill="#60a5fa" opacity="0.3" />
              
              <!-- Headlights -->
              <circle cx="8" cy="3" r="0.75" fill="#f59e0b" />
              <circle cx="16" cy="3" r="0.75" fill="#f59e0b" />
            </svg>
          </div>
        `);
        carMarkerRef.current = new maplibregl.Marker({
          element: el,
          rotationAlignment: 'map',
        })
          .setLngLat([carPosition[1], carPosition[0]])
          .setRotation(carBearing)
          .addTo(map);
      } else {
        carMarkerRef.current.setLngLat([carPosition[1], carPosition[0]]);
        carMarkerRef.current.setRotation(carBearing);
      }
    } else {
      if (carMarkerRef.current) {
        carMarkerRef.current.remove();
        carMarkerRef.current = null;
      }
    }
  }, [map, carPosition, carBearing]);

  // 7. Zoom in to close-up navigation level when starting a route
  useEffect(() => {
    if (!map) return;

    if (status === 'driving' && carPosition) {
      setIsZoomingIn(true);
      map.easeTo({
        center: [carPosition[1], carPosition[0]],
        zoom: 15, // Standard navigation zoom
        duration: 2000, // Smooth transition
      });

      const timer = setTimeout(() => {
        setIsZoomingIn(false);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [map, status]);

  // 8. Camera follow logic (paused during the initial zoom-in fly-to transition)
  useEffect(() => {
    if (!map || isZoomingIn) return;

    if (lockCamera && carPosition) {
      map.easeTo({
        center: [carPosition[1], carPosition[0]],
        duration: 200,
        easing: (t) => t, // Linear easing for a smooth tracking motion
      });
    }
  }, [map, carPosition, lockCamera, isZoomingIn]);

  // 8. Cleanup marker refs on unmount
  useEffect(() => {
    return () => {
      if (originMarkerRef.current) originMarkerRef.current.remove();
      if (destinationMarkerRef.current) destinationMarkerRef.current.remove();
      if (carMarkerRef.current) carMarkerRef.current.remove();
    };
  }, []);

  return (
    <div className="w-full h-full relative z-0 overflow-hidden">
      {/* Soft atmospheric radial glow backdrops keyed to active day/night cycle */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {/* Soft, muted gray-blue background for daytime theme */}
        <div 
          className={`absolute inset-0 transition-opacity duration-1000 ${ambientMode === 'day' ? 'opacity-100' : 'opacity-0'}`} 
          style={{ background: 'radial-gradient(circle at 50% 50%, #e6eff9 0%, #dbe5f0 45%, #b2c5dc 100%)' }} 
        />
        {/* Warm pinkish-orange sunrise gradient */}
        <div 
          className={`absolute inset-0 transition-opacity duration-1000 ${ambientMode === 'dawn' ? 'opacity-100' : 'opacity-0'}`} 
          style={{ background: 'radial-gradient(circle at 50% 50%, #ffd1b3 0%, #e88d7d 35%, #473c55 70%, #0f1123 100%)' }} 
        />
        {/* Deep orange-purple twilight sunset gradient */}
        <div 
          className={`absolute inset-0 transition-opacity duration-1000 ${ambientMode === 'dusk' ? 'opacity-100' : 'opacity-0'}`} 
          style={{ background: 'radial-gradient(circle at 50% 50%, #f3a69f 0%, #9e5b6e 35%, #2a2542 70%, #0b0d19 100%)' }} 
        />
        {/* Subtle, soft blue-white atmospheric radial glow for nighttime */}
        <div 
          className={`absolute inset-0 transition-opacity duration-1000 ${ambientMode === 'night' ? 'opacity-100' : 'opacity-0'}`} 
          style={{ background: 'radial-gradient(circle at 50% 50%, rgba(99, 102, 241, 0.22) 0%, rgba(59, 130, 246, 0.04) 35%, #020617 75%, #020617 100%)' }} 
        />

        {/* Dynamic Globe Halo Glow */}
        <div 
          ref={haloRef}
          className="absolute rounded-full"
          style={{
            transform: 'translate(-50%, -50%)',
            boxShadow: haloShadow,
            background: 'transparent',
            pointerEvents: 'none',
            transition: 'box-shadow 1s ease, opacity 0.3s ease', // Sizing scales raw during zooming to prevent lagging
          }}
        />
      </div>

      {/* Map container sits on top of background layers, transparent surrounding canvas reveals gradients */}
      <div ref={containerRef} className="w-full h-full relative z-10 bg-transparent" />
    </div>
  );
};
