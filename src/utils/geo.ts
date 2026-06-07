/**
 * Calculates the geodesic distance between two [lat, lon] coordinates using the Haversine formula.
 * Returns the distance in meters.
 */
export function getHaversineDistance(p1: [number, number], p2: [number, number]): number {
  const R = 6371e3; // Earth's radius in meters
  const lat1 = (p1[0] * Math.PI) / 180;
  const lat2 = (p2[0] * Math.PI) / 180;
  const deltaLat = ((p2[0] - p1[0]) * Math.PI) / 180;
  const deltaLon = ((p2[1] - p1[1]) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const clampedA = Math.max(0, Math.min(1, a));
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));

  return R * c;
}

/**
 * Calculates the initial bearing from p1 to p2 in degrees (0 to 360).
 */
export function calculateBearing(p1: [number, number], p2: [number, number]): number {
  const lat1 = (p1[0] * Math.PI) / 180;
  const lat2 = (p2[0] * Math.PI) / 180;
  const lon1 = (p1[1] * Math.PI) / 180;
  const lon2 = (p2[1] * Math.PI) / 180;

  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);

  const bearingRad = Math.atan2(y, x);
  const bearingDeg = ((bearingRad * 180) / Math.PI + 360) % 360;
  return bearingDeg;
}

/**
 * Computes the cumulative distance from the starting node to each node along the route.
 * Returns an array of distance values in meters, corresponding index-by-index with the route.
 */
export function buildCumulativeDistances(route: [number, number][]): number[] {
  const distances: number[] = [0];
  let sum = 0;
  for (let i = 1; i < route.length; i++) {
    sum += getHaversineDistance(route[i - 1], route[i]);
    distances.push(sum);
  }
  return distances;
}

/**
 * Computes the cumulative travel duration (in seconds) up to each coordinate along the route.
 * Returns an array of duration values in seconds, corresponding index-by-index with the route coordinates.
 */
export function buildCumulativeDurations(durations: number[]): number[] {
  const cumulative: number[] = [0];
  let sum = 0;
  for (let i = 0; i < durations.length; i++) {
    sum += durations[i];
    cumulative.push(sum);
  }
  return cumulative;
}

/**
 * Interpolates the [lat, lon] coordinate, bearing, and active speed limit based on elapsed travel time.
 */
export interface TimeInterpolationResult {
  position: [number, number];
  bearing: number;
  segmentIndex: number;
  speedMps: number;
}

export function interpolatePositionByTime(
  route: [number, number][],
  cumulativeDurations: number[],
  elapsedSec: number,
  speeds: number[]
): TimeInterpolationResult {
  if (route.length === 0) {
    return { position: [0, 0], bearing: 0, segmentIndex: 0, speedMps: 0 };
  }
  if (elapsedSec <= 0) {
    const bearing = route.length > 1 ? calculateBearing(route[0], route[1]) : 0;
    const speedMps = speeds.length > 0 ? speeds[0] : 0;
    return { position: route[0], bearing, segmentIndex: 0, speedMps };
  }

  const totalDuration = cumulativeDurations[cumulativeDurations.length - 1];
  if (elapsedSec >= totalDuration) {
    const lastIdx = route.length - 1;
    const bearing = route.length > 1 ? calculateBearing(route[lastIdx - 1], route[lastIdx]) : 0;
    const speedMps = speeds.length > 0 ? speeds[speeds.length - 1] : 0;
    return { position: route[lastIdx], bearing, segmentIndex: lastIdx - 1, speedMps };
  }

  // Binary search to find segmentIndex such that cumulativeDurations[segmentIndex] <= elapsedSec < cumulativeDurations[segmentIndex + 1]
  let low = 0;
  let high = cumulativeDurations.length - 2;
  let segmentIndex = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (cumulativeDurations[mid] <= elapsedSec && elapsedSec <= cumulativeDurations[mid + 1]) {
      segmentIndex = mid;
      break;
    } else if (cumulativeDurations[mid] > elapsedSec) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  const p1 = route[segmentIndex];
  const p2 = route[segmentIndex + 1];
  const t1 = cumulativeDurations[segmentIndex];
  const t2 = cumulativeDurations[segmentIndex + 1];

  const segmentDuration = t2 - t1;
  const t = segmentDuration > 0 ? (elapsedSec - t1) / segmentDuration : 0;

  const lat = p1[0] + t * (p2[0] - p1[0]);
  const lon = p1[1] + t * (p2[1] - p1[1]);
  const bearing = calculateBearing(p1, p2);
  const speedMps = speeds[segmentIndex] || 0;

  return { position: [lat, lon], bearing, segmentIndex, speedMps };
}

/**
 * Parses the Overpass maxspeed tag string and highway class, falling back to OSRM speed data.
 * Returns the speed limit in meters per second (m/s).
 */
export function parseMaxspeedToMps(
  maxspeed: string | null,
  highway: string | null,
  osrmSpeedMps: number
): number {
  if (maxspeed) {
    const clean = maxspeed.toLowerCase().trim();

    // Check if it explicitly specifies units
    const isMph = clean.includes('mph');
    const isKmh = clean.includes('km/h') || clean.includes('kmh') || clean.includes('km');

    // Strip out all letters, spaces, and non-numeric characters (leaving only digits)
    const digitsOnly = clean.replace(/[^\d]/g, '');
    const val = parseInt(digitsOnly, 10);

    if (!isNaN(val) && val > 0) {
      if (isMph) {
        return val * 0.44704; // convert mph to m/s
      }
      if (isKmh) {
        return val / 3.6; // convert km/h to m/s
      }

      // Adaptive unit detection: compare OSRM speed to both options (km/h vs mph)
      const optionKmh = val / 3.6;
      const optionMph = val * 0.44704;
      const diffKmh = Math.abs(optionKmh - osrmSpeedMps);
      const diffMph = Math.abs(optionMph - osrmSpeedMps);

      return diffMph < diffKmh ? optionMph : optionKmh;
    }
  }

  // Fallback 1: Overpass highway tag
  if (highway) {
    const hw = highway.toLowerCase().trim();
    if (hw === 'motorway' || hw === 'trunk' || hw === 'motorway_link' || hw === 'trunk_link') {
      return 65 * 0.44704; // 65 mph in m/s
    }
    if (hw === 'primary' || hw === 'secondary' || hw === 'tertiary') {
      return 45 * 0.44704; // 45 mph in m/s
    }
    return 35 * 0.44704; // 35 mph in m/s
  }

  // Fallback 2: OSRM average speed classification
  // If average speed >= 17 m/s (~38 mph / ~61 km/h), treat as highway (65 mph).
  // Otherwise, treat as standard local street (35 mph).
  return osrmSpeedMps >= 17 ? 65 * 0.44704 : 35 * 0.44704;
}

