import React, { useMemo, useState, useEffect } from 'react';
import { Compass, Clock, Gauge, Route, Eye, EyeOff, ShieldAlert, ChevronUp, ChevronDown } from 'lucide-react';
import type { WeatherData } from '../services/navigation';

interface DashboardProps {
  distance: number;          // in meters
  duration: number;          // in seconds
  elapsedMs: number;         // in milliseconds (true elapsed)
  virtualProgressMs: number; // in milliseconds (physics tracking)
  isDriving: boolean;
  isPaused: boolean;
  isCompleted: boolean;
  speedMultiplier: number;   // e.g. 1, 10, 100
  setSpeedMultiplier: (val: number) => void;
  lockCamera: boolean;
  setLockCamera: (val: boolean) => void;
  currentSpeedMph: number;   // calculated speed in MPH
  weather: WeatherData | null;
  isDarkMode: boolean;
  isSpeedLimitFallback: boolean;
}

export const Dashboard: React.FC<DashboardProps> = ({
  distance,
  duration,
  elapsedMs,
  virtualProgressMs,
  isDriving,
  isPaused,
  isCompleted,
  speedMultiplier,
  setSpeedMultiplier,
  lockCamera,
  setLockCamera,
  currentSpeedMph,
  weather,
  isDarkMode,
  isSpeedLimitFallback,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  // Force re-renders every second while paused so ETA rises dynamically
  const [pauseTick, setPauseTick] = useState(0);
  useEffect(() => {
    if (!isPaused) return;
    const interval = setInterval(() => setPauseTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isPaused]);

  // Convert distance to miles & km
  const distanceKm = distance / 1000;
  const distanceMiles = distanceKm * 0.621371;

  const durationSec = Math.round(duration);

  // Time elapsed in seconds (true wall-clock)
  const elapsedSec = Math.floor(elapsedMs / 1000);
  
  // Progress in seconds (physics track)
  const progressSec = Math.floor(virtualProgressMs / 1000);
  const baseRemainingSec = Math.max(0, durationSec - progressSec);

  // Realistic GPS Fluctuation: Add an organic drift to the ETA (±15 seconds) so it doesn't tick perfectly like a stopwatch
  // The sine waves create a smooth, pseudo-random "live calculation" feel based on real-world time
  const etaFluctuation = (isDriving && !isPaused && !isCompleted)
    ? Math.round((Math.sin(Date.now() / 6000) * 12) + (Math.cos(Date.now() / 13000) * 8))
    : 0;

  const displayRemainingSec = Math.max(0, baseRemainingSec + etaFluctuation);

  // Dynamic Total Time (True Elapsed + True Estimated Remaining, completely ignoring the cosmetic ETA jitter)
  const estimatedTotalSec = elapsedSec + baseRemainingSec;
  const estimatedTotalHours = Math.floor(estimatedTotalSec / 3600);
  const estimatedTotalMins = Math.floor((estimatedTotalSec % 3600) / 60);

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
    const etaDate = new Date(Date.now() + displayRemainingSec * 1000);
    return etaDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }, [displayRemainingSec, isCompleted, pauseTick]);

  const progressPercent = useMemo(() => {
    if (durationSec <= 0) return 0;
    return Math.min(100, (progressSec / durationSec) * 100);
  }, [progressSec, durationSec]);

  // Speeds in metric
  const currentSpeedKmh = currentSpeedMph * 1.609344;



  // Style constants based on Day/Night (isDarkMode)
  const hudContainerClass = isDarkMode
    ? 'glass-panel glass-panel-glow text-white border-white/08 shadow-2xl'
    : 'bg-white/90 border border-slate-200/60 backdrop-blur-md text-slate-800 shadow-xl shadow-slate-200/30';

  const gridItemClass = isDarkMode
    ? 'bg-slate-900/40 border-slate-800/40 text-slate-300'
    : 'bg-slate-50/70 border-slate-200/50 text-slate-700';

  const statLabelClass = isDarkMode ? 'text-gray-400' : 'text-slate-500';
  const statValClass = isDarkMode ? 'text-white' : 'text-slate-900';
  const subTextClass = isDarkMode ? 'text-slate-400' : 'text-slate-500';

  const isTimeWarped = speedMultiplier > 1;
  const etaLabelClass = isTimeWarped
    ? (isDarkMode ? 'text-amber-400/90 font-bold' : 'text-amber-600 font-bold')
    : statLabelClass;

  const weatherIcon = useMemo(() => {
    if (!weather) return '';
    if (isDarkMode) {
      if (weather.icon === '☀️') return '🌙';
      if (weather.icon === '⛅') return '☁️🌙';
    }
    return weather.icon;
  }, [weather, isDarkMode]);

  if (distance <= 0) return null;

  return (
    <div className="absolute bottom-4 left-4 right-4 md:left-auto md:right-4 z-[1000] w-auto md:w-96">
      <div className={`rounded-2xl p-5 transition-all duration-500 ${hudContainerClass}`}>
        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsExpanded(!isExpanded)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setIsExpanded(!isExpanded);
            }
          }}
          className={`flex items-center justify-between cursor-pointer select-none transition-all duration-300 rounded-lg p-2 -mx-2 -mt-2
            ${isExpanded ? 'mb-4 border-b pb-3 rounded-b-none' : 'mb-0'}
            ${isDarkMode
              ? 'border-slate-800 hover:bg-white/5 text-slate-200'
              : 'border-slate-200/80 hover:bg-black/5 text-slate-700'
            }`}
        >
          <h2 className="text-sm font-semibold uppercase tracking-wider">Telemetry HUD</h2>
          <div className="flex items-center space-x-3">
            {isDriving ? (
              isPaused ? (
                <span className="flex items-center space-x-1.5">
                  <span className={`w-2 h-2 rounded-full ${isDarkMode ? 'bg-amber-400' : 'bg-amber-500'}`}></span>
                  <span className={`text-xs font-semibold ${isDarkMode ? 'text-amber-400' : 'text-amber-600'}`}>Sim Paused</span>
                </span>
              ) : (
                <span className="flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                  <span className="text-xs font-semibold text-emerald-400">Live Sim Active</span>
                </span>
              )
            ) : (
              <span className="text-xs font-semibold text-slate-400">Route Staged</span>
            )}
            {isExpanded ? (
              <ChevronUp className={`w-4 h-4 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`} />
            ) : (
              <ChevronDown className={`w-4 h-4 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`} />
            )}
          </div>
        </div>

        <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100 mt-0' : 'grid-rows-[0fr] opacity-0 pointer-events-none'}`}>
          <div className="overflow-hidden min-h-0">
            {/* Live Weather Integration Banner */}
            {weather && (
              <div className={`mb-4 border rounded-xl p-3 flex items-center justify-between transition-all duration-500 ${
                isDarkMode ? 'bg-slate-900/50 border-slate-800/60' : 'bg-slate-100/40 border-slate-200/60'
              }`}>
                <div className="flex items-center space-x-3">
                  <span className="text-2xl select-none" role="img" aria-label={weather.text}>
                    {weatherIcon}
                  </span>
                  <div>
                    <p className={`text-[9px] uppercase tracking-wider font-bold ${isDarkMode ? 'text-gray-500' : 'text-slate-400'}`}>Local Weather</p>
                    <p className={`text-xs font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>{weather.text}</p>
                  </div>
                </div>
                <div className={`px-2.5 py-1 rounded-lg border transition-all duration-500 ${
                  isDarkMode ? 'bg-slate-950/40 border-slate-800/40 text-white' : 'bg-white/80 border-slate-200/40 text-slate-800 shadow-sm'
                }`}>
                  <span className="text-sm font-black">{Math.round(weather.temp)}°F</span>
                </div>
              </div>
            )}

            {/* 2x2 Grid Stats */}
            <div className="grid grid-cols-2 gap-4">
              {/* Distance */}
              <div className={`border rounded-xl p-3 flex items-center space-x-3 transition-all duration-500 ${gridItemClass}`}>
                <div className={`p-2 rounded-lg text-blue-500 flex-shrink-0 ${isDarkMode ? 'bg-blue-500/10' : 'bg-blue-500/15'}`}>
                  <Route className="w-4 h-4" />
                </div>
                <div>
                  <p className={`text-[10px] uppercase tracking-wider font-semibold ${statLabelClass}`}>Distance</p>
                  <p className={`text-sm font-bold leading-tight ${statValClass}`}>
                    {distanceMiles.toFixed(1)} mi
                  </p>
                  <p className={`text-[10px] ${subTextClass}`}>{distanceKm.toFixed(1)} km</p>
                </div>
              </div>

              {/* Speed */}
              <div className={`border rounded-xl p-3 flex items-center space-x-3 transition-all duration-500 ${gridItemClass}`}>
                <div className={`p-2 rounded-lg text-amber-500 flex-shrink-0 ${isDarkMode ? 'bg-amber-500/10' : 'bg-amber-500/15'}`}>
                  <Gauge className="w-4 h-4" />
                </div>
                <div>
                  <p className={`text-[10px] uppercase tracking-wider font-semibold ${statLabelClass}`}>Velocity</p>
                  <p className={`text-sm font-bold leading-tight ${statValClass}`}>
                    {isDriving && !isPaused ? currentSpeedMph.toFixed(0) : '0'} mph
                  </p>
                  <p className={`text-[10px] ${subTextClass}`}>
                    {isDriving && !isPaused ? currentSpeedKmh.toFixed(0) : '0'} km/h
                  </p>
                </div>
              </div>

              {/* Duration */}
              <div className={`border rounded-xl p-3 flex items-center space-x-3 transition-all duration-500 ${gridItemClass}`}>
                <div className={`p-2 rounded-lg text-purple-500 flex-shrink-0 ${isDarkMode ? 'bg-purple-500/10' : 'bg-purple-500/15'}`}>
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <p className={`text-[10px] uppercase tracking-wider font-semibold ${statLabelClass}`}>
                    {isTimeWarped ? 'Sim. Total Time' : 'Total Time'}
                  </p>
                  <p className={`text-sm font-bold leading-tight ${statValClass}`}>
                    {estimatedTotalHours > 0 ? `${estimatedTotalHours}h ` : ''}{estimatedTotalMins}m
                  </p>
                  <p className={`text-[10px] ${subTextClass}`}>{formatTime(estimatedTotalSec)}</p>
                </div>
              </div>

              {/* Time Remaining / ETA */}
              <div className={`border rounded-xl p-3 flex items-center space-x-3 transition-all duration-500 ${gridItemClass}`}>
                <div className={`p-2 rounded-lg text-pink-500 flex-shrink-0 ${isDarkMode ? 'bg-pink-500/10' : 'bg-pink-500/15'}`}>
                  <Compass className="w-4 h-4" />
                </div>
                <div>
                  <p className={`text-[10px] uppercase tracking-wider font-semibold ${etaLabelClass}`}>
                    {isTimeWarped ? 'Simulated ETA' : 'ETA'}
                  </p>
                  <p className={`text-sm font-bold leading-tight truncate ${statValClass}`}>
                    {etaString}
                  </p>
                  <p className={`text-[10px] ${subTextClass}`}>
                    -{formatTime(displayRemainingSec)}
                  </p>
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mt-4">
              <div className={`flex justify-between items-center text-[10px] mb-1 ${isDarkMode ? 'text-gray-400' : 'text-slate-500'}`}>
                <span>Route Progress</span>
                <span className={`font-semibold ${isDarkMode ? 'text-white' : 'text-slate-800'}`}>{progressPercent.toFixed(2)}%</span>
              </div>
              <div className={`w-full rounded-full h-2 overflow-hidden border ${
                isDarkMode ? 'bg-slate-950 border-slate-800/80' : 'bg-slate-100 border-slate-200/80'
              }`}>
                <div
                  className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className={`flex justify-between text-[10px] mt-1 ${isDarkMode ? 'text-gray-500' : 'text-slate-400'}`}>
                <span>Elapsed: {formatTime(elapsedSec)}</span>
                <span className={isTimeWarped ? (isDarkMode ? 'text-amber-400/90 font-semibold' : 'text-amber-600 font-semibold') : ''}>
                  {isTimeWarped ? 'Sim. Remaining: ' : 'Remaining: '}{formatTime(displayRemainingSec)}
                </span>
              </div>
            </div>

            {/* Camera and Multiplier Controls */}
            <div className={`flex items-center justify-between mt-4 pt-3 border-t gap-3 ${isDarkMode ? 'border-slate-800/60' : 'border-slate-200/60'}`}>
              {/* Camera follow toggler */}
              <button
                type="button"
                onClick={() => setLockCamera(!lockCamera)}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                  lockCamera
                    ? isDarkMode
                      ? 'bg-blue-600/25 border-blue-500/45 text-blue-300 hover:bg-blue-600/35'
                      : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
                    : isDarkMode
                      ? 'bg-slate-900 border-slate-800 text-gray-400 hover:text-white hover:border-gray-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                {lockCamera ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                <span>{lockCamera ? 'Camera Locked' : 'Camera Free'}</span>
              </button>

              {/* Time speedup multiplier */}
              <div className={`flex items-center space-x-1 border rounded-lg p-0.5 transition-all duration-500 ${
                isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}>
                {[1, 10, 100, 1000].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSpeedMultiplier(m)}
                    disabled={!isDriving}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                      speedMultiplier === m && isDriving
                        ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20'
                        : isDarkMode
                          ? 'text-gray-400 hover:text-white'
                          : 'text-slate-500 hover:text-slate-800'
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
              <div className={`mt-3 flex items-start space-x-2 text-[10px] border p-2 rounded-lg transition-all duration-500 ${
                isDarkMode ? 'bg-slate-950/60 border-slate-800/50 text-slate-400' : 'bg-slate-50/60 border-slate-200/50 text-slate-500'
              }`}>
                <ShieldAlert className="w-3.5 h-3.5 text-blue-400 flex-shrink-0 mt-0.5" />
                <span>
                  Background tab interpolation active. If the tab goes to sleep, the car will teleport to the correct spot upon wake.
                </span>
              </div>
            )}

            {/* Speed Limit Footnote */}
            {isDriving && isSpeedLimitFallback && (
              <div className={`mt-2 text-[9px] italic ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                * Speed limit is estimated from road type
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
