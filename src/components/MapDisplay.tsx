import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';

interface MapDisplayProps {
  route: [number, number][];
  carPosition: [number, number] | null;
  carBearing: number;
  lockCamera: boolean;
}

// Custom Leaflet Icons using Inline SVGs to match premium dark style
const originIcon = L.divIcon({
  className: 'custom-origin-icon',
  html: `
    <div style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; background: rgba(16, 185, 129, 0.15); border: 2px solid #10b981; color: #10b981; filter: drop-shadow(0 0 6px rgba(16, 185, 129, 0.5));">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
      </svg>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

const destinationIcon = L.divIcon({
  className: 'custom-destination-icon',
  html: `
    <div style="display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; background: rgba(244, 63, 94, 0.15); border: 2px solid #f43f5e; color: #f43f5e; filter: drop-shadow(0 0 6px rgba(244, 63, 94, 0.5));">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
      </svg>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

// A component that can access the Leaflet Map instance
const MapController: React.FC<{
  route: [number, number][];
  carPosition: [number, number] | null;
  lockCamera: boolean;
}> = ({ route, carPosition, lockCamera }) => {
  const map = useMap();
  const initialFitDone = useRef<string>('');

  // Fit the whole route once it is loaded
  useEffect(() => {
    if (route.length > 0) {
      const routeStr = JSON.stringify(route[0]) + JSON.stringify(route[route.length - 1]);
      if (initialFitDone.current !== routeStr) {
        const bounds = L.latLngBounds(route);
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
        initialFitDone.current = routeStr;
      }
    } else {
      initialFitDone.current = '';
    }
  }, [route, map]);

  // Center the map camera on the car when locked
  useEffect(() => {
    if (lockCamera && carPosition) {
      map.setView(carPosition, map.getZoom(), { animate: true, duration: 0.2 });
    }
  }, [carPosition, lockCamera, map]);

  return null;
};

export const MapDisplay: React.FC<MapDisplayProps> = ({
  route,
  carPosition,
  carBearing,
  lockCamera,
}) => {
  // Center of the US for default viewport
  const defaultCenter: [number, number] = [37.0902, -95.7129];
  const defaultZoom = 4;

  // Create a custom divIcon for the car dynamically based on the current bearing.
  const getCarIcon = (bearing: number) => {
    return L.divIcon({
      className: 'custom-car-divicon',
      html: `
        <div style="transform: rotate(${bearing}deg); transition: transform 0.15s ease-out; display: flex; align-items: center; justify-content: center; width: 36px; height: 36px;">
          <svg viewBox="0 0 24 24" width="36" height="36" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 5px rgba(0,0,0,0.5)) drop-shadow(0 0 6px rgba(59,130,246,0.6));">
            <!-- Wheels (under) -->
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
            
            <!-- Headlights (yellow) -->
            <circle cx="8" cy="3" r="0.75" fill="#f59e0b" />
            <circle cx="16" cy="3" r="0.75" fill="#f59e0b" />
          </svg>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [16, 16],
    });
  };

  return (
    <div className="w-full h-full relative">
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        zoomControl={false} // Disable standard controls to keep it tidy
        className="w-full h-full"
      >
        {/* CartoDB Dark Matter tiles layer */}
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />

        {/* Draw the routing path */}
        {route.length > 0 && (
          <Polyline
            positions={route}
            pathOptions={{
              color: '#3b82f6',
              weight: 5,
              opacity: 0.75,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        )}

        {/* Display start/origin pin */}
        {route.length > 0 && (
          <Marker position={route[0]} icon={originIcon} />
        )}

        {/* Display destination pin */}
        {route.length > 0 && (
          <Marker position={route[route.length - 1]} icon={destinationIcon} />
        )}

        {/* Display the active car */}
        {carPosition && (
          <Marker position={carPosition} icon={getCarIcon(carBearing)} />
        )}

        {/* Custom controller to center/fit map bounds */}
        <MapController route={route} carPosition={carPosition} lockCamera={lockCamera} />
      </MapContainer>
    </div>
  );
};
