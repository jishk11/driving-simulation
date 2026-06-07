import { useState, useEffect, useRef } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { Dashboard } from './components/Dashboard';
import { MapDisplay } from './components/MapDisplay';
import { WeatherOverlay } from './components/WeatherOverlay';
import { geocodeAddress, fetchRoute, fetchNearestRoadData, fetchCurrentWeather } from './services/navigation';
import type { WeatherData } from './services/navigation';
import { buildCumulativeDurations, interpolatePositionByTime, parseMaxspeedToMps, getHaversineDistance } from './utils/geo';

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

  // Live Weather state
  const [weather, setWeather] = useState<WeatherData | null>(null);

  // Time-tracking states for background-resilient interpolation:
  const [virtualElapsedMs, setVirtualElapsedMs] = useState<number>(0);
  const [lastUpdateRealTime, setLastUpdateRealTime] = useState<number>(0);

  // Refs for tracking throttled Overpass API queries:
  const lastOverpassQueryTime = useRef<number>(0);
  const lastQuerySegmentIndex = useRef<number>(-1);
  const isFetchingOverpass = useRef<boolean>(false);

  // Refs for tracking throttled Open-Meteo weather API queries:
  const lastWeatherQueryTime = useRef<number>(0);
  const lastWeatherPosition = useRef<[number, number] | null>(null);
  const isFetchingWeather = useRef<boolean>(false);

  // Keep references for values accessed inside the requestAnimationFrame loop to prevent stale closures
  const stateRef = useRef({
    status,
    route,
    cumulativeDurations,
    speeds,
    durations,
    duration,
    distance,
    virtualElapsedMs,
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
      virtualElapsedMs,
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
    virtualElapsedMs,
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
    setVirtualElapsedMs(0);
    
    // Reset Overpass refs
    lastOverpassQueryTime.current = 0;
    lastQuerySegmentIndex.current = -1;
    isFetchingOverpass.current = false;
    
    // Reset Weather refs
    lastWeatherQueryTime.current = 0;
    lastWeatherPosition.current = null;
    isFetchingWeather.current = false;
    setWeather(null);
  };

  // Pause simulation
  const handlePause = () => {
    if (status !== 'driving') return;
    const now = Date.now();
    const currentRef = stateRef.current;
    
    // Checkpoint the virtual elapsed progress up to this exact millisecond
    const deltaReal = now - currentRef.lastUpdateRealTime;
    const addedVirtualMs = deltaReal * currentRef.speedMultiplier;
    const totalVirtualElapsed = currentRef.virtualElapsedMs + addedVirtualMs;

    setVirtualElapsedMs(totalVirtualElapsed);
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
    const addedVirtualMs = deltaReal * currentRef.speedMultiplier;
    const totalVirtualElapsed = currentRef.virtualElapsedMs + addedVirtualMs;

    setVirtualElapsedMs(totalVirtualElapsed);
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
    setSpeedLimitMps(0);
    setIsSpeedLimitFallback(true);
    setCurrentSegmentIndex(0);
    setCurrentStreetName(null);
    setCurrentStreetRef(null);
    setWeather(null);
    setVirtualElapsedMs(0);
    setLastUpdateRealTime(0);
    
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
      const currentVirtualElapsed = currentRef.virtualElapsedMs + deltaReal * currentRef.speedMultiplier;

      const elapsedSeconds = currentVirtualElapsed / 1000;
      const totalDurationSeconds = currentRef.duration;

      // Check if drive is finished
      if (elapsedSeconds >= totalDurationSeconds) {
        setCarPosition(currentRef.route[currentRef.route.length - 1]);
        setCurrentSpeedMph(0);
        setSpeedLimitMps(0);
        setVirtualElapsedMs(totalDurationSeconds * 1000);
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
            } else {
              // No road data found — use heuristic fallback
              const fallbackSpeed = parseMaxspeedToMps(null, null, osrmSpeedMps);
              setSpeedLimitMps(fallbackSpeed);
              setIsSpeedLimitFallback(true);
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
      const baseSpeedMph = osrmSpeedMps * 2.236936;
      const waveNoiseMph = Math.sin(now / 1200) * 2.0 + Math.cos(now / 3200) * 0.8;
      const simulatedSpeedMph = baseSpeedMph > 0 ? Math.max(5, baseSpeedMph + waveNoiseMph) : 0;
      setCurrentSpeedMph(simulatedSpeedMph);

      setVirtualElapsedMs(currentVirtualElapsed);
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
  const offsetHours = isDstActive ? baseOffset + 1 : baseOffset;
  
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

  let calculatedDarkMode = false;
  if (weather && weather.sunrise && weather.sunset) {
    const sunriseDecimal = parseLocalTimeDecimal(weather.sunrise);
    const sunsetDecimal = parseLocalTimeDecimal(weather.sunset);
    calculatedDarkMode = localRealTimeDecimal < sunriseDecimal || localRealTimeDecimal > sunsetDecimal;
  } else {
    // Graceful fallback to mathematical solar time
    calculatedDarkMode = localRealHour < 6 || localRealHour >= 20;
  }
  const isDarkMode = calculatedDarkMode;

  const speedLimitMph = speedLimitMps > 0 
    ? Math.max(15, Math.round((speedLimitMps * 2.236936) / 5) * 5) 
    : 0;




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
        />
        {/* Hardware-accelerated Atmospheric weather effects (positioned below HUD card overlays) */}
        <WeatherOverlay weather={weather} isDarkMode={isDarkMode} />
      </div>

      {/* Floating Street Name UI (Bottom Middle) */}
      {(status === 'driving' || status === 'paused') && (currentStreetName || currentStreetRef) && (
        <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] px-5 py-2.5 rounded-full flex items-center justify-center gap-2.5 shadow-xl backdrop-blur-md border animate-fade-in transition-all duration-500 ${
          isDarkMode 
            ? 'bg-slate-900/80 border-slate-700/60 text-white shadow-black/50' 
            : 'bg-white/90 border-slate-200/80 text-slate-900 shadow-slate-300/50'
        }`}>
          {currentStreetRef && (
            <div className="flex items-center justify-center bg-blue-600 text-white text-xs font-black px-2 py-0.5 rounded shadow-sm border border-blue-500/50">
              {currentStreetRef.split(';')[0]}
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
        elapsedMs={virtualElapsedMs}
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
      />
    </div>
  );
}

export default App;
