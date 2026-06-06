# 1:1 Real-Time Driving Simulator

A single-page web app that calculates real-world driving routes and animates a car traveling along that route in strictly 1:1 real-time. If you input a route that takes 8 hours in real life, the animation will take exactly 8 hours. 

Designed as a slow-TV or ambient dashboard experience.

## Features

*   **True 1:1 Real-Time**: Uses absolute time-based interpolation. Even if the browser tab is minimized or suspended for hours, the car will instantly "teleport" to the correct position when you reopen the tab.
*   **Real-World Speed Limits**: Queries the Overpass API to display the actual posted speed limits of the roads you are driving on. If data is missing, it falls back to realistic speed limit defaults based on road classification.
*   **Realistic Velocity**: The speedometer moves dynamically, fluctuating realistically around the posted speed limit (slower in residential areas, faster on freeways).
*   **Pause & Resume**: Timing offsets are calculated on pause so the car resumes driving exactly where it left off, rather than jumping forward.
*   **Debug Multipliers**: Toggle between 1x, 10x, 100x, and 1000x speed to easily test and preview longer routes.
*   **Sleek Dark UI**: Uses CartoDB Dark Matter map tiles, custom start/destination pins, a rotating car marker, and a glassmorphic dashboard HUD showing total distance, ETA, and elapsed time.

## Tech Stack

*   React + TypeScript + Vite
*   Tailwind CSS
*   Leaflet & React-Leaflet
*   Nominatim API (Geocoding)
*   OSRM API (Routing)
*   Overpass API (Road Speed Limits)

## Getting Started

1. Clone the repository and install dependencies:
   ```bash
   git clone <repo-url>
   cd driving-simulation
   npm install
   ```

2. Start the local development server:
   ```bash
   npm run dev
   ```

3. Open [http://localhost:5173](http://localhost:5173) in your browser.
