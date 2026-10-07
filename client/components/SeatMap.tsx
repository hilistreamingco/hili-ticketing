import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import type { Seat, SeatLayoutConfig, SeatStatus } from "@/lib/seats";

// Top view of Cinema 1, drawn from the layout in the database (the blueprint
// SEATING_PLAN_CINEMA_-_1.pdf, turned so the screen is at the top and row A is
// at the front). Seat numbers run left to right; the fire escape and entrance
// are on the left wall.

const SEAT = 24;
const GAP = 4;
const PITCH = SEAT + GAP;
const ROW_PITCH = 36;
const AISLE = 44;
const LEFT = 110;
const RIGHT = 56;
const TOP = 92;
const BOTTOM = 40;

const COLORS = {
  panel: "#0b0b0b",
  free: "#262626",
  freeStroke: "#5a5a5a",
  freeText: "#e6e6e6",
  selected: "#c1ff1a",
  selectedText: "#0b0b0b",
  taken: "#151515",
  takenStroke: "#2c2c2c",
  takenMark: "#4a4a4a",
  label: "#8c8c8c",
  exit: "#7ec8e3",
};

export default function SeatMap({
  config,
  seats,
  taken,
  selected,
  mine,
  disabled,
  onToggle,
}: {
  config: SeatLayoutConfig;
  seats: Seat[];
  /** seat id -> status of every seat that is not free */
  taken: Map<string, SeatStatus>;
  selected: string[];
  /** seats this buyer already holds (shown as theirs, not as taken) */
  mine?: Set<string>;
  disabled?: boolean;
  onToggle: (seat: Seat) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  const [zoom, setZoom] = useState(1);

  const geometry = useMemo(() => {
    const rowY: Record<string, number> = {};
    let y = TOP;
    for (const row of config.rows) {
      rowY[row.label] = y;
      y += ROW_PITCH;
      if (config.aisle_after_row === row.label) y += AISLE;
    }
    const lastY = y - ROW_PITCH;
    const maxCols = Math.max(...config.rows.map((r) => (r.offset ?? 0) + r.count));
    return {
      rowY,
      width: LEFT + maxCols * PITCH + RIGHT,
      height: lastY + SEAT + BOTTOM,
    };
  }, [config]);

  const seatByKey = useMemo(() => new Map(seats.map((s) => [`${s.row_label}-${s.seat_number}`, s])), [seats]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  // Fit the drawing to the container.
  //   * Desktop (lg+): keep seats large and readable. Fit clamped to 0.8 – 1.3.
  //   * Mobile (< lg): start smaller so the whole map is visible without
  //     horizontal scrolling (user requested ~60%). Users can zoom in.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const calc = () => {
      const ratio = el.clientWidth / geometry.width;
      const isMobile = window.matchMedia ? window.matchMedia("(max-width: 1023px)").matches : true;
      const minFit = isMobile ? 0.52 : 0.78;
      const maxFit = isMobile ? 0.92 : 1.3;
      const defaultZoom = isMobile ? 0.60 : 1;
      setFit(Math.min(maxFit, Math.max(minFit, ratio)));
      setZoom(defaultZoom);
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, [geometry.width]);

  const scale = fit * zoom;
  const fireY = geometry.rowY[config.rows[0]?.label] ?? TOP;
  const entranceRow = config.rows[config.rows.length - 1];
  const entranceY = (geometry.rowY[entranceRow?.label] ?? TOP) - 2;
  const screenX = LEFT + 40;
  const screenW = geometry.width - RIGHT - screenX;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <Legend color={COLORS.free} stroke={COLORS.freeStroke} label="Available" />
          <Legend color={COLORS.selected} stroke={COLORS.selected} label="Your seats" />
          <Legend color={COLORS.taken} stroke={COLORS.takenStroke} label="Taken" mark />
        </div>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.7, +(z - 0.2).toFixed(2)))}
            className="rounded-full border border-border p-1.5 hover:bg-muted"><Minus className="h-4 w-4" /></button>
          <button type="button" onClick={() => setZoom(1)} className="px-2 text-xs font-semibold text-muted-foreground hover:text-foreground">
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(2, +(z + 0.2).toFixed(2)))}
            className="rounded-full border border-border p-1.5 hover:bg-muted"><Plus className="h-4 w-4" /></button>
        </div>
      </div>

      <div ref={wrapRef} className="overflow-auto rounded-2xl" style={{ backgroundColor: COLORS.panel, maxHeight: "75vh" }}>
        <svg
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
          width={Math.round(geometry.width * scale)}
          height={Math.round(geometry.height * scale)}
          role="group"
          aria-label="Cinema seat map"
          style={{ display: "block", margin: "0 auto" }}
        >
          {/* Screen */}
          <path
            d={`M ${screenX} 52 Q ${screenX + screenW / 2} 28 ${screenX + screenW} 52 L ${screenX + screenW} 62 Q ${screenX + screenW / 2} 38 ${screenX} 62 Z`}
            fill="#e8e8e8" opacity="0.9"
          />
          <text x={screenX + screenW / 2} y={30} textAnchor="middle" fontSize="12" fontWeight="700" letterSpacing="6" fill={COLORS.label}>
            SCREEN
          </text>

          {/* Exits on the left wall */}
          <ExitMarker x={6} y={fireY - 4} label="FIRE ESCAPE" />
          <ExitMarker x={6} y={entranceY} label="ENTRANCE" />

          {/* Rows */}
          {config.rows.map((row) => {
            const y = geometry.rowY[row.label];
            const offset = row.offset ?? 0;
            const firstX = LEFT + offset * PITCH;
            const lastX = firstX + (row.count - 1) * PITCH + SEAT;
            return (
              <g key={row.label}>
                <text x={firstX - 10} y={y + SEAT / 2 + 4} textAnchor="end" fontSize="12" fontWeight="700" fill={COLORS.label}>{row.label}</text>
                <text x={lastX + 10} y={y + SEAT / 2 + 4} textAnchor="start" fontSize="12" fontWeight="700" fill={COLORS.label}>{row.label}</text>
                {Array.from({ length: row.count }, (_, i) => {
                  const seat = seatByKey.get(`${row.label}-${i + 1}`);
                  if (!seat) return null;
                  const isMine = mine?.has(seat.id) ?? false;
                  const isSelected = selectedSet.has(seat.id);
                  const isTaken = taken.has(seat.id) && !isMine;
                  const x = firstX + i * PITCH;
                  const clickable = !isTaken && !disabled;
                  const state = isTaken ? "taken" : isSelected ? "selected" : "available";
                  return (
                    <g
                      key={seat.id}
                      transform={`translate(${x} ${y})`}
                      role="button"
                      tabIndex={clickable ? 0 : -1}
                      aria-label={`Row ${seat.row_label}, seat ${seat.seat_number}, ${state}`}
                      aria-pressed={isSelected}
                      aria-disabled={!clickable}
                      style={{ cursor: clickable ? "pointer" : "not-allowed", outline: "none" }}
                      onClick={() => { if (clickable) onToggle(seat); }}
                      onKeyDown={(e) => {
                        if (clickable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onToggle(seat); }
                      }}
                    >
                      <title>{`${seat.label}${isTaken ? " (taken)" : ""}`}</title>
                      <rect
                        width={SEAT} height={SEAT} rx={6}
                        fill={isTaken ? COLORS.taken : isSelected ? COLORS.selected : COLORS.free}
                        stroke={isTaken ? COLORS.takenStroke : isSelected ? COLORS.selected : COLORS.freeStroke}
                        strokeWidth={1}
                      />
                      {isTaken ? (
                        <path d={`M7 7 L${SEAT - 7} ${SEAT - 7} M${SEAT - 7} 7 L7 ${SEAT - 7}`} stroke={COLORS.takenMark} strokeWidth={1.5} strokeLinecap="round" />
                      ) : (
                        <text x={SEAT / 2} y={SEAT / 2 + 3.5} textAnchor="middle" fontSize="10" fontWeight={isSelected ? 800 : 500}
                          fill={isSelected ? COLORS.selectedText : COLORS.freeText} style={{ pointerEvents: "none" }}>
                          {seat.seat_number}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Screen at the top, row A at the front. Seat numbers run left to right.</p>
    </div>
  );
}

function ExitMarker({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <g>
      <rect x={x} y={y} width={78} height={26} rx={6} fill="none" stroke={COLORS.exit} strokeDasharray="4 3" strokeWidth={1.2} />
      <text x={x + 39} y={y + 17} textAnchor="middle" fontSize="9.5" fontWeight="700" letterSpacing="1" fill={COLORS.exit}>{label}</text>
    </g>
  );
}

function Legend({ color, stroke, label, mark }: { color: string; stroke: string; label: string; mark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="1" y="1" width="14" height="14" rx="4" fill={color} stroke={stroke} />
        {mark && <path d="M5 5 L11 11 M11 5 L5 11" stroke={COLORS.takenMark} strokeWidth="1.3" strokeLinecap="round" />}
      </svg>
      {label}
    </span>
  );
}
