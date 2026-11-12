import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Crosshair, Eye } from 'lucide-react';
import { SystemState } from '../types';
import { api } from '../services/api';

interface DatasetReplayPageProps {
  state: SystemState;
  onSelectObject: (id: string) => void;
}

export const DatasetReplayPage: React.FC<DatasetReplayPageProps> = ({ state, onSelectObject }) => {
  const [selectedFrameId, setSelectedFrameId] = useState<number>(0);
  const [isPlayingReplay, setIsPlayingReplay] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const opticalDebris = state.objects.filter(o => o.metadata?.source === 'optical_debris_dataset');
  const currentObj = state.target?.metadata?.source === 'optical_debris_dataset' 
    ? state.target 
    : (opticalDebris.length > 0 ? opticalDebris[0] : null);

  const imageId = currentObj?.metadata?.optical_image_id ?? selectedFrameId;

  // Draw bounding box on sensor image canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let aborted = false;

    const drawOverlayAndAnnotations = (imgEl: HTMLImageElement | null) => {
      if (aborted) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (imgEl) {
        ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);
      } else {
        const grad = ctx.createRadialGradient(256, 256, 20, 256, 256, 360);
        grad.addColorStop(0, '#091426');
        grad.addColorStop(1, '#02050c');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        let seed = (Number(imageId) + 1) * 2654435761;
        for (let s = 0; s < 140; s++) {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          const sx = ((seed & 0xffff) / 65535) * canvas.width;
          seed = (seed * 1664525 + 1013904223) >>> 0;
          const sy = ((seed & 0xffff) / 65535) * canvas.height;
          const mag = 0.25 + ((seed >>> 24) / 255) * 0.75;
          ctx.fillStyle = `rgba(215, 232, 255, ${mag.toFixed(2)})`;
          ctx.fillRect(sx, sy, mag > 0.75 ? 2 : 1.2, mag > 0.75 ? 2 : 1.2);
        }

        ctx.strokeStyle = 'rgba(0, 229, 255, 0.10)';
        ctx.lineWidth = 1;
        for (let g = 64; g < canvas.width; g += 64) {
          ctx.beginPath(); ctx.moveTo(g, 0); ctx.lineTo(g, canvas.height); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, g); ctx.lineTo(canvas.width, g); ctx.stroke();
        }

        ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.fillText('SYNTHETIC OPTICAL TELEMETRY OVERLAY (RAW FRAME ARCHIVED)', 12, canvas.height - 12);
      }

      const frameObjs = state.objects.filter(o => o.metadata?.optical_image_id === imageId);
      frameObjs.forEach((o, idx) => {
        const rawBox = o.metadata?.raw_bbox;
        if (rawBox && rawBox.length >= 4) {
          const [ymin, ymax, xmin, xmax] = rawBox;
          const isSelected = o.id === currentObj?.id;

          ctx.strokeStyle = isSelected ? '#00e5ff' : '#f59e0b';
          ctx.lineWidth = isSelected ? 3 : 2;
          ctx.strokeRect(xmin, ymin, xmax - xmin, ymax - ymin);

          const len = 6;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(xmin, ymin + len); ctx.lineTo(xmin, ymin); ctx.lineTo(xmin + len, ymin); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(xmax - len, ymin); ctx.lineTo(xmax, ymin); ctx.lineTo(xmax, ymin + len); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(xmin, ymax - len); ctx.lineTo(xmin, ymax); ctx.lineTo(xmin + len, ymax); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(xmax - len, ymax); ctx.lineTo(xmax, ymax); ctx.lineTo(xmax, ymax - len); ctx.stroke();

          ctx.fillStyle = isSelected ? '#00e5ff' : '#f59e0b';
          ctx.font = '10px JetBrains Mono, monospace';
          ctx.fillText(`DEBRIS #${idx} [${(xmax - xmin).toFixed(0)}x${(ymax - ymin).toFixed(0)}]`, xmin, Math.max(12, ymin - 4));
        }
      });
    };

    const img = new window.Image();
    img.onload = () => drawOverlayAndAnnotations(img);
    img.onerror = () => drawOverlayAndAnnotations(null);
    img.src = api.getImageUrl('train', `${imageId}.jpg`);

    return () => {
      aborted = true;
    };
  }, [imageId, currentObj?.id, state.objects]);

  const handleStartReplay = async () => {
    setIsPlayingReplay(true);
    await api.triggerDatasetReplay(100);
  };

  const handleStopReplay = async () => {
    setIsPlayingReplay(false);
    await api.pause();
  };

  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 420px', gap: 12, padding: 14, maxWidth: 1600, margin: '0 auto', width: '100%', overflowY: 'auto' }}>
      {/* Left Column: Optical Telescope Feed & Canvas */}
      <div className="glass-panel cyber-corners p-4 flex flex-col gap-3 font-mono text-xs">
        <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-cyan)', paddingBottom: 8 }}>
          <div className="flex items-center gap-2">
            <Eye style={{ width: 16, height: 16, color: 'var(--cyan)' }} />
            <span className="font-tech text-sm font-bold text-white tracking-wider">
              OPTICAL SURVEILLANCE TELESCOPE FEED (GROUND TRUTH DATASET)
            </span>
          </div>
          <span className="badge-tech badge-cyan">
            FRAME #{imageId}.JPG (512 × 512 PX)
          </span>
        </div>

        {/* 512x512 Sensor Canvas with Overlay */}
        <div style={{ position: 'relative', margin: '0 auto', background: '#000', borderRadius: 4, border: '1px solid var(--border-cyan)', overflow: 'hidden', boxShadow: '0 0 24px rgba(0,240,255,0.2)' }}>
          <canvas
            ref={canvasRef}
            width={512}
            height={512}
            style={{ width: '100%', maxWidth: 512, height: 'auto', aspectRatio: '1/1', display: 'block', cursor: 'crosshair' }}
          />
          <div style={{ position: 'absolute', top: 8, left: 8, pointerEvents: 'none', fontSize: '10px', color: 'var(--cyan)', fontFamily: 'var(--font-mono)', background: 'rgba(0,0,0,0.75)', padding: '4px 8px', borderRadius: 3 }}>
            <div>FOV: 12.0° | RES: 512x512</div>
            <div>SENSOR: CMOS TIME-DELAY INTEGRATION</div>
          </div>
        </div>

        {/* Replay Controls Bar */}
        <div className="flex items-center justify-between gap-3" style={{ background: 'rgba(5, 11, 24, 0.85)', padding: '8px 12px', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-2">
            {!isPlayingReplay ? (
              <button
                onClick={handleStartReplay}
                className="btn-demo"
                style={{ fontSize: '11px', padding: '5px 12px' }}
              >
                <Play style={{ width: 14, height: 14 }} /> START REPLAY
              </button>
            ) : (
              <button
                onClick={handleStopReplay}
                className="btn-secondary"
                style={{ fontSize: '11px', padding: '5px 12px' }}
              >
                <Pause style={{ width: 14, height: 14 }} /> PAUSE REPLAY
              </button>
            )}

            <button
              onClick={() => setSelectedFrameId(0)}
              className="clock-btn"
              title="Reset to frame 0"
            >
              <RotateCcw style={{ width: 14, height: 14 }} />
            </button>
          </div>

          {/* Frame Slider */}
          <div className="flex items-center gap-2 flex-1" style={{ maxWidth: 280 }}>
            <span className="text-dim" style={{ fontSize: '10px', whiteSpace: 'nowrap' }}>FRAME:</span>
            <input
              type="range"
              min={0}
              max={120}
              value={imageId}
              onChange={(e) => setSelectedFrameId(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--cyan)', cursor: 'pointer' }}
            />
            <span className="text-cyan font-bold" style={{ minWidth: 30 }}>{imageId}</span>
          </div>
        </div>
      </div>

      {/* Right Column: Physical Derivations & Adapter Mapping Panel */}
      <div className="glass-panel cyber-corners p-4 flex flex-col gap-3 font-mono text-xs">
        <div className="flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-cyan)', paddingBottom: 8 }}>
          <span className="font-tech text-sm font-bold text-cyan tracking-wider">
            OPTICAL ➔ ORBITAL ADAPTER MODEL
          </span>
          <span className="badge-tech badge-cyan">DERIVED = TRUE</span>
        </div>

        {currentObj ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ background: 'rgba(5, 11, 24, 0.75)', padding: '8px 10px', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
              <span className="text-dim" style={{ fontSize: '10px', display: 'block' }}>DETECTED DEBRIS TARGET:</span>
              <span className="text-amber font-bold text-sm">{currentObj.name}</span>
              <div className="text-dim mt-1" style={{ fontSize: '10px' }}>ID: {currentObj.id}</div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div style={{ background: 'rgba(5, 11, 24, 0.75)', padding: '8px 10px', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
                <span className="text-dim" style={{ fontSize: '10px', display: 'block' }}>RAW BOUNDING BOX:</span>
                <span className="text-white font-bold">
                  [{currentObj.metadata?.raw_bbox?.join(', ') || 'N/A'}]
                </span>
              </div>
              <div style={{ background: 'rgba(5, 11, 24, 0.75)', padding: '8px 10px', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
                <span className="text-dim" style={{ fontSize: '10px', display: 'block' }}>APPARENT PIXEL SIZE:</span>
                <span className="text-cyan font-bold">
                  {currentObj.metadata?.apparent_pixel_size} px
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div style={{ background: 'rgba(5, 11, 24, 0.75)', padding: '8px 10px', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
                <span className="text-dim" style={{ fontSize: '10px', display: 'block' }}>EST. CROSS-SECTION:</span>
                <span className="text-amber font-bold">
                  {currentObj.metadata?.apparent_cross_section_m2 ? `${currentObj.metadata.apparent_cross_section_m2.toFixed(3)} m²` : '0.125 m²'}
                </span>
              </div>
              <div style={{ background: 'rgba(5, 11, 24, 0.75)', padding: '8px 10px', borderRadius: 4, border: '1px solid var(--border-subtle)' }}>
                <span className="text-dim" style={{ fontSize: '10px', display: 'block' }}>DERIVED MASS:</span>
                <span className="text-amber font-bold">{currentObj.mass.toFixed(1)} kg</span>
              </div>
            </div>

            <div style={{ background: 'rgba(5, 11, 24, 0.75)', padding: '8px 10px', borderRadius: 4, border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="text-dim" style={{ fontSize: '10px', display: 'block' }}>DERIVED 3D ECI STATE VECTOR:</span>
              <div className="text-cyan font-bold">
                P: [{currentObj.position_x.toFixed(1)}, {currentObj.position_y.toFixed(1)}, {currentObj.position_z.toFixed(1)}] km
              </div>
              <div className="text-white font-bold">
                V: [{currentObj.velocity_x.toFixed(3)}, {currentObj.velocity_y.toFixed(3)}, {currentObj.velocity_z.toFixed(3)}] km/s
              </div>
              <div className="text-amber">
                ALTITUDE: {currentObj.altitude.toFixed(1)} km | INC: {currentObj.inclination.toFixed(1)}°
              </div>
            </div>

            <button
              onClick={() => onSelectObject(currentObj.id)}
              className="btn-demo"
              style={{ width: '100%', justifyContent: 'center', padding: '8px 14px' }}
            >
              <Crosshair style={{ width: 15, height: 15 }} />
              LOCK SENTINEL ON THIS DEBRIS OBJECT
            </button>
          </div>
        ) : (
          <div className="text-dim text-center py-8">
            Select an optical debris detection from the image canvas to inspect derived state.
          </div>
        )}
      </div>
    </div>
  );
};
