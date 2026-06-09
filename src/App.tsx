import { useState, useEffect, useRef } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { Dashboard } from './components/Dashboard';
import { MapDisplay } from './components/MapDisplay';
import { WeatherOverlay } from './components/WeatherOverlay';
import { geocodeAddress, fetchRoute, fetchNearestRoadData, fetchCurrentWeather } from './services/navigation';
import type { WeatherData } from './services/navigation';
import { buildCumulativeDurations, interpolatePositionByTime, parseMaxspeedToMps, getHaversineDistance, calculateBearing } from './utils/geo';

function App() {
  // Navigation & route states
  const [originInput, setOriginInput] = useState('');
  const [destinationInput, setDestinationInput] = useState('');
  const [route, setRoute] = useState<[number, number][]>([]);
  const [distance, setDistance] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  
  // Speed limits and durations along route segments
  const [speeds, setSpeeds] = useState<number[]>([]);
  const [durations, setDurations] = useState<number[]>([]);
  const [cumulativeDurations, setCumulativeDurations] = useState<number[]>([]);

  // Simulation status states
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'driving' | 'paused' | 'completed'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Animation telemetry states
  const [carPosition, setCarPosition] = useState<[number, number] | null>(null);
  const [carBearing, setCarBearing] = useState<number>(0);
  const [lockCamera, setLockCamera] = useState<boolean>(true);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const [currentSpeedMph, setCurrentSpeedMph] = useState<number>(0);
  const [speedLimitMps, setSpeedLimitMps] = useState<number>(0);
  const [isSpeedLimitFallback, setIsSpeedLimitFallback] = useState<boolean>(true);

  // Visual tracking
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [currentStreetName, setCurrentStreetName] = useState<string | null>(null);
  const [currentStreetRef, setCurrentStreetRef] = useState<string | null>(null);
  const [currentStreetDirection, setCurrentStreetDirection] = useState<string | null>(null);

  // Live Weather state
  const [weather, setWeather] = useState<WeatherData | null>(null);

  // Time-tracking states for background-resilient interpolation:
  const [trueElapsedMs, setTrueElapsedMs] = useState<number>(0);
  const [virtualProgressMs, setVirtualProgressMs] = useState<number>(0);
  const [lastUpdateRealTime, setLastUpdateRealTime] = useState<number>(0);

  // Refs for tracking throttled Overpass API queries:
  const lastOverpassQueryTime = useRef<number>(0);
  const lastQuerySegmentIndex = useRef<number>(-1);
  const isFetchingOverpass = useRef<boolean>(false);

  // Refs for tracking throttled Open-Meteo weather API queries:
  const lastWeatherQueryTime = useRef<number>(0);
  const lastWeatherPosition = useRef<[number, number] | null>(null);
  const isFetchingWeather = useRef<boolean>(false);

  // Refs for locking the cardinal bound of the current highway to prevent jitter
  const lockedHighwayBoundRef = useRef<string>('');
  const lastSeenRefRef = useRef<string | null>(null);

  // Live Traffic Simulation state (only active at 1x speed)
  const liveTrafficRef = useRef({
    multiplier: 1.0,
    target: 1.0,
    lastUpdate: 0,
  });

  // Keep references for values accessed inside the requestAnimationFrame loop to prevent stale closures
  const stateRef = useRef({
    status,
    route,
    cumulativeDurations,
    speeds,
    durations,
    duration,
    distance,
    trueElapsedMs,
    virtualProgressMs,
    lastUpdateRealTime,
    speedMultiplier,
    speedLimitMps,
  });

  // Keep stateRef in sync with actual state variables
  useEffect(() => {
    stateRef.current = {
      status,
      route,
      cumulativeDurations,
      speeds,
      durations,
      duration,
      distance,
      trueElapsedMs,
      virtualProgressMs,
      lastUpdateRealTime,
      speedMultiplier,
      speedLimitMps,
    };
  }, [
    status,
    route,
    cumulativeDurations,
    speeds,
    durations,
    duration,
    distance,
    trueElapsedMs,
    virtualProgressMs,
    lastUpdateRealTime,
    speedMultiplier,
    speedLimitMps,
  ]);

  // Geocoding and Routing handler
  const handleCalculateRoute = async () => {
    setStatus('loading');
    setError(null);
    try {
      const originData = await geocodeAddress(originInput);
      if (!originData) {
        setError(`Could not find origin location: "${originInput}"`);
        setStatus('idle');
        return;
      }

      const destData = await geocodeAddress(destinationInput);
      if (!destData) {
        setError(`Could not find destination location: "${destinationInput}"`);
        setStatus('idle');
        return;
      }

      const routeData = await fetchRoute(
        [originData.lat, originData.lon],
        [destData.lat, destData.lon]
      );

      if (!routeData || routeData.coordinates.length < 2) {
        setError('No drivable road route found between these locations.');
        setStatus('idle');
        return;
      }

      setRoute(routeData.coordinates);
      setDistance(routeData.distance);
      setDuration(routeData.duration);
      setSpeeds(routeData.speeds);
      setDurations(routeData.durations);
      
      const cumDurs = buildCumulativeDurations(routeData.durations);
      setCumulativeDurations(cumDurs);

      // Set initial car position & bearing & fallback speed limit
      const firstCoord = routeData.coordinates[0];
      setCarPosition(firstCoord);
      
      const initialFallbackSpeed = parseMaxspeedToMps(null, null, routeData.speeds[0] || 0);
      setSpeedLimitMps(initialFallbackSpeed);
      setIsSpeedLimitFallback(true);
      
      if (routeData.coordinates.length > 1) {
        const nextCoord = routeData.coordinates[1];
        const dy = nextCoord[0] - firstCoord[0];
        const dx = nextCoord[1] - firstCoord[1];
        const initialBearing = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
        setCarBearing(initialBearing);
      }

      // Fetch initial weather for the origin immediately so ambient mode (day/night) updates
      fetchCurrentWeather(firstCoord[0], firstCoord[1])
        .then((weatherData) => {
          if (weatherData) {
            setWeather(weatherData);
            lastWeatherQueryTime.current = Date.now();
            lastWeatherPosition.current = firstCoord;
          }
        })
        .catch((err) => {
          console.error('Initial weather fetch failed:', err);
        });

      setStatus('ready');
    } catch (err) {
      console.error(err);
      setError('An error occurred while fetching routing data. Please check your network and try again.');
      setStatus('idle');
    }
  };

  // Start driving simulation
  const handleStartDrive = () => {
    const now = Date.now();
    setStartTimeState(now);
    setStatus('driving');
  };

  const setStartTimeState = (time: number) => {
    setLastUpdateRealTime(time);
    setTrueElapsedMs(0);
    setVirtualProgressMs(0);
    
    // Reset Overpass refs
    lastOverpassQueryTime.current = 0;
    lastQuerySegmentIndex.current = -1;
    isFetchingOverpass.current = false;
    
    // Reset Weather refs (keep the initial weather fetched at route calculation to avoid theme flashes)
    isFetchingWeather.current = false;
  };

  // Pause simulation
  const handlePause = () => {
    if (status !== 'driving') return;
    const now = Date.now();
    const currentRef = stateRef.current;
    
    // Checkpoint the elapsed progress up to this exact millisecond
    const deltaReal = now - currentRef.lastUpdateRealTime;
    const addedTrueMs = deltaReal * currentRef.speedMultiplier;
    const addedVirtualMs = addedTrueMs * liveTrafficRef.current.multiplier;
    
    setTrueElapsedMs(currentRef.trueElapsedMs + addedTrueMs);
    setVirtualProgressMs(currentRef.virtualProgressMs + addedVirtualMs);

    setLastUpdateRealTime(now);
    setCurrentSpeedMph(0);
    setStatus('paused');
  };

  // Resume simulation (shifts absolute timing reference)
  const handleResume = () => {
    if (status !== 'paused') return;
    const now = Date.now();
    setLastUpdateRealTime(now);
    setStatus('driving');
  };

  // Change speed multiplier without displacement jumps
  const handleSetSpeedMultiplier = (newMultiplier: number) => {
    if (status !== 'driving' && status !== 'paused') {
      setSpeedMultiplier(newMultiplier);
      return;
    }

    const now = Date.now();
    const currentRef = stateRef.current;
    
    const deltaReal = now - currentRef.lastUpdateRealTime;
    const addedTrueMs = deltaReal * currentRef.speedMultiplier;
    const addedVirtualMs = addedTrueMs * liveTrafficRef.current.multiplier;

    setTrueElapsedMs(currentRef.trueElapsedMs + addedTrueMs);
    setVirtualProgressMs(currentRef.virtualProgressMs + addedVirtualMs);
    
    setLastUpdateRealTime(now);
    setSpeedMultiplier(newMultiplier);
  };

  // Reset all simulation and route state
  const handleReset = () => {
    setStatus('idle');
    setRoute([]);
    setDistance(0);
    setDuration(0);
    setSpeeds([]);
    setDurations([]);
    setCumulativeDurations([]);
    setCarPosition(null);
    setCarBearing(0);
    setSpeedMultiplier(1);
    setCurrentSpeedMph(0);
    setTrueElapsedMs(0);
    setVirtualProgressMs(0);
    setLastUpdateRealTime(0);
    setIsSpeedLimitFallback(true);
    setCurrentSegmentIndex(0);
    setCurrentStreetName(null);
    setCurrentStreetRef(null);
    setCurrentStreetDirection(null);
    setWeather(null);
    
    lastOverpassQueryTime.current = 0;
    lastQuerySegmentIndex.current = -1;
    isFetchingOverpass.current = false;

    lastWeatherQueryTime.current = 0;
    lastWeatherPosition.current = null;
    isFetchingWeather.current = false;
    setError(null);
  };

  // Running the animation loop
  useEffect(() => {
    if (status !== 'driving') return;

    let animId: number;

    const tick = () => {
      const currentRef = stateRef.current;
      if (currentRef.status !== 'driving') return;

      const now = Date.now();
      const deltaReal = now - currentRef.lastUpdateRealTime;

      // Live 1x Traffic Dilation (drifts between 0.8x and 1.2x)
      let currentLiveMultiplier = 1.0;
      if (currentRef.speedMultiplier === 1) {
        if (now - liveTrafficRef.current.lastUpdate > 10000) { // Pick new target every 10 real seconds
          liveTrafficRef.current.target = 0.8 + Math.random() * 0.4;
          liveTrafficRef.current.lastUpdate = now;
        }
        // Smoothly lerp towards target
        liveTrafficRef.current.multiplier += (liveTrafficRef.current.target - liveTrafficRef.current.multiplier) * 0.01;
        currentLiveMultiplier = liveTrafficRef.current.multiplier;
      } else {
        // Bypass at high speeds to protect predictable math
        liveTrafficRef.current.multiplier = 1.0;
      }

      const currentTrueElapsed = currentRef.trueElapsedMs + deltaReal * currentRef.speedMultiplier;
      const currentVirtualProgress = currentRef.virtualProgressMs + deltaReal * currentRef.speedMultiplier * currentLiveMultiplier;

      const elapsedSeconds = currentVirtualProgress / 1000;
      const totalDurationSeconds = currentRef.duration;

      // Check if drive is finished
      if (elapsedSeconds >= totalDurationSeconds) {
        setCarPosition(currentRef.route[currentRef.route.length - 1]);
        setCurrentSpeedMph(0);
        setSpeedLimitMps(0);
        setTrueElapsedMs(currentTrueElapsed);
        setVirtualProgressMs(totalDurationSeconds * 1000);
        setStatus('completed');
        return;
      }

      // Perform interpolation along the polyline path by travel time
      const { position, bearing, segmentIndex: _segmentIndex, speedMps: osrmSpeedMps } = interpolatePositionByTime(
        currentRef.route,
        currentRef.cumulativeDurations,
        elapsedSeconds,
        currentRef.speeds
      );

      setCarPosition(position);
      setCarBearing(bearing);
      setCurrentSegmentIndex(_segmentIndex);

      // --- Overpass Speed Limit Fetch Logic with 3-second real-world throttle ---
      // Query purely on a time basis. Never reset a good Overpass result to fallback between queries.
      const nowOverpass = Date.now();
      if (nowOverpass - lastOverpassQueryTime.current > 3000 && !isFetchingOverpass.current) {
        lastOverpassQueryTime.current = nowOverpass;
        isFetchingOverpass.current = true;

        fetchNearestRoadData(position[0], position[1], osrmSpeedMps)
          .then((result) => {
            isFetchingOverpass.current = false;
            if (result) {
              const parsedSpeed = parseMaxspeedToMps(result.maxspeed, result.highway, osrmSpeedMps);
              setSpeedLimitMps(parsedSpeed);
              setIsSpeedLimitFallback(!result.confident);
              setCurrentStreetName(result.name || null);
              setCurrentStreetRef(result.ref || null);
              setCurrentStreetDirection(result.direction || null);
            } else {
              // No road data found — use heuristic fallback
              const fallbackSpeed = parseMaxspeedToMps(null, null, osrmSpeedMps);
              setSpeedLimitMps(fallbackSpeed);
              setIsSpeedLimitFallback(true);
              setCurrentStreetDirection(null);
            }
          })
          .catch((err) => {
            isFetchingOverpass.current = false;
            console.error('Overpass background fetch failed:', err);
          });
      }

      // --- Open-Meteo Live Weather Integration with 5-minute / 20-mile throttle ---
      const nowReal = Date.now();
      let shouldFetchWeather = false;

      if (lastWeatherQueryTime.current === 0 || !lastWeatherPosition.current) {
        shouldFetchWeather = true;
      } else {
        const timeElapsedMs = nowReal - lastWeatherQueryTime.current;
        const distanceMeters = getHaversineDistance(position, lastWeatherPosition.current);
        const distanceMiles = distanceMeters * 0.000621371;

        if (timeElapsedMs > 5 * 60 * 1000 || distanceMiles >= 20) {
          shouldFetchWeather = true;
        }
      }

      if (shouldFetchWeather && !isFetchingWeather.current) {
        isFetchingWeather.current = true;
        lastWeatherQueryTime.current = nowReal;
        lastWeatherPosition.current = position;

        fetchCurrentWeather(position[0], position[1])
          .then((weatherData) => {
            isFetchingWeather.current = false;
            if (weatherData) {
              setWeather(weatherData);
            }
          })
          .catch((err) => {
            isFetchingWeather.current = false;
            console.error('Weather update failed:', err);
          });
      }

      // Simulate a realistic driving speed: actual physical speed (in MPH) + minor wave noise
      // This accurately reflects any traffic flow multipliers applied in the routing engine
      // We also multiply by currentLiveMultiplier to ensure the HUD dynamically matches the 1x Time Dilation
      const baseSpeedMph = osrmSpeedMps * currentLiveMultiplier * 2.236936;
      const waveNoiseMph = Math.sin(now / 4000) * 2.0 + Math.cos(now / 7000) * 0.8;
      const simulatedSpeedMph = baseSpeedMph > 0 ? Math.max(5, baseSpeedMph + waveNoiseMph) : 0;
      setCurrentSpeedMph(simulatedSpeedMph);

      setTrueElapsedMs(currentTrueElapsed);
      setVirtualProgressMs(currentVirtualProgress);
      setLastUpdateRealTime(now);

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [status]);

  // Calculate Dynamic Day/Night state based on real-world local time at car's longitude
  const realTime = Date.now();
  const realDate = new Date(realTime);
  
  // Use current car position, staged route origin, or default center of the US
  let activeLongitude = -95.7129; // default center of US
  if (carPosition) {
    activeLongitude = carPosition[1];
  } else if (route.length > 0) {
    activeLongitude = route[0][1];
  }
  
  // Detect if browser system is currently in DST to adjust solar time
  const systemDate = new Date();
  const jan = new Date(systemDate.getFullYear(), 0, 1).getTimezoneOffset();
  const jul = new Date(systemDate.getFullYear(), 6, 1).getTimezoneOffset();
  const isDstActive = systemDate.getTimezoneOffset() < Math.max(jan, jul);
  
  const baseOffset = Math.round(activeLongitude / 15);
  let offsetHours = isDstActive ? baseOffset + 1 : baseOffset;
  if (weather && typeof weather.timezoneOffset === 'number') {
    offsetHours = weather.timezoneOffset / 3600;
  }
  
  // Calculate local hour & decimal time at coordinate based on UTC real time
  const utcHours = realDate.getUTCHours();
  const utcMinutes = realDate.getUTCMinutes();
  const localRealHour = (utcHours + offsetHours + 24) % 24;
  const localRealTimeDecimal = localRealHour + utcMinutes / 60;

  // Parse local time (HH:MM) from the ISO string "YYYY-MM-DDTHH:MM"
  const parseLocalTimeDecimal = (str: string): number => {
    const parts = str.split('T');
    if (parts.length < 2) return 0;
    const timeParts = parts[1].split(':');
    const hr = parseInt(timeParts[0]);
    const min = parseInt(timeParts[1]);
    return hr + min / 60;
  };

  // Define Twilight buffer constant (45 minutes = 0.75 hours)
  const TWILIGHT_WINDOW = 0.75;
  let ambientMode: 'day' | 'night' | 'dawn' | 'dusk' = 'day';

  let sunriseDecimal = 6.0;
  let sunsetDecimal = 20.0;

  if (weather && weather.sunrise && weather.sunset) {
    sunriseDecimal = parseLocalTimeDecimal(weather.sunrise);
    sunsetDecimal = parseLocalTimeDecimal(weather.sunset);
    
    if (localRealTimeDecimal >= sunriseDecimal - TWILIGHT_WINDOW && localRealTimeDecimal <= sunriseDecimal + TWILIGHT_WINDOW) {
      ambientMode = 'dawn';
    } else if (localRealTimeDecimal >= sunsetDecimal - TWILIGHT_WINDOW && localRealTimeDecimal <= sunsetDecimal + TWILIGHT_WINDOW) {
      ambientMode = 'dusk';
    } else if (localRealTimeDecimal > sunriseDecimal + TWILIGHT_WINDOW && localRealTimeDecimal < sunsetDecimal - TWILIGHT_WINDOW) {
      ambientMode = 'day';
    } else {
      ambientMode = 'night';
    }
  } else {
    // Graceful fallback to mathematical solar time (assuming Sunrise = 6:00 AM, Sunset = 8:00 PM)
    const fallbackSunrise = 6.0;
    const fallbackSunset = 20.0;
    
    if (localRealTimeDecimal >= fallbackSunrise - TWILIGHT_WINDOW && localRealTimeDecimal <= fallbackSunrise + TWILIGHT_WINDOW) {
      ambientMode = 'dawn';
    } else if (localRealTimeDecimal >= fallbackSunset - TWILIGHT_WINDOW && localRealTimeDecimal <= fallbackSunset + TWILIGHT_WINDOW) {
      ambientMode = 'dusk';
    } else if (localRealTimeDecimal > fallbackSunrise + TWILIGHT_WINDOW && localRealTimeDecimal < fallbackSunset - TWILIGHT_WINDOW) {
      ambientMode = 'day';
    } else {
      ambientMode = 'night';
    }
    sunriseDecimal = fallbackSunrise;
    sunsetDecimal = fallbackSunset;
  }

  // Night weather icons are shown if local time is before sunrise or after sunset
  const showNightIcons = localRealTimeDecimal <= sunriseDecimal || localRealTimeDecimal >= sunsetDecimal;

  // NIGHT, DAWN, and DUSK all resolve to dark mode for compatibility with standard component styles
  const isDarkMode = ambientMode === 'night' || ambientMode === 'dawn' || ambientMode === 'dusk';

  const speedLimitMph = speedLimitMps > 0 
    ? Math.max(15, Math.round((speedLimitMps * 2.236936) / 5) * 5) 
    : 0;

  const isCoordinateInUS = (lat: number, lon: number): boolean => {
    // Contiguous US: Lat [24, 50], Lon [-125, -66]
    const inContiguous = lat >= 24.0 && lat <= 50.0 && lon >= -125.0 && lon <= -66.0;
    // Alaska: Lat [51, 72], Lon [-180, -120]
    const inAlaska = lat >= 51.0 && lat <= 72.0 && lon >= -180.0 && lon <= -120.0;
    // Hawaii: Lat [18, 29], Lon [-180, -150]
    const inHawaii = lat >= 18.0 && lat <= 29.0 && lon >= -180.0 && lon <= -150.0;
    
    return inContiguous || inAlaska || inHawaii;
  };

  const getHighwayBound = (_ref: string, routeData: [number, number][], currentIndex: number, osmDirection: string | null) => {
    if (!routeData || routeData.length === 0) return '';
    
    // If we have an OSM direction, prioritize it and update the lock
    if (osmDirection) {
      lastSeenRefRef.current = _ref;
      lockedHighwayBoundRef.current = osmDirection;
      return osmDirection;
    }

    // Lock the cardinal bound the first time we enter a new highway.
    // To prevent locking in a bad direction due to local curves or cloverleafs,
    // we calculate the "macro bearing" by looking up to 500 coordinate segments into the future!
    if (_ref !== lastSeenRefRef.current) {
      lastSeenRefRef.current = _ref;
      
      let p1 = routeData[currentIndex];
      const lookAheadIndex = Math.min(currentIndex + 500, routeData.length - 1);
      if (lookAheadIndex === currentIndex && currentIndex > 0) {
        p1 = routeData[currentIndex - 1];
      }
      const p2 = routeData[lookAheadIndex];
      
      let bound = '';
      if (p1 && p2 && (p1[0] !== p2[0] || p1[1] !== p2[1])) {
        const macroBearing = calculateBearing(p1, p2);
        
        // Clean ref to examine the primary route identifier
        const primaryRef = _ref.split(';')[0];
        const match = primaryRef.match(/\d+/);
        
        // Only apply odd/even highway designation rules if we are driving in the US
        if (match && isCoordinateInUS(p1[0], p1[1])) {
          const num = parseInt(match[0], 10);
          const isEven = num % 2 === 0;
          
          if (isEven) {
            // Even-numbered highways run East-West
            bound = (macroBearing >= 0 && macroBearing < 180) ? 'EAST' : 'WEST';
          } else {
            // Odd-numbered highways run North-South
            bound = (macroBearing >= 270 || macroBearing < 90) ? 'NORTH' : 'SOUTH';
          }
        } else {
          // Fallback to standard 4-way direction based on heading for unnumbered routes and non-US highways
          if (macroBearing >= 315 || macroBearing < 45) bound = 'NORTH';
          else if (macroBearing >= 45 && macroBearing < 135) bound = 'EAST';
          else if (macroBearing >= 135 && macroBearing < 225) bound = 'SOUTH';
          else if (macroBearing >= 225 && macroBearing < 315) bound = 'WEST';
        }
      }
      lockedHighwayBoundRef.current = bound;
    }
    return lockedHighwayBoundRef.current;
  };


  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 flex flex-col">
      {/* Leaflet Map display takes full viewport background */}
      <div className="flex-1 w-full h-full relative z-0">
        <MapDisplay
          route={route}
          currentSegmentIndex={currentSegmentIndex}
          carPosition={carPosition}
          carBearing={carBearing}
          lockCamera={lockCamera}
          isDarkMode={isDarkMode}
          ambientMode={ambientMode}
          status={status}
        />
        
        {/* Ambient Twilight Gradients (Cross-fading with pointer-events-none) */}
        <div className={`absolute inset-0 pointer-events-none z-[10] transition-opacity duration-1000 bg-gradient-to-b from-[#1a233d]/60 via-[#6c5b7b]/40 to-[#f8b195]/30 ${
          ambientMode === 'dawn' ? 'opacity-100' : 'opacity-0'
        }`} />
        <div className={`absolute inset-0 pointer-events-none z-[10] transition-opacity duration-1000 bg-gradient-to-b from-[#2e3856]/60 via-[#796782]/45 to-[#b98380]/40 ${
          ambientMode === 'dusk' ? 'opacity-100' : 'opacity-0'
        }`} />
        <div className={`absolute inset-0 pointer-events-none z-[10] transition-opacity duration-1000 bg-slate-950/15 ${
          ambientMode === 'night' ? 'opacity-100' : 'opacity-0'
        }`} />

        {/* Hardware-accelerated Atmospheric weather effects (positioned below HUD card overlays) */}
        <WeatherOverlay weather={weather} isDarkMode={isDarkMode} />
      </div>

      {/* Floating Street Name UI (Bottom Middle) */}
      {(status === 'driving' || status === 'paused') && (currentStreetName || currentStreetRef) && (
        <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] px-5 py-2.5 rounded-full flex items-center justify-center gap-2.5 shadow-xl backdrop-blur-md border animate-fade-in transition-all duration-500 ${
          ambientMode === 'day'
            ? 'bg-white/90 border-slate-200/80 text-slate-900 shadow-slate-300/50'
            : ambientMode === 'dawn'
            ? 'bg-[#1a233d]/80 border-[#f8b195]/30 text-[#f8b195] shadow-indigo-950/50'
            : ambientMode === 'dusk'
            ? 'bg-[#2e3856]/80 border-[#b98380]/30 text-[#b98380] shadow-black/50'
            : 'bg-slate-900/80 border-slate-700/60 text-white shadow-black/50'
        }`}>
          {currentStreetRef && (
            <div className="flex items-center justify-center bg-blue-600 text-white text-xs font-black px-2.5 py-0.5 rounded shadow-sm border border-blue-500/50 tracking-wide">
              {currentStreetRef.split(';')[0].replace(' ', '-')} {getHighwayBound(currentStreetRef, route, currentSegmentIndex, currentStreetDirection)}
            </div>
          )}
          {currentStreetName && (
            <span className="text-sm font-semibold tracking-wide truncate max-w-[300px]">
              {currentStreetName}
            </span>
          )}
        </div>
      )}

      {/* Floating Speed Limit Sign in Top Right (like Google Maps/Apple Maps) */}
      {(status === 'driving' || status === 'paused') && speedLimitMph > 0 && (
        <div 
          className="absolute top-4 right-4 z-[1000] w-14 h-18 bg-white border-2 border-black rounded-lg shadow-xl flex flex-col items-center justify-center p-1 select-none font-sans text-black leading-none animate-pulse-slow"
          title={`Speed Limit: ${speedLimitMph} mph${isSpeedLimitFallback ? ' (Estimated Fallback)' : ''}`}
        >
          <span className="text-[7px] font-black tracking-tight" style={{ fontSize: '7px' }}>SPEED</span>
          <span className="text-[7px] font-black tracking-tight" style={{ fontSize: '7px' }}>LIMIT</span>
          <span 
            className={`text-xl font-black mt-1 tracking-tight flex items-start ${
              isSpeedLimitFallback ? 'text-amber-600' : 'text-black'
            }`} 
            style={{ fontSize: '20px', fontWeight: 900 }}
          >
            {speedLimitMph}
            {isSpeedLimitFallback && <span className="text-[10px] -mt-1 ml-0.5 font-bold text-amber-600">*</span>}
          </span>
        </div>
      )}

      {/* Glassmorphic Control panel (Top Left) */}
      <ControlPanel
        origin={originInput}
        destination={destinationInput}
        setOrigin={setOriginInput}
        setDestination={setDestinationInput}
        onCalculate={handleCalculateRoute}
        onStart={handleStartDrive}
        onPause={handlePause}
        onResume={handleResume}
        onReset={handleReset}
        status={status}
        error={error}
      />

      {/* Glassmorphic Dashboard Panel (Bottom Right) */}
        <Dashboard
          distance={distance}
          duration={duration}
          elapsedMs={trueElapsedMs}
          virtualProgressMs={virtualProgressMs}
          isDriving={status === 'driving' || status === 'paused'}
          isPaused={status === 'paused'}
          isCompleted={status === 'completed'}
          speedMultiplier={speedMultiplier}
          setSpeedMultiplier={handleSetSpeedMultiplier}
          lockCamera={lockCamera}
          setLockCamera={setLockCamera}
          currentSpeedMph={currentSpeedMph}
          weather={weather}
          isDarkMode={isDarkMode}
          isSpeedLimitFallback={isSpeedLimitFallback}
          showNightIcons={showNightIcons}
        />
    </div>
  );
}

export default App;
