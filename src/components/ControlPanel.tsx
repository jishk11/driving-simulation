import React from 'react';
import { MapPin, Navigation, RotateCcw, Play, Pause, Loader2, ArrowRightLeft } from 'lucide-react';

interface ControlPanelProps {
  origin: string;
  destination: string;
  setOrigin: (val: string) => void;
  setDestination: (val: string) => void;
  onCalculate: () => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  status: 'idle' | 'loading' | 'ready' | 'driving' | 'paused' | 'completed';
  error: string | null;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  origin,
  destination,
  setOrigin,
  setDestination,
  onCalculate,
  onStart,
  onPause,
  onResume,
  onReset,
  status,
  error,
}) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'idle' || status === 'ready') {
      onCalculate();
    }
  };

  const swapLocations = () => {
    if (status === 'driving' || status === 'paused') return;
    const temp = origin;
    setOrigin(destination);
    setDestination(temp);
  };

  const isInputDisabled = status === 'driving' || status === 'paused' || status === 'loading';

  return (
    <div className="absolute top-4 left-4 z-[1000] w-full max-w-sm px-4 sm:px-0">
      <div className="glass-panel glass-panel-glow rounded-2xl p-6 shadow-2xl transition-all duration-300">
        <div className="flex items-center space-x-2 mb-6">
          <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400">
            <Navigation className="w-5 h-5 animate-pulse-slow" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-wide">Real-Time Driving Sim</h1>
            <p className="text-xs text-gray-400">Ambient 1:1 Scale Road Trip</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative space-y-3">
            {/* Input Origin */}
            <div className="relative">
              <span className="absolute left-3 top-3.5 text-emerald-400">
                <MapPin className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Origin (e.g. San Diego, CA)"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                disabled={isInputDisabled}
                className="w-full bg-slate-900/60 border border-slate-700/50 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all disabled:opacity-50"
                required
              />
            </div>

            {/* Swap Button */}
            <div className="flex justify-center -my-2 relative z-10">
              <button
                type="button"
                onClick={swapLocations}
                disabled={isInputDisabled}
                className="p-1.5 rounded-full bg-slate-800 border border-slate-700 text-gray-400 hover:text-white hover:border-blue-500 active:scale-95 transition-all disabled:opacity-30"
                title="Swap origin and destination"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 rotate-90" />
              </button>
            </div>

            {/* Input Destination */}
            <div className="relative">
              <span className="absolute left-3 top-3.5 text-rose-400">
                <MapPin className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Destination (e.g. San Francisco, CA)"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                disabled={isInputDisabled}
                className="w-full bg-slate-900/60 border border-slate-700/50 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all disabled:opacity-50"
                required
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs rounded-xl">
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            {status === 'idle' && (
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-xl shadow-lg shadow-blue-600/20 active:scale-[0.99] transition-all flex items-center justify-center space-x-2 text-sm"
              >
                <span>Calculate Route</span>
              </button>
            )}

            {status === 'loading' && (
              <button
                type="button"
                disabled
                className="w-full bg-blue-600/50 text-white/80 font-medium py-3 rounded-xl transition-all flex items-center justify-center space-x-2 text-sm cursor-not-allowed"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Geocoding & Routing...</span>
              </button>
            )}

            {status === 'ready' && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onStart}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 rounded-xl shadow-lg shadow-emerald-600/20 active:scale-[0.99] transition-all flex items-center justify-center space-x-2 text-sm"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Start Drive</span>
                </button>
                <button
                  type="button"
                  onClick={onReset}
                  className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-gray-300 font-medium p-3 rounded-xl active:scale-[0.99] transition-all"
                  title="Reset"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            )}

            {(status === 'driving' || status === 'paused') && (
              <div className="flex gap-2">
                {status === 'driving' ? (
                  <button
                    type="button"
                    onClick={onPause}
                    className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-medium py-3 rounded-xl shadow-lg shadow-amber-600/20 active:scale-[0.99] transition-all flex items-center justify-center space-x-2 text-sm"
                  >
                    <Pause className="w-4 h-4" />
                    <span>Pause</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onResume}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 rounded-xl shadow-lg shadow-emerald-600/20 active:scale-[0.99] transition-all flex items-center justify-center space-x-2 text-sm"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Resume</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onReset}
                  className="bg-rose-950/40 hover:bg-rose-900/40 border border-rose-900/30 text-rose-300 font-medium p-3 rounded-xl active:scale-[0.99] transition-all"
                  title="Reset Simulation"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            )}

            {status === 'completed' && (
              <button
                type="button"
                onClick={onReset}
                className="w-full bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 text-rose-300 font-medium py-3 rounded-xl active:scale-[0.99] transition-all flex items-center justify-center space-x-2 text-sm"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset Simulation</span>
              </button>
            )}
          </div>
        </form>

        {status === 'completed' && (
          <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-center rounded-xl animate-bounce">
            <p className="font-semibold text-sm">Destination Reached! 🎉</p>
            <p className="text-xs text-emerald-400/80 mt-0.5">Your 1:1 real-time journey has finished.</p>
          </div>
        )}
      </div>
    </div>
  );
};
