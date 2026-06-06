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
    
    // Request full overview, GeoJSON format, and annotations for durations, distances, and speeds
    const url = `https://router.project-osrm.org/route/v1/driving/${originStr};${destStr}?overview=full&geometries=geojson&annotations=duration,distance,speed`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`OSRM routing failed with status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
      return null;
    }

    const route = data.routes[0];
    const rawCoords = route.geometry.coordinates; // [ [lon, lat], [lon, lat], ... ]
    
    // Map OSRM [lon, lat] coordinates to Leaflet [lat, lon] coordinates
    const coordinates = rawCoords.map((c: [number, number]) => [c[1], c[0]] as [number, number]);

    const distance = route.distance;
    const duration = route.duration;
    
    let speeds: number[] = [];
    let durations: number[] = [];
    
    // Attempt to extract segment annotations
    if (route.legs && route.legs[0] && route.legs[0].annotation) {
      const ann = route.legs[0].annotation;
      speeds = ann.speed || [];
      durations = ann.duration || [];
    }

    // Fallback: If annotations are missing, generate uniform segments based on coordinates
    if (coordinates.length > 1 && (speeds.length === 0 || durations.length === 0)) {
      const numSegments = coordinates.length - 1;
      const uniformSpeed = duration > 0 ? distance / duration : 13.8; // default 50 km/h in m/s
      const uniformDuration = duration / numSegments;
      
      speeds = Array(numSegments).fill(uniformSpeed);
      durations = Array(numSegments).fill(uniformDuration);
    }

    return {
      coordinates,
      distance,
      duration,
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
}

/**
 * Queries the Overpass API for the tags of the way nearest to the given lat/lon.
 */
export async function fetchNearestRoadData(
  lat: number,
  lon: number
): Promise<OverpassRoadData | null> {
  try {
    const query = `[out:json][timeout:5];way(around:50,${lat},${lon})[highway];out tags;`;
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'RealTimeDrivingSimulator/1.0 (contact: support-ambient-dashboard@example.com)',
      },
    });

    if (!response.ok) {
      throw new Error(`Overpass API query failed with status: ${response.status}`);
    }

    const data = await response.json();
    if (!data || !data.elements || data.elements.length === 0) {
      return null;
    }

    const ways = data.elements.filter((el: any) => el.type === 'way' && el.tags);
    if (ways.length === 0) return null;

    // Pick the first way that has a maxspeed, or just the first way
    const wayWithSpeed = ways.find((w: any) => w.tags.maxspeed) || ways[0];

    return {
      maxspeed: wayWithSpeed.tags.maxspeed || null,
      highway: wayWithSpeed.tags.highway || null,
    };
  } catch (error) {
    console.error('Overpass API error:', error);
    return null;
  }
}

export interface WeatherData {
  temp: number;
  code: number;
  text: string;
  icon: string;
}

/**
 * Fetches current weather from the free, public Open-Meteo API at the given coordinates.
 */
export async function fetchCurrentWeather(lat: number, lon: number): Promise<WeatherData | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=fahrenheit&forecast_days=1`;
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

    return { temp, code, text, icon };
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

