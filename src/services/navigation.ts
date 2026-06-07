import { parseMaxspeedToMps, getHaversineDistance } from '../utils/geo';

export interface GeocodeResult {
  lat: number;
  lon: number;
  name: string;
}

export interface RouteResult {
  coordinates: [number, number][]; // [lat, lon] for Leaflet
  distance: number;                // in meters
  duration: number;                // in seconds
  speeds: number[];                // speed in m/s for each segment
  durations: number[];             // duration in seconds for each segment
}

/**
 * Uses the free Nominatim OpenStreetMap API to convert a text address into geographic coordinates.
 * Nominatim requires a descriptive User-Agent.
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  if (!address.trim()) return null;

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      address
    )}&format=json&limit=1`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'RealTimeDrivingSimulator/1.0 (ambient-dashboard-agentic-dev)',
        'Accept-Language': 'en',
      },
    });

    if (!response.ok) {
      throw new Error(`Nominatim query failed with status: ${response.status}`);
    }

    const data = await response.json();
    if (!data || data.length === 0) {
      return null;
    }

    const firstResult = data[0];
    return {
      lat: parseFloat(firstResult.lat),
      lon: parseFloat(firstResult.lon),
      name: firstResult.display_name,
    };
  } catch (error) {
    console.error('Geocoding error:', error);
    throw error;
  }
}

/**
 * Decodes an encoded OSRM/Google polyline string (5 decimal places precision)
 * into a dense array of [latitude, longitude] coordinates.
 */
export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}

/**
 * Uses the public OSRM API to get driving coordinates, distance, duration, and segment metadata.
 */
export async function fetchRoute(
  origin: [number, number],
  destination: [number, number]
): Promise<RouteResult | null> {
  try {
    // OSRM expects coordinates as {lon},{lat};{lon},{lat}
    const originStr = `${origin[1]},${origin[0]}`;
    const destStr = `${destination[1]},${destination[0]}`;
    
    // Request full overview as encoded polyline (geometries=polyline) and annotations for duration, distance, and speed
    const url = `https://router.project-osrm.org/route/v1/driving/${originStr};${destStr}?geometries=polyline&overview=full&annotations=duration,distance,speed`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`OSRM routing failed with status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      return null;
    }

    // Prevent snapping to different continents/oceans if route is impossible
    if (data.waypoints) {
      for (const wp of data.waypoints) {
        if (wp.distance !== undefined && wp.distance > 100000) { // 100 km threshold
          console.warn(`OSRM waypoint snapped too far: ${wp.distance}m`);
          return null;
        }
      }
    }

    const route = data.routes[0];
    const encodedPolyline = route.geometry;
    
    // Decode the polyline string into dense Leaflet [lat, lon] coordinates
    const coordinates = decodePolyline(encodedPolyline);

    const distance = route.distance;
    const duration = route.duration;
    
    let annSpeeds: number[] = [];
    let annDurations: number[] = [];
    let annDistances: number[] = [];
    
    // Attempt to extract segment annotations
    if (route.legs && route.legs[0] && route.legs[0].annotation) {
      const ann = route.legs[0].annotation;
      annSpeeds = ann.speed || [];
      annDurations = ann.duration || [];
      annDistances = ann.distance || [];
    }

    const numSegments = coordinates.length - 1;
    let speeds: number[];
    let durations: number[];

    if (numSegments <= 0) {
      speeds = [];
      durations = [];
    } else if (annSpeeds.length === numSegments && annDurations.length === numSegments) {
      // Exact match — use annotations directly
      speeds = annSpeeds;
      durations = annDurations;
    } else if (annSpeeds.length > 0 && annDistances.length > 0) {
      // Annotation count differs from polyline coordinate count.
      // Redistribute annotation data across polyline segments using cumulative distance mapping.
      const annCumDist: number[] = [0];
      for (let i = 0; i < annDistances.length; i++) {
        annCumDist.push(annCumDist[i] + annDistances[i]);
      }
      const totalAnnDist = annCumDist[annCumDist.length - 1];

      const polyCumDist: number[] = [0];
      for (let i = 0; i < numSegments; i++) {
        polyCumDist.push(polyCumDist[i] + getHaversineDistance(coordinates[i], coordinates[i + 1]));
      }
      const totalPolyDist = polyCumDist[polyCumDist.length - 1];

      speeds = new Array(numSegments);
      durations = new Array(numSegments);
      let annIdx = 0;

      for (let i = 0; i < numSegments; i++) {
        // Map this polyline segment's midpoint distance into annotation distance space
        const midPolyDist = (polyCumDist[i] + polyCumDist[i + 1]) / 2;
        const scaledDist = totalAnnDist > 0 ? (midPolyDist / totalPolyDist) * totalAnnDist : 0;

        // Walk annIdx forward until we find the annotation segment containing scaledDist
        while (annIdx < annDistances.length - 1 && annCumDist[annIdx + 1] < scaledDist) {
          annIdx++;
        }

        const spd = annSpeeds[annIdx] || (duration > 0 ? distance / duration : 13.8);
        const segDist = polyCumDist[i + 1] - polyCumDist[i];
        speeds[i] = spd;
        durations[i] = spd > 0 ? segDist / spd : 0;
      }
    } else {
      // No annotation data at all — uniform fallback
      const uniformSpeed = duration > 0 ? distance / duration : 13.8;
      speeds = Array(numSegments).fill(uniformSpeed);
      durations = Array(numSegments).fill(duration / numSegments);
    }

    // Pass 2: Apply Realism Adjustments to the computed speeds
    let currentTrafficFlow = 1.0;
    for (let i = 0; i < numSegments; i++) {
      let spd = speeds[i];
      
      // OSRM speeds are systematically ~20-25% lower than actual US posted limits globally.
      // Apply a universal 21% baseline boost to all segments to match realistic driving.
      spd = spd * 1.21;

      // Highway Realism Fluctuation (smooth random walk)
      // If the boosted speed is roughly 54+ mph (24 m/s), consider it a highway
      if (spd >= 24.0) {
        // Drift the traffic flow multiplier smoothly up or down by max 2% per segment
        currentTrafficFlow += (Math.random() - 0.5) * 0.04;
        // Clamp between 0.87 (moderate traffic) and 1.05 (fast flow)
        currentTrafficFlow = Math.max(0.87, Math.min(1.05, currentTrafficFlow));
        
        spd = spd * currentTrafficFlow;
      } else {
        // Reset flow multiplier when off the highway
        currentTrafficFlow = 1.0;
      }
      
      // Recalculate duration for this segment with the new boosted speed
      if (durations[i] > 0) {
        // distance = original_duration * original_speed
        const segDist = durations[i] * speeds[i];
        durations[i] = segDist / spd;
      }
      speeds[i] = spd;
    }

    const finalDuration = durations.reduce((a, b) => a + b, 0);

    return {
      coordinates,
      distance,
      duration: finalDuration || duration,
      speeds,
      durations,
    };
  } catch (error) {
    console.error('Routing error:', error);
    throw error;
  }
}

export interface OverpassRoadData {
  maxspeed: string | null;
  highway: string | null;
  name: string | null;
  ref: string | null;
  confident: boolean;
}

// Overpass API endpoints — used as direct fallback on localhost only
const OVERPASS_DIRECT_ENDPOINTS = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
];

// Geographic cache — reuse last successful Overpass result when car hasn't moved far
let overpassCache: {
  lat: number;
  lon: number;
  result: OverpassRoadData | null;
  timestamp: number;
} | null = null;

const CACHE_RADIUS_M = 80; // Reuse result within 80 meters
const CACHE_TTL_MS = 30_000; // Cache expires after 30 seconds

/**
 * Queries the Overpass API for the tags of the way nearest to the given lat/lon.
 * On production (Vercel), routes through /api/overpass serverless proxy to avoid CORS.
 * On localhost, falls back to direct Overpass endpoints.
 */
export async function fetchNearestRoadData(
  lat: number,
  lon: number,
  osrmSpeedMps: number
): Promise<OverpassRoadData | null> {
  // Check geographic cache first
  if (overpassCache) {
    const distFromCache = getHaversineDistance([lat, lon], [overpassCache.lat, overpassCache.lon]);
    const age = Date.now() - overpassCache.timestamp;
    if (distFromCache < CACHE_RADIUS_M && age < CACHE_TTL_MS) {
      return overpassCache.result;
    }
  }
  const query = `[out:json][timeout:5];way(around:50,${lat},${lon})[highway~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street)$"];out tags;`;

  // Try our Vercel edge rewrite proxy first (avoids CORS on production).
  // The rewrite transparently forwards the POST to overpass.openstreetmap.fr.
  // On localhost this will 404 and gracefully fall through to direct endpoints.
  const proxyBody = new URLSearchParams();
  proxyBody.append('data', query);

  const endpoints: { url: string; init: RequestInit }[] = [
    {
      url: '/api/overpass_proxy',
      init: { method: 'POST', body: proxyBody },
    },
  ];

  // Fallback: direct Overpass endpoints
  for (const ep of OVERPASS_DIRECT_ENDPOINTS) {
    const bodyParams = new URLSearchParams();
    bodyParams.append('data', query);
    endpoints.push({
      url: ep,
      init: { method: 'POST', body: bodyParams },
    });
  }

  for (const { url, init } of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`Overpass endpoint ${url} returned ${response.status}, trying next...`);
        continue;
      }

      const data = await response.json();
      if (!data || !data.elements || data.elements.length === 0) {
        // Valid response but no roads found — cache this as a real result
        overpassCache = { lat, lon, result: null, timestamp: Date.now() };
        return null;
      }

      const ways = data.elements.filter((el: any) => el.type === 'way' && el.tags);
      if (ways.length === 0) {
        overpassCache = { lat, lon, result: null, timestamp: Date.now() };
        return null;
      }

      // Separate ways with an explicit maxspeed tag from those without
      const waysWithMaxspeed = ways.filter((w: any) => w.tags.maxspeed);
      const candidateWays = waysWithMaxspeed.length > 0 ? waysWithMaxspeed : ways;

      // From candidates, pick the one whose speed most closely matches the car's current OSRM segment speed
      let selectedWay = candidateWays[0];
      let minDifference = Infinity;

      for (const way of candidateWays) {
        const parsedSpeed = parseMaxspeedToMps(way.tags.maxspeed, way.tags.highway, osrmSpeedMps);
        const diff = Math.abs(parsedSpeed - osrmSpeedMps);
        if (diff < minDifference) {
          minDifference = diff;
          selectedWay = way;
        }
      }

      const hasMaxspeed = !!selectedWay.tags.maxspeed;
      const hasHighway = !!selectedWay.tags.highway;

      // Robust Ref Extraction: If the selected sub-segment (like an HOV lane) is missing the 'ref' tag,
      // scan all nearby ways to find the parent highway's ref.
      let extractedRef = selectedWay.tags.ref || null;
      if (!extractedRef) {
        if (selectedWay.tags.name) {
          const match = ways.find((w: any) => w.tags.name === selectedWay.tags.name && w.tags.ref);
          if (match) extractedRef = match.tags.ref;
        }
        if (!extractedRef && (selectedWay.tags.highway === 'motorway' || selectedWay.tags.highway === 'trunk')) {
          const match = ways.find((w: any) => (w.tags.highway === 'motorway' || w.tags.highway === 'trunk') && w.tags.ref);
          if (match) extractedRef = match.tags.ref;
        }
      }

      const result: OverpassRoadData = {
        maxspeed: selectedWay.tags.maxspeed || null,
        highway: selectedWay.tags.highway || null,
        name: selectedWay.tags.name || null,
        ref: extractedRef,
        confident: hasMaxspeed || hasHighway,
      };
      overpassCache = { lat, lon, result, timestamp: Date.now() };
      return result;
    } catch (error) {
      console.warn(`Overpass endpoint ${url} failed:`, error);
      continue; // Try next endpoint
    }
  }

  // All endpoints exhausted
  console.error('All Overpass API endpoints failed');
  return null;
}

export interface WeatherData {
  temp: number;
  code: number;
  text: string;
  icon: string;
  sunrise?: string;
  sunset?: string;
}

/**
 * Fetches current weather from the free, public Open-Meteo API at the given coordinates.
 */
export async function fetchCurrentWeather(lat: number, lon: number): Promise<WeatherData | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=fahrenheit&daily=sunrise,sunset&timezone=auto&forecast_days=1`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Open-Meteo query failed with status: ${response.status}`);
    }
    const data = await response.json();
    if (!data || !data.current) return null;

    const temp = data.current.temperature_2m;
    const code = data.current.weather_code;

    // Convert code to text & icon
    const { text, icon } = getWeatherInfo(code);

    const sunrise = data.daily?.sunrise?.[0] || undefined;
    const sunset = data.daily?.sunset?.[0] || undefined;

    return { temp, code, text, icon, sunrise, sunset };
  } catch (error) {
    console.error('Weather service error:', error);
    return null;
  }
}

function getWeatherInfo(code: number): { text: string; icon: string } {
  if (code === 0) return { text: 'Clear Sky', icon: '☀️' };
  if (code === 1 || code === 2 || code === 3) return { text: 'Partly Cloudy', icon: '⛅' };
  if (code === 45 || code === 48) return { text: 'Foggy', icon: '🌫️' };
  if (code === 51 || code === 53 || code === 55 || code === 56 || code === 57) return { text: 'Drizzle', icon: '🌧️' };
  if (code === 61 || code === 63 || code === 65 || code === 66 || code === 67 || code === 80 || code === 81 || code === 82) return { text: 'Rainy', icon: '🌧️' };
  if (code === 71 || code === 73 || code === 75 || code === 77 || code === 85 || code === 86) return { text: 'Snowy', icon: '❄️' };
  if (code === 95 || code === 96 || code === 99) return { text: 'Thunderstorm', icon: '⛈️' };
  return { text: 'Overcast', icon: '☁️' };
}

export interface AutocompleteResult {
  name: string;
  lat: number;
  lon: number;
}

export async function searchLocations(query: string): Promise<AutocompleteResult[]> {
  if (!query.trim()) return [];
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      query
    )}&format=json&limit=5&addressdetails=1`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'RealTimeDrivingSimulator/1.0 (ambient-dashboard-agentic-dev)',
        'Accept-Language': 'en',
      },
    });

    if (!response.ok) {
      throw new Error(`Nominatim search failed: ${response.status}`);
    }

    const data = await response.json();
    if (!data) return [];
    
    return data.map((item: any) => ({
      name: item.display_name,
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon)
    }));
  } catch (error) {
    console.error('Search locations error:', error);
    return [];
  }
}

