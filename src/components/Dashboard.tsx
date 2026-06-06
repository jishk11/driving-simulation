import React, { useMemo } from 'react';
import { Compass, Clock, Gauge, Route, Eye, EyeOff, ShieldAlert } from 'lucide-react';

interface DashboardProps {
  distance: number;          // in meters
  duration: number;          // in seconds
  elapsedMs: number;         // in milliseconds
  isDriving: boolean;
  isCompleted: boolean;
  speedMultiplier: number;   // e.g. 1, 10, 100
  setSpeedMultiplier: (val: number) => void;
  lockCamera: boolean;
  setLockCamera: (val: boolean) => void;
  currentSpeedKmh: number;   // calculated speed
  speedLimitMps: number;     // speed limit in m/s
}

export const Dashboard: React.FC<DashboardProps> = ({
  distance,
  duration,
  elapsedMs,
  isDriving,
  isCompleted,
  speedMultiplier,
  setSpeedMultiplier,
  lockCamera,
  setLockCamera,
  currentSpeedKmh,
  speedLimitMps,
}) => {
  // Round duration to nearest integer second
  const durationSec = Math.round(duration);

  // Convert distance to km & miles
  const distanceKm = distance / 1000;
  const distanceMiles = distanceKm * 0.621371;

  // Convert total duration to hours & minutes
  const totalHours = Math.floor(durationSec / 3600);
  const totalMins = Math.floor((durationSec % 3600) / 60);

  // Time elapsed in seconds
  const elapsedSec = Math.floor(elapsedMs / 1000);
  const remainingSec = Math.max(0, durationSec - elapsedSec);

  // Formatting helpers
  const formatTime = (totalSeconds: number) => {
    const roundedSeconds = Math.round(totalSeconds);
    const hrs = Math.floor(roundedSeconds / 3600);
    const mins = Math.floor((roundedSeconds % 3600) / 60);
    const secs = roundedSeconds % 60;
    return [
      hrs.toString().padStart(2, '0'),
      mins.toString().padStart(2, '0'),
      secs.toString().padStart(2, '0'),
    ].join(':');
  };

  const etaString = useMemo(() => {
    if (isCompleted) return 'Arrived';
    const etaDate = new Date(Date.now() + remainingSec * 1000);
    return etaDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, [remainingSec, isCompleted]);

  const progressPercent = useMemo(() => {
    if (durationSec <= 0) return 0;
    return Math.min(100, (elapsedSec / durationSec) * 100);
  }, [elapsedSec, durationSec]);

  const speedMph = currentSpeedKmh * 0.621371;

  // Calculate speed limit values rounded to standard intervals
  const speedLimitMph = useMemo(() => {
    if (speedLimitMps <= 0) return 0;
    const rawMph = speedLimitMps * 2.236936;
    // Round to nearest 5 mph
    return Math.max(15, Math.round(rawMph / 5) * 5);
  }, [speedLimitMps]);

  if (distance <= 0) return null;

  return (
    <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 z-[1000] w-auto md:w-96">
      <div className="glass-panel glass-panel-glow rounded-2xl p-5 shadow-2xl transition-all duration-300">
        <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Telemetry HUD</h2>
          {isDriving ? (
            <span className="flex items-center space-x-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              <span className="text-xs font-semibold text-emerald-400">Live Sim Active</span>
            </span>
          ) : (
            <span className="text-xs font-semibold text-slate-400">Route Staged</span>
          )}
        </div>

        {/* 2x2 Grid Stats */}
        <div className="grid grid-cols-2 gap-4">
          {/* Distance */}
          <div className="bg-slate-900/40 border border-slate-800/40 rounded-xl p-3 flex items-center space-x-3">
            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
              <Route className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Distance</p>
              <p className="text-sm font-bold text-white leading-tight">
                {distanceKm.toFixed(1)} km
              </p>
              <p className="text-[10px] text-slate-400">{distanceMiles.toFixed(1)} mi</p>
            </div>
          </div>

          {/* Speed */}
          <div className="bg-slate-900/40 border border-slate-800/40 rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400 flex-shrink-0">
                <Gauge className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Velocity</p>
                <p className="text-sm font-bold text-white leading-tight truncate">
                  {isDriving ? currentSpeedKmh.toFixed(0) : '0'} km/h
                </p>
                <p className="text-[10px] text-slate-400 truncate">
                  {isDriving ? speedMph.toFixed(0) : '0'} mph
                </p>
              </div>
            </div>

            {/* US Style Speed Limit Sign */}
            {isDriving && speedLimitMph > 0 && (
              <div 
                className="flex-shrink-0 w-9 h-12 bg-white border-[1.5px] border-black rounded shadow-[0_2px_4px_rgba(0,0,0,0.3)] flex flex-col items-center justify-center p-0.5 select-none font-sans text-black leading-none animate-pulse-slow"
                title={`Speed Limit: ${speedLimitMph} mph`}
              >
                <span className="text-[5px] font-black tracking-tight" style={{ fontSize: '5px' }}>SPEED</span>
                <span className="text-[5px] font-black tracking-tight" style={{ fontSize: '5px' }}>LIMIT</span>
                <span className="text-sm font-black mt-0.5 tracking-tight" style={{ fontSize: '13px', fontWeight: 900 }}>{speedLimitMph}</span>
              </div>
            )}
          </div>

          {/* Duration */}
          <div className="bg-slate-900/40 border border-slate-800/40 rounded-xl p-3 flex items-center space-x-3">
            <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Total Time</p>
              <p className="text-sm font-bold text-white leading-tight">
                {totalHours > 0 ? `${totalHours}h ` : ''}{totalMins}m
              </p>
              <p className="text-[10px] text-slate-400">{formatTime(duration)}</p>
            </div>
          </div>

          {/* Time Remaining / ETA */}
          <div className="bg-slate-900/40 border border-slate-800/40 rounded-xl p-3 flex items-center space-x-3">
            <div className="p-2 bg-pink-500/10 rounded-lg text-pink-400">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">ETA</p>
              <p className="text-sm font-bold text-white leading-tight truncate">
                {etaString}
              </p>
              <p className="text-[10px] text-slate-400">
                -{formatTime(remainingSec)}
              </p>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="flex justify-between items-center text-[10px] text-gray-400 mb-1">
            <span>Route Progress</span>
            <span className="font-semibold text-white">{progressPercent.toFixed(2)}%</span>
          </div>
          <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800/80">
            <div
              className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-gray-500 mt-1">
            <span>Elapsed: {formatTime(elapsedSec)}</span>
            <span>Remaining: {formatTime(remainingSec)}</span>
          </div>
        </div>

        {/* Camera and Multiplier Controls */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-800/60 gap-3">
          {/* Camera follow toggler */}
          <button
            type="button"
            onClick={() => setLockCamera(!lockCamera)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              lockCamera
                ? 'bg-blue-600/25 border-blue-500/45 text-blue-300 hover:bg-blue-600/35'
                : 'bg-slate-900 border-slate-800 text-gray-400 hover:text-white hover:border-gray-700'
            }`}
          >
            {lockCamera ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>{lockCamera ? 'Camera Locked' : 'Camera Free'}</span>
          </button>

          {/* Time speedup multiplier */}
          <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 rounded-lg p-0.5">
            {[1, 10, 100, 1000].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setSpeedMultiplier(m)}
                disabled={!isDriving}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                  speedMultiplier === m && isDriving
                    ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20'
                    : 'text-gray-400 hover:text-white'
                }`}
                title={`${m}x speed`}
              >
                {m}x
              </button>
            ))}
          </div>
        </div>

        {/* Throttling Advisory Alert */}
        {isDriving && speedMultiplier === 1 && (
          <div className="mt-3 flex items-start space-x-2 text-[10px] bg-slate-950/60 border border-slate-800/50 p-2 rounded-lg text-slate-400">
            <ShieldAlert className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
            <span>
              Background tab interpolation active. If the tab goes to sleep, the car will teleport to the correct spot upon wake.
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
