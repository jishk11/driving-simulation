import { useState, useEffect, useRef } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { Dashboard } from './components/Dashboard';
import { MapDisplay } from './components/MapDisplay';
import { geocodeAddress, fetchRoute, fetchNearestRoadData } from './services/navigation';
import { buildCumulativeDurations, interpolatePositionByTime, parseMaxspeedToMps } from './utils/geo';

function App() {
  // Navigation & route states
  const [originInput, setOriginInput] = useState('San Diego, CA');
  const [destinationInput, setDestinationInput] = useState('San Francisco, CA');
  const [route, setRoute] = useState<[number, number][]>([]);
  const [distance, setDistance] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  
  // Speed limits and durations along route segments
  const [speeds, setSpeeds] = useState<number[]>([]);
  const [durations, setDurations] = useState<number[]>([]);
  const [cumulativeDurations, setCumulativeDurations] = useState<number[]>([]);

  // Simulation status states
  // 'idle', 'loading', 'ready', 'driving', 'paused', 'completed'
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'driving' | 'paused' | 'completed'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Animation telemetry states
  const [carPosition, setCarPosition] = useState<[number, number] | null>(null);
  const [carBearing, setCarBearing] = useState<number>(0);
  const [lockCamera, setLockCamera] = useState<boolean>(true);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const [currentSpeedKmh, setCurrentSpeedKmh] = useState<number>(0);
  const [speedLimitMps, setSpeedLimitMps] = useState<number>(0);

  // Time-tracking states for background-resilient interpolation:
  const [virtualElapsedMs, setVirtualElapsedMs] = useState<number>(0);
  const [lastUpdateRealTime, setLastUpdateRealTime] = useState<number>(0);

  // Refs for tracking throttled Overpass API queries:
  const lastOverpassQueryTime = useRef<number>(0);
  const lastQuerySegmentIndex = useRef<number>(-1);
  const isFetchingOverpass = useRef<boolean>(false);

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
    lastOverpassQueryTime.current = 0;
    lastQuerySegmentIndex.current = -1;
    isFetchingOverpass.current = false;
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
    setCurrentSpeedKmh(0);
    setStatus('paused');
  };

  // Resume simulation (shifts absolute timing reference)
  const handleResume = () => {
    if (status !== 'paused') return;
    const now = Date.now();
    // Shift checkpoint reference to current time to completely ignore paused interval
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
    setCurrentSpeedKmh(0);
    setSpeedLimitMps(0);
    setVirtualElapsedMs(0);
    setLastUpdateRealTime(0);
    lastOverpassQueryTime.current = 0;
    lastQuerySegmentIndex.current = -1;
    isFetchingOverpass.current = false;
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
        setCurrentSpeedKmh(0);
        setSpeedLimitMps(0);
        setVirtualElapsedMs(totalDurationSeconds * 1000);
        setStatus('completed');
        return;
      }

      // Perform interpolation along the polyline path by travel time
      const { position, bearing, segmentIndex, speedMps: osrmSpeedMps } = interpolatePositionByTime(
        currentRef.route,
        currentRef.cumulativeDurations,
        elapsedSeconds,
        currentRef.speeds
      );

      setCarPosition(position);
      setCarBearing(bearing);

      // --- Overpass Speed Limit Fetch Logic with 3-second real-world throttle ---
      if (segmentIndex !== lastQuerySegmentIndex.current) {
        // 1. Immediately apply realistic fallback to avoid HUD freeze
        const fallbackSpeed = parseMaxspeedToMps(null, null, osrmSpeedMps);
        setSpeedLimitMps(fallbackSpeed);

        // 2. Query Overpass API if throttle has expired
        const nowReal = Date.now();
        if (nowReal - lastOverpassQueryTime.current > 3000 && !isFetchingOverpass.current) {
          lastOverpassQueryTime.current = nowReal;
          lastQuerySegmentIndex.current = segmentIndex;
          isFetchingOverpass.current = true;

          fetchNearestRoadData(position[0], position[1])
            .then((result) => {
              isFetchingOverpass.current = false;
              if (result) {
                const parsedSpeed = parseMaxspeedToMps(result.maxspeed, result.highway, osrmSpeedMps);
                setSpeedLimitMps(parsedSpeed);
              }
            })
            .catch((err) => {
              isFetchingOverpass.current = false;
              console.error('Overpass background fetch failed:', err);
            });
        }
      }

      // Simulate a realistic driving speed: active road speed limit + minor wave noise
      // If we fall back to 0 or speedLimitMps is zero, keep speed 0
      const activeLimitMps = stateRef.current.speedLimitMps;
      const baseSpeedKmh = activeLimitMps * 3.6;
      const waveNoise = Math.sin(now / 1200) * 3 + Math.cos(now / 3200) * 1.5;
      const simulatedSpeed = baseSpeedKmh > 0 ? Math.max(10, baseSpeedKmh + waveNoise) : 0;
      setCurrentSpeedKmh(simulatedSpeed);

      setVirtualElapsedMs(currentVirtualElapsed);
      setLastUpdateRealTime(now);

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [status]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 flex flex-col">
      {/* Leaflet Map display takes full viewport background */}
      <div className="flex-1 w-full h-full relative z-0">
        <MapDisplay
          route={route}
          carPosition={carPosition}
          carBearing={carBearing}
          lockCamera={lockCamera}
        />
      </div>

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
        isCompleted={status === 'completed'}
        speedMultiplier={speedMultiplier}
        setSpeedMultiplier={handleSetSpeedMultiplier}
        lockCamera={lockCamera}
        setLockCamera={setLockCamera}
        currentSpeedKmh={currentSpeedKmh}
        speedLimitMps={speedLimitMps}
      />
    </div>
  );
}

export default App;
