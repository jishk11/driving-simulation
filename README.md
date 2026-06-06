# Ambient 1:1 Real-Time Driving Simulator

A single-page React web application that calculates real-world driving routes and animates a car traveling along that route in strictly **1:1 real-time** (e.g., if a drive from San Diego to San Francisco takes 9.5 hours, the simulation takes exactly 9.5 hours). 

Designed as an ambient "slow TV" dashboard, the simulator is built to be resilient to background browser tab suspension, fetches posted speed limits dynamically from the Overpass API, and features a premium dark-mode glassmorphic HUD.

---

## Key Features

*   **1:1 Real-Time Background-Resilient Loop**: Built using absolute time-based interpolation (`Date.now() - startTime`). If the browser tab is backgrounded or goes to sleep, the car instantly teleports to the correct current position upon waking up, keeping the journey perfectly synchronized.
*   **Real-World Speed Limits (Overpass API)**: Queries the Overpass API nearest the car's coordinates to fetch the actual posted `maxspeed` limit of the road. Throttled to a maximum of one request every 3 real-world seconds to respect rate limits.
*   **Adaptive Units & Heuristics**: Automatically detects if a road's speed limit is in MPH or km/h based on OSRM profile averages, with intelligent road-class fallbacks (65 mph for freeways, 35 mph for standard streets).
*   **Time-Shift Pause & Resume Controls**: Shifts the absolute timing reference checkpoint when paused to completely ignore paused intervals. The car halts and resumes movement without any teleportation jumps.
*   **Telemetry HUD**: Premium glassmorphic interface displaying:
    *   Dynamic US-style **Speed Limit Sign** graphic.
    *   Simulated velocity speedometer (fluctuating realistically around the road's posted speed limit).
    *   Odometer (distance completed & remaining in both metric and imperial units).
    *   Journey timers (total duration, elapsed, remaining, and local ETA).
    *   Live progress bar.
    *   **Time Multiplier Controls** (1x, 10x, 100x, 1000x) for debugging and fast-forward testing.
    *   **Camera Lock Toggle** to toggle automatic panning and centering of the map on the car.
*   **Sleek Map Rendering**: Integrates Leaflet (`react-leaflet`) with premium CartoDB Dark Matter tiles, a custom rotating SVG car marker oriented to the road's geographic bearing, and distinct custom markers for origin (emerald pin) and destination (rose pin).

---

## Technical Stack

*   **Core**: React + TypeScript + Vite
*   **Styling**: Tailwind CSS v4 & PostCSS
*   **Map Provider**: Leaflet (via `react-leaflet`) with CartoDB Dark Matter tiles
*   **Geocoding**: OpenStreetMap Nominatim API (text-to-coordinates)
*   **Routing API**: Open Source Routing Machine (OSRM) public route interpreter
*   **Road Data API**: Overpass API interpreter (for `maxspeed` and `highway` way tags)
*   **Icons**: Lucide React

---

## Mathematical Mechanics

### 1. Travel-Time Interpolation
Rather than animating linearly by distance, the car moves proportional to travel time. Using OSRM's segment durations, we precalculate cumulative travel duration checkpoints $T_0, T_1, \ldots, T_{N-1}$:
$$T_0 = 0$$
$$T_i = T_{i-1} + \text{segmentDuration}_{i-1}$$
At any elapsed virtual time $t$ seconds, we locate the segment $k$ where $T_k \le t < T_{k+1}$ and interpolate coordinates linearly:
$$P = P_k + \frac{t - T_k}{T_{k+1} - T_k} \times (P_{k+1} - P_k)$$
This guarantees the car travels faster on freeways and slower on local roads.

### 2. Time-Shift Pause Math
When the simulation is paused at time $T_p$, we save the current virtual progress $V_p$. When resumed at time $T_r$, the checkpoint reference `lastUpdateRealTime` is updated directly to $T_r$. This resets the clock delta calculation to 0, completely ignoring the duration of the pause:
$$\text{elapsedMs} = V_p + (\text{currentRealTime} - T_r) \times \text{multiplier}$$

---

## Running Locally

1.  **Clone & Install Dependencies**:
    ```bash
    git clone <your-repository-url>
    cd <project-folder>
    npm install
    ```
2.  **Run Development Server**:
    ```bash
    npm run dev
    ```
    Open [http://localhost:5173/](http://localhost:5173/) in your browser.

3.  **Build for Production**:
    ```bash
    npm run build
    ```

---

## Deploying

This project is a static client-side application and can be hosted for free on **Vercel**, **Netlify**, or **GitHub Pages**.

### Deploying to Vercel (Recommended)
1.  Sign in to [Vercel](https://vercel.com/) with your GitHub account.
2.  Click **Add New > Project**, select your repository, and click **Deploy**. Vercel will automatically detect Vite and publish the site.
