import React, { useEffect, useRef } from 'react';
import type { WeatherData } from '../services/navigation';

interface WeatherOverlayProps {
  weather: WeatherData | null;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  sizeOrLength: number;
  opacity: number;
  wobble?: number;
  wobbleSpeed?: number;
}

export const WeatherOverlay: React.FC<WeatherOverlayProps> = ({ weather }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let particles: Particle[] = [];
    const maxParticles = weather?.text === 'Rainy' || weather?.text === 'Drizzle' ? 120 : 150;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Initialize particles based on weather type
    const initParticles = () => {
      particles = [];
      const type = weather?.text;
      
      if (type === 'Rainy' || type === 'Drizzle') {
        // Rain Drops
        for (let i = 0; i < maxParticles; i++) {
          particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: -1.5 - Math.random() * 2, // Slant to the left
            vy: 10 + Math.random() * 8,    // High speed vertical drop
            sizeOrLength: 10 + Math.random() * 15,
            opacity: 0.15 + Math.random() * 0.35,
          });
        }
      } else if (type === 'Snowy') {
        // Snow Flakes
        for (let i = 0; i < maxParticles; i++) {
          particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: -0.5 + Math.random(), // Soft horizontal sway
            vy: 0.8 + Math.random() * 1.5, // Slow float down
            sizeOrLength: 1.5 + Math.random() * 2.5, // Circular radius
            opacity: 0.3 + Math.random() * 0.5,
            wobble: Math.random() * Math.PI * 2,
            wobbleSpeed: 0.02 + Math.random() * 0.03,
          });
        }
      }
    };
    initParticles();

    // Render loop
    const tick = () => {
      const type = weather?.text;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (type === 'Rainy' || type === 'Drizzle') {
        // Render Rain
        ctx.strokeStyle = 'rgba(174, 194, 224, 0.4)';
        ctx.lineWidth = 1.2;
        
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          ctx.beginPath();
          ctx.strokeStyle = `rgba(174, 194, 224, ${p.opacity})`;
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.vx, p.y + p.sizeOrLength);
          ctx.stroke();

          // Update position
          p.x += p.vx;
          p.y += p.vy;

          // Recycle drop once offscreen
          if (p.y > canvas.height || p.x < -20) {
            p.x = Math.random() * (canvas.width + 40);
            p.y = -20;
            p.opacity = 0.15 + Math.random() * 0.35;
          }
        }
      } else if (type === 'Snowy') {
        // Render Snow
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          ctx.beginPath();
          ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
          ctx.arc(p.x, p.y, p.sizeOrLength, 0, Math.PI * 2);
          ctx.fill();

          // Apply sway
          if (p.wobble !== undefined && p.wobbleSpeed !== undefined) {
            p.wobble += p.wobbleSpeed;
            p.x += Math.sin(p.wobble) * 0.3;
          }

          // Update position
          p.x += p.vx * 0.5;
          p.y += p.vy;

          // Recycle flake
          if (p.y > canvas.height || p.x < -10 || p.x > canvas.width + 10) {
            p.x = Math.random() * canvas.width;
            p.y = -10;
            p.opacity = 0.3 + Math.random() * 0.5;
            if (p.wobble !== undefined) p.wobble = Math.random() * Math.PI * 2;
          }
        }
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animId);
    };
  }, [weather]);

  const showCanvas = weather?.text === 'Rainy' || weather?.text === 'Drizzle' || weather?.text === 'Snowy';
  const showFog = weather?.text === 'Foggy' || weather?.text === 'Overcast';

  return (
    <>
      {showCanvas && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 z-[400] pointer-events-none w-full h-full"
        />
      )}
      {showFog && <div className="fog-overlay" />}
    </>
  );
};
