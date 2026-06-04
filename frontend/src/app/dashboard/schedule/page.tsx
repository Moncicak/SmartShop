"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Calendar, Home, Loader2, Plus, Trash2, X } from "lucide-react";
import { scheduleApi } from "@/lib/api";

// ── Constants ────────────────────────────────────────────────────────────────

const GRID_START = 6;
const GRID_END   = 23;
const PX_PER_MIN = 1.5;
const SNAP_MINS  = 15;
const GRID_H     = (GRID_END - GRID_START) * 60 * PX_PER_MIN;
const HOURS      = Array.from({ length: GRID_END - GRID_START }, (_, i) => GRID_START + i);
const TIME_COL_W = 52; // px — width of the time-label column

const DAYS_SHORT = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];
const DAYS_FULL  = ["Pondělí", "Úterý", "Středa", "Čtvrtek", "Pátek", "Sobota", "Neděle"];

// ── Activities ───────────────────────────────────────────────────────────────

const ACTIVITIES = [
  { key: "work",   label: "Práce",     bg: "bg-blue-50",   border: "border-blue-400",   text: "text-blue-700",   dot: "bg-blue-400"   },
  { key: "school", label: "Škola",     bg: "bg-violet-50", border: "border-violet-400", text: "text-violet-700", dot: "bg-violet-400" },
  { key: "gym",    label: "Posilovna", bg: "bg-orange-50", border: "border-orange-400", text: "text-orange-700", dot: "bg-orange-400" },
  { key: "sleep",  label: "Spánek",    bg: "bg-slate-100", border: "border-slate-300",  text: "text-slate-500",  dot: "bg-slate-400"  },
  { key: "other",  label: "Jiné",      bg: "bg-amber-50",  border: "border-amber-400",  text: "text-amber-700",  dot: "bg-amber-400"  },
] as const;

type ActivityKey = (typeof ACTIVITIES)[number]["key"];

function actCfg(key: string) {
  return ACTIVITIES.find((a) => a.key === key) ?? ACTIVITIES[4];
}

// ── Types ────────────────────────────────────────────────────────────────────

interface Slot {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  activity_type: string;
  label: string | null;
  is_home: boolean;
}

interface FormState {
  day: number;
  start: string;
  end: string;
  type: ActivityKey;
  label: string;
  home: boolean;
}

// Internal drag refs — not rendered, mutation-only
interface CreateDragRef {
  kind: "create";
  day: number;
  anchorY: number;
  currentY: number;
}

interface MoveDragRef {
  kind: "move";
  slot: Slot;
  slotPxH: number;  // pixel height of the slot (constant during drag)
  offsetY: number;  // where in the slot the user grabbed (px from slot top)
  currentY: number; // raw mouse Y in grid coords
  currentDay: number;
  hasMoved: boolean;
  initClientY: number; // for click vs drag detection
}

// ── Display state for ghost rendering ────────────────────────────────────────

interface CreateGhost {
  kind: "create";
  day: number;
  top: number;
  height: number;
  startTime: string;
  endTime: string;
}

interface MoveGhost {
  kind: "move";
  slot: Slot;
  day: number;
  top: number;       // snapped
  height: number;    // constant
  newStart: string;
  newEnd: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function t2m(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function m2t(mins: number) {
  const c = Math.max(GRID_START * 60, Math.min(GRID_END * 60, mins));
  return `${String(Math.floor(c / 60)).padStart(2, "0")}:${String(c % 60).padStart(2, "0")}`;
}

function snapPx(px: number) {
  return Math.round(px / (PX_PER_MIN * SNAP_MINS)) * (PX_PER_MIN * SNAP_MINS);
}

function yToMins(px: number) {
  return Math.round(px / PX_PER_MIN / SNAP_MINS) * SNAP_MINS + GRID_START * 60;
}

function slotPxTop(start: string) {
  return (t2m(start) - GRID_START * 60) * PX_PER_MIN;
}

function slotPxH(start: string, end: string) {
  return Math.max((t2m(end) - t2m(start)) * PX_PER_MIN, 22);
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const [slots,    setSlots]    = useState<Slot[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState<FormState>({
    day: 0, start: "09:00", end: "10:00", type: "work", label: "", home: false,
  });

  const [selected,    setSelected]    = useState<Slot | null>(null);
  const [popoverPos,  setPopoverPos]  = useState({ x: 0, y: 0 });

  // Ghost state for rendering (both create and move)
  const [ghost, setGhost] = useState<CreateGhost | MoveGhost | null>(null);

  // Stable refs for drag state (avoids stale closure in document handlers)
  const activeDragRef = useRef<CreateDragRef | MoveDragRef | null>(null);
  const scrollRef     = useRef<HTMLDivElement>(null);
  const gridRef       = useRef<HTMLDivElement>(null); // inner grid div for X calc

  // ── Data ─────────────────────────────────────────────────────────────────

  async function load() {
    try {
      const res = await scheduleApi.getAll();
      setSlots(res.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // ── Coordinate helpers ────────────────────────────────────────────────────

  function getGridY(clientY: number): number {
    if (!scrollRef.current) return 0;
    const rect = scrollRef.current.getBoundingClientRect();
    return Math.max(0, Math.min(clientY - rect.top + scrollRef.current.scrollTop, GRID_H));
  }

  function getDay(clientX: number): number {
    if (!scrollRef.current) return 0;
    const rect = scrollRef.current.getBoundingClientRect();
    const colW = (rect.width - TIME_COL_W) / 7;
    return Math.max(0, Math.min(6, Math.floor((clientX - rect.left - TIME_COL_W) / colW)));
  }

  // ── Document-level mouse handlers ─────────────────────────────────────────

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const drag = activeDragRef.current;
      if (!drag) return;

      const y = getGridY(e.clientY);

      if (drag.kind === "create") {
        drag.currentY = y;
        const minY = Math.min(drag.anchorY, y);
        const maxY = Math.max(drag.anchorY, y);
        const snapMin = snapPx(minY);
        const snapMax = snapPx(Math.max(maxY, minY + PX_PER_MIN * SNAP_MINS));
        const height  = Math.max(snapMax - snapMin, PX_PER_MIN * SNAP_MINS);
        setGhost({
          kind: "create",
          day: drag.day,
          top: snapMin,
          height,
          startTime: m2t(yToMins(snapMin)),
          endTime:   m2t(yToMins(snapMin + height)),
        });

      } else {
        // move
        const day  = getDay(e.clientX);
        const dist = Math.abs(e.clientY - drag.initClientY);
        if (dist > 5) drag.hasMoved = true;

        drag.currentY   = y;
        drag.currentDay = day;

        if (drag.hasMoved) {
          const rawTop    = y - drag.offsetY;
          const clampedTop = Math.max(0, Math.min(GRID_H - drag.slotPxH, rawTop));
          const snappedTop = snapPx(clampedTop);
          const duration   = t2m(drag.slot.end_time) - t2m(drag.slot.start_time);
          const startMins  = yToMins(snappedTop);
          const endMins    = startMins + duration;
          setGhost({
            kind:     "move",
            slot:     drag.slot,
            day,
            top:      snappedTop,
            height:   drag.slotPxH,
            newStart: m2t(startMins),
            newEnd:   m2t(Math.min(endMins, GRID_END * 60)),
          });
        }
      }
    }

    function onMouseUp(e: MouseEvent) {
      const drag = activeDragRef.current;
      if (!drag) return;
      activeDragRef.current = null;
      setGhost(null);

      if (drag.kind === "create") {
        const minY = Math.min(drag.anchorY, drag.currentY);
        const maxY = Math.max(drag.anchorY, drag.currentY);
        const isDrag = maxY - minY >= PX_PER_MIN * SNAP_MINS * 0.8;
        const snapMin = snapPx(minY);
        const snapMax = snapPx(Math.max(maxY, minY + PX_PER_MIN * SNAP_MINS));

        if (isDrag) {
          const start = m2t(yToMins(snapMin));
          const end   = m2t(yToMins(snapMax));
          setForm((f) => ({ ...f, day: drag.day, start, end }));
        } else {
          const startMins = yToMins(snapPx(minY));
          setForm((f) => ({ ...f, day: drag.day, start: m2t(startMins), end: m2t(startMins + 60) }));
        }
        setSelected(null);
        setShowForm(true);

      } else {
        // move
        if (!drag.hasMoved) {
          // treat as click → show popover
          setSelected(drag.slot);
          setPopoverPos({ x: e.clientX + 8, y: e.clientY - 20 });
          return;
        }
        const rawTop     = drag.currentY - drag.offsetY;
        const clampedTop = Math.max(0, Math.min(GRID_H - drag.slotPxH, rawTop));
        const snappedTop = snapPx(clampedTop);
        const duration   = t2m(drag.slot.end_time) - t2m(drag.slot.start_time);
        const startMins  = yToMins(snappedTop);
        const newStart   = m2t(startMins);
        const newEnd     = m2t(Math.min(startMins + duration, GRID_END * 60));
        const newDay     = drag.currentDay;

        // Optimistic update
        setSlots((prev) =>
          prev.map((s) =>
            s.id === drag.slot.id
              ? { ...s, day_of_week: newDay, start_time: newStart, end_time: newEnd }
              : s
          )
        );
        scheduleApi.update(drag.slot.id, {
          day_of_week: newDay,
          start_time:  newStart,
          end_time:    newEnd,
        }).catch(() => load()); // revert on error
      }
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup",   onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup",   onMouseUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Column mousedown (create drag) ────────────────────────────────────────

  function handleColMouseDown(e: React.MouseEvent<HTMLDivElement>, dayIdx: number) {
    if ((e.target as HTMLElement).closest("[data-slot]")) return;
    if (e.button !== 0) return;
    e.preventDefault();
    setSelected(null);
    setShowForm(false);
    const y: number = getGridY(e.clientY);
    activeDragRef.current = { kind: "create", day: dayIdx, anchorY: y, currentY: y };
    setGhost({
      kind: "create", day: dayIdx,
      top: snapPx(y), height: PX_PER_MIN * SNAP_MINS,
      startTime: m2t(yToMins(snapPx(y))), endTime: m2t(yToMins(snapPx(y)) + SNAP_MINS),
    });
  }

  // ── Slot mousedown (move drag) ────────────────────────────────────────────

  function handleSlotMouseDown(e: React.MouseEvent, slot: Slot, top: number, height: number) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setSelected(null);
    setShowForm(false);
    const mouseGridY = getGridY(e.clientY);
    const offsetY    = Math.max(0, mouseGridY - top);
    activeDragRef.current = {
      kind: "move",
      slot,
      slotPxH: height,
      offsetY,
      currentY: mouseGridY,
      currentDay: slot.day_of_week,
      hasMoved: false,
      initClientY: e.clientY,
    };
  }

  // ── Close popover on outside click ────────────────────────────────────────

  useEffect(() => {
    function handler(e: MouseEvent) {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-popover]") && !t.closest("[data-slot]")) setSelected(null);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Save / delete ─────────────────────────────────────────────────────────

  async function saveSlot() {
    if (t2m(form.end) <= t2m(form.start)) return;
    setSaving(true);
    try {
      await scheduleApi.create({
        day_of_week:   form.day,
        start_time:    form.start,
        end_time:      form.end,
        activity_type: form.type,
        label:         form.label || undefined,
        is_home:       form.home,
      });
      await load();
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  }

  async function deleteSlot(id: string) {
    await scheduleApi.delete(id);
    setSelected(null);
    await load();
  }

  const isMoving = ghost?.kind === "move";
  const movingId = isMoving ? (ghost as MoveGhost).slot.id : null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-gray-50"
      style={{ userSelect: ghost ? "none" : undefined, cursor: ghost?.kind === "move" ? "grabbing" : undefined }}
    >
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft className="w-4 h-4 text-gray-500" />
            </Link>
            <div>
              <h1 className="font-bold text-gray-900 leading-tight">Můj rozvrh</h1>
              <p className="text-xs text-gray-400">Přetáhni pro vytvoření · táhni slot pro přesun</p>
            </div>
          </div>
          <button
            onClick={() => { setForm((f) => ({ ...f, start: "09:00", end: "10:00" })); setShowForm(true); }}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Přidat slot</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* ── Legend ── */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-5 text-xs text-gray-500">
          {ACTIVITIES.map((a) => (
            <span key={a.key} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${a.dot}`} />
              {a.label}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-teal-600 border-l border-gray-200 pl-4 ml-1">
            <Home className="w-3 h-3" /> Doma = dostupný pro doručení
          </span>
        </div>

        {/* ── Calendar ── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Day header */}
          <div className="grid border-b border-gray-100 bg-white" style={{ gridTemplateColumns: `${TIME_COL_W}px repeat(7, 1fr)` }}>
            <div className="py-3" />
            {DAYS_SHORT.map((d) => (
              <div key={d} className="py-3 text-center border-l border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{d}</p>
              </div>
            ))}
          </div>

          {/* Scrollable body */}
          <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: 560 }}>
            <div ref={gridRef} className="grid" style={{ gridTemplateColumns: `${TIME_COL_W}px repeat(7, 1fr)` }}>

              {/* Time labels */}
              <div className="relative select-none pointer-events-none" style={{ height: GRID_H }}>
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="absolute right-2 text-[10px] text-gray-300 font-medium"
                    style={{ top: (h - GRID_START) * 60 * PX_PER_MIN - 7 }}
                  >
                    {h}:00
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {DAYS_SHORT.map((_, dayIdx) => {
                const daySlots    = slots.filter((s) => s.day_of_week === dayIdx);
                const createHere  = ghost?.kind === "create" && (ghost as CreateGhost).day === dayIdx;
                const moveHere    = ghost?.kind === "move"   && (ghost as MoveGhost).day   === dayIdx;

                return (
                  <div
                    key={dayIdx}
                    className={`relative border-l border-gray-100 transition-colors ${
                      ghost
                        ? ghost.kind === "move" && moveHere
                          ? "bg-blue-50/20"
                          : ""
                        : "cursor-crosshair hover:bg-blue-50/20"
                    }`}
                    style={{ height: GRID_H }}
                    onMouseDown={(e) => handleColMouseDown(e, dayIdx)}
                  >
                    {/* Grid lines */}
                    {HOURS.map((h) => (
                      <div key={h}   className="absolute inset-x-0 border-t border-gray-100 pointer-events-none" style={{ top: (h - GRID_START) * 60 * PX_PER_MIN }} />
                    ))}
                    {HOURS.map((h) => (
                      <div key={`${h}h`} className="absolute inset-x-0 border-t border-gray-50 pointer-events-none"  style={{ top: (h - GRID_START) * 60 * PX_PER_MIN + 30 * PX_PER_MIN }} />
                    ))}

                    {/* Existing slots */}
                    {daySlots.map((slot) => {
                      const cfg      = actCfg(slot.activity_type);
                      const top      = slotPxTop(slot.start_time);
                      const height   = slotPxH(slot.start_time, slot.end_time);
                      const isSel    = selected?.id === slot.id;
                      const isBeingMoved = slot.id === movingId;

                      return (
                        <div
                          key={slot.id}
                          data-slot
                          className={`
                            absolute left-0.5 right-0.5 rounded-md border-l-[3px] px-1.5 py-0.5
                            select-none transition-all
                            ${cfg.bg} ${slot.is_home ? "border-l-teal-500" : cfg.border} ${cfg.text}
                            ${isBeingMoved
                              ? "opacity-30 pointer-events-none"
                              : `cursor-grab active:cursor-grabbing ${isSel ? "ring-2 ring-blue-400 ring-offset-1 shadow-md z-10" : "hover:shadow-sm hover:brightness-95"}`
                            }
                          `}
                          style={{ top, height, overflow: "hidden" }}
                          onMouseDown={(e) => handleSlotMouseDown(e, slot, top, height)}
                        >
                          <div className="flex items-center gap-0.5">
                            {slot.is_home && <Home className="w-2.5 h-2.5 text-teal-500 flex-shrink-0" />}
                            <p className="text-[11px] font-semibold leading-tight truncate">
                              {slot.label || cfg.label}
                            </p>
                          </div>
                          {height > 38 && (
                            <p className="text-[10px] opacity-60 leading-tight mt-0.5">
                              {slot.start_time}–{slot.end_time}
                            </p>
                          )}
                        </div>
                      );
                    })}

                    {/* Create ghost */}
                    {createHere && ghost?.kind === "create" && (() => {
                      const g = ghost as CreateGhost;
                      return (
                        <div
                          className="absolute left-0.5 right-0.5 rounded-md border-2 border-dashed border-blue-400 bg-blue-100/70 pointer-events-none z-20 flex flex-col items-center justify-center gap-0.5"
                          style={{ top: g.top, height: g.height, overflow: "hidden" }}
                        >
                          <p className="text-[11px] font-bold text-blue-600 leading-tight">{g.startTime}</p>
                          {g.height > 36 && <p className="text-[10px] text-blue-400 leading-tight">{g.endTime}</p>}
                        </div>
                      );
                    })()}

                    {/* Move ghost */}
                    {moveHere && ghost?.kind === "move" && (() => {
                      const g   = ghost as MoveGhost;
                      const cfg = actCfg(g.slot.activity_type);
                      return (
                        <div
                          className={`
                            absolute left-0.5 right-0.5 rounded-md border-l-[3px] px-1.5 py-0.5
                            pointer-events-none z-20 shadow-2xl ring-2 ring-blue-300 opacity-90
                            ${cfg.bg} ${g.slot.is_home ? "border-l-teal-500" : cfg.border}
                          `}
                          style={{ top: g.top, height: g.height, overflow: "hidden" }}
                        >
                          <div className="flex items-center gap-0.5">
                            {g.slot.is_home && <Home className="w-2.5 h-2.5 text-teal-500 flex-shrink-0" />}
                            <p className={`text-[11px] font-semibold leading-tight truncate ${cfg.text}`}>
                              {g.slot.label || cfg.label}
                            </p>
                          </div>
                          {g.height > 38 && (
                            <p className={`text-[10px] opacity-60 leading-tight mt-0.5 ${cfg.text}`}>
                              {g.newStart}–{g.newEnd}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Empty state */}
        {slots.length === 0 && !ghost && (
          <div className="text-center py-14 text-gray-300">
            <Calendar className="w-14 h-14 mx-auto mb-3 opacity-40" />
            <p className="font-semibold text-gray-400">Rozvrh je prázdný</p>
            <p className="text-sm mt-1 text-gray-300">Přetáhni v kalendáři pro vytvoření slotu</p>
          </div>
        )}
      </main>

      {/* ── Slot popover ── */}
      {selected && (
        <div
          data-popover
          className="fixed z-50 bg-white rounded-xl shadow-2xl border border-gray-200 p-3.5 w-52"
          style={{
            left: Math.min(popoverPos.x, typeof window !== "undefined" ? window.innerWidth - 216 : 800),
            top:  Math.min(Math.max(popoverPos.y, 60), typeof window !== "undefined" ? window.innerHeight - 160 : 600),
          }}
        >
          {(() => {
            const cfg = actCfg(selected.activity_type);
            return (
              <>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${cfg.dot} flex-shrink-0`} />
                      <p className="font-semibold text-sm text-gray-900 leading-tight">
                        {selected.label || cfg.label}
                      </p>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 ml-3.5">
                      {DAYS_FULL[selected.day_of_week]}, {selected.start_time}–{selected.end_time}
                    </p>
                  </div>
                  <button onClick={() => setSelected(null)} className="p-0.5 hover:bg-gray-100 rounded transition-colors flex-shrink-0">
                    <X className="w-3.5 h-3.5 text-gray-400" />
                  </button>
                </div>
                {selected.is_home && (
                  <div className="flex items-center gap-1.5 text-xs text-teal-600 bg-teal-50 rounded-lg px-2.5 py-1.5 mb-2">
                    <Home className="w-3 h-3" /> Dostupný pro doručení
                  </div>
                )}
                <button
                  onClick={() => deleteSlot(selected.id)}
                  className="w-full flex items-center justify-center gap-1.5 text-xs text-red-500 hover:bg-red-50 rounded-lg py-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Smazat slot
                </button>
              </>
            );
          })()}
        </div>
      )}

      {/* ── Add form modal ── */}
      {showForm && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowForm(false)}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-gray-900">Přidat do rozvrhu</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            {/* Day */}
            <div className="mb-4">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 block">Den</label>
              <div className="grid grid-cols-7 gap-1">
                {DAYS_SHORT.map((d, i) => (
                  <button
                    key={d}
                    onClick={() => setForm((f) => ({ ...f, day: i }))}
                    className={`py-1.5 text-xs font-bold rounded-lg transition-colors ${
                      form.day === i ? "bg-blue-600 text-white shadow-sm" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Time */}
            <div className="grid grid-cols-2 gap-3 mb-1">
              {(["start", "end"] as const).map((key) => (
                <div key={key}>
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 block">
                    {key === "start" ? "Od" : "Do"}
                  </label>
                  <input
                    type="time"
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                  />
                </div>
              ))}
            </div>
            {t2m(form.end) <= t2m(form.start)
              ? <p className="text-xs text-red-500 mb-3 ml-1">Konec musí být po začátku</p>
              : <div className="mb-4" />
            }

            {/* Activity */}
            <div className="mb-4">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 block">Aktivita</label>
              <div className="grid grid-cols-3 gap-2">
                {ACTIVITIES.map((a) => (
                  <button
                    key={a.key}
                    onClick={() => setForm((f) => ({ ...f, type: a.key }))}
                    className={`py-2 px-2 text-xs font-semibold rounded-xl border-2 transition-all ${
                      form.type === a.key
                        ? `${a.bg} ${a.border} ${a.text}`
                        : "border-gray-200 text-gray-400 hover:border-gray-300 bg-white"
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Label */}
            <div className="mb-4">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 block">
                Popis <span className="normal-case font-normal">(nepovinný)</span>
              </label>
              <input
                type="text"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="Např. Home office, Přednáška…"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
              />
            </div>

            {/* Is home */}
            <button
              onClick={() => setForm((f) => ({ ...f, home: !f.home }))}
              className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all mb-5 text-left ${
                form.home ? "bg-teal-50 border-teal-300" : "bg-gray-50 border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${form.home ? "bg-teal-500" : "bg-gray-300"}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.home ? "translate-x-5" : "translate-x-0.5"}`} />
              </div>
              <div>
                <p className={`text-sm font-semibold ${form.home ? "text-teal-800" : "text-gray-600"}`}>Jsem doma</p>
                <p className={`text-xs mt-0.5 ${form.home ? "text-teal-600" : "text-gray-400"}`}>
                  Agent může naplánovat doručení v tento čas
                </p>
              </div>
              <Home className={`w-4 h-4 ml-auto flex-shrink-0 ${form.home ? "text-teal-500" : "text-gray-300"}`} />
            </button>

            <button
              onClick={saveSlot}
              disabled={saving || t2m(form.end) <= t2m(form.start)}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl transition-colors shadow-sm"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Přidat do rozvrhu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
