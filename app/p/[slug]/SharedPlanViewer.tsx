"use client";

import { useState } from "react";
import type { NutritionResult, CyclingSchedule } from "@/app/_components/DietForm";
import { PrintPreview, type AiMeal, type ManualFood } from "@/app/_components/PrintPreview";

const DAY_SHORT = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

export interface SharedPlanData {
  result: NutritionResult;
  cyclingSchedule: CyclingSchedule | null;
  days: { aiMeals: AiMeal[] | null; manualFoods: ManualFood[] }[];
  notices: { method: string; water: string; tips: string };
  logoUrl: string | null;
  imageSize: number;
  date: string;
}

function dayHasMenu(d: { aiMeals: AiMeal[] | null; manualFoods: ManualFood[] } | undefined): boolean {
  if (!d) return false;
  return (!!d.aiMeals && d.aiMeals.length > 0) || d.manualFoods.length > 0;
}

export default function SharedPlanViewer({ data }: { data: SharedPlanData }) {
  const { result, cyclingSchedule, days, notices, logoUrl, imageSize, date } = data;
  const cycling = !!cyclingSchedule?.enabled;

  // Indices of days that actually have a menu (only these are shown to the client).
  const availableDays = cycling
    ? days.map((d, i) => ({ i, has: dayHasMenu(d) })).filter(x => x.has).map(x => x.i)
    : (dayHasMenu(days[0]) ? [0] : []);

  const [selectedIdx, setSelectedIdx] = useState(availableDays[0] ?? 0);

  if (availableDays.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gray-100">
        <p className="text-sm" style={{ color: "rgba(18,16,13,0.55)" }}>Thực đơn này chưa có nội dung.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">

      {/* ── Top bar: day picker (only days with a menu) + print ── */}
      <div className="no-print sticky top-0 z-10 shadow-md" style={{ background: "#12100d" }}>
        <div className="max-w-3xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-bold text-white">Thực đơn của {result.name}</span>

          {cycling && availableDays.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {availableDays.map(i => {
                const day = cyclingSchedule!.days[i];
                const phaseColor = day.phase === "high" ? "#eb0915" : day.phase === "medium" ? "#d97706" : "#3b82f6";
                const active = selectedIdx === i;
                return (
                  <button key={i} type="button" onClick={() => setSelectedIdx(i)}
                    className="rounded-lg px-2.5 py-1.5 flex flex-col items-center transition-all"
                    style={{
                      border: active ? `1.5px solid ${phaseColor}` : "1px solid rgba(255,255,255,0.15)",
                      background: active ? phaseColor : "rgba(255,255,255,0.06)",
                      color: active ? "#fff" : "rgba(255,255,255,0.7)",
                      minWidth: "48px",
                    }}>
                    <span style={{ fontSize: "11px", fontWeight: 700 }}>{DAY_SHORT[i]}</span>
                    <span style={{ fontSize: "8px", opacity: 0.85 }}>
                      {day.kcal >= 1000 ? `${(day.kcal / 1000).toFixed(1)}k` : day.kcal}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={() => window.print()}
            className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold"
            style={{ background: "#eb0915", color: "#ffffff" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            In / Lưu PDF
          </button>
        </div>
      </div>

      {/* ── A4 print area(s) — one page per day with a menu (all printed) ── */}
      <div className="py-6 px-4 flex justify-center">
        <div className="w-full" style={{ maxWidth: "794px" }}>
          {availableDays.map((i, pos) => (
            <div
              key={i}
              data-day-idx={i}
              className={`pdf-day bg-white shadow-2xl${selectedIdx === i ? " pdf-day-selected" : ""}`}
              style={{ width: "100%", minHeight: "1123px", marginTop: pos === 0 ? 0 : "24px" }}
            >
              <PrintPreview
                readOnly
                result={result}
                aiMeals={days[i].aiMeals}
                manualFoods={days[i].manualFoods}
                date={date}
                logoUrl={logoUrl}
                imageSize={imageSize}
                noticeMethod={notices.method}
                noticeWater={notices.water}
                noticeTips={notices.tips}
                printCyclingDay={cycling ? cyclingSchedule!.days[i] : null}
                cyclingSchedule={cycling ? cyclingSchedule : null}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Print CSS (mirror of the coach preview) ── */}
      <style>{`
        /* On screen: show only the selected day; print emits every menu day. */
        .pdf-day { display: none; }
        .pdf-day.pdf-day-selected { display: block; }

        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          *, *::before, *::after {
            font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          html, body { height: auto !important; overflow: visible !important; margin: 0 !important; padding: 0 !important; background: white !important; }
          .no-print { display: none !important; }
          .pdf-day {
            display: block !important;
            position: static !important;
            box-shadow: none !important;
            width: 794px !important;
            max-width: unset !important;
            min-height: unset !important;
            zoom: 0.82 !important;
            margin: 0 auto !important;
          }
          .pdf-day + .pdf-day { page-break-before: always !important; break-before: page !important; }
          table { break-inside: avoid !important; page-break-inside: avoid !important; }
          .pdf-day > div > div { break-inside: avoid !important; page-break-inside: avoid !important; }
          .pdf-day [data-print-block="roadmap"] { padding: 6px 10px !important; margin-bottom: 8px !important; break-inside: avoid !important; page-break-inside: avoid !important; }
          .pdf-day [data-print-block="roadmap"] > div { gap: 8px !important; }
          [contenteditable] { outline: none !important; border: none !important; }
        }
      `}</style>
    </div>
  );
}
