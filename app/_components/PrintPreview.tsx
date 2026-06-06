"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import type { NutritionResult, CyclingSchedule } from "./DietForm";
import { FOODS, type FoodItem } from "@/lib/foods-data";

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface AiMeal {
  mealName: string;
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

export interface ManualFood {
  id: string;
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  sourceRows?: Array<{ food: FoodItem; grams: number }>;
}

export type PhaseKey = "low" | "medium" | "high";
/** ManualFood extended with per-cell rich-HTML snapshot (print-preview only) */
type PrintFood = ManualFood & { richHtml: string };

// ─── Shared food helpers (used by both MealPlanSection & PrintPreview) ─────────

export function computeRowMacros(food: FoodItem, grams: number) {
  const r = grams / 100;
  return {
    calories: Math.round(food.calories * r),
    protein: Math.round(food.protein * r),
    fat: Math.round(food.fat * r),
    carbs: Math.round(food.carbs * r),
  };
}

export function searchFoods(query: string): FoodItem[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase().trim();
  return FOODS.filter(f =>
    f.name.toLowerCase().includes(q) ||
    (f.nameEn ?? "").toLowerCase().includes(q)
  )
    .sort((a, b) => {
      const aS = a.name.toLowerCase().startsWith(q) || (a.nameEn ?? "").toLowerCase().startsWith(q);
      const bS = b.name.toLowerCase().startsWith(q) || (b.nameEn ?? "").toLowerCase().startsWith(q);
      return aS === bS ? 0 : aS ? -1 : 1;
    })
    .slice(0, 8);
}

const GOAL_LABEL_PDF: Record<string, string> = {
  lose: "Giảm cân", fat_loss: "Giảm mỡ", gain: "Tăng cân", maintain: "Duy trì",
};

// ─── Rich-text toolbar (floating, portal) ────────────────────────────────────

const RT_EMOJIS = ["🥗","🥩","🍗","🐟","🥚","🧀","🥑","🍎","🥦","🥕","🍚","🍞","🥜","🥛","☕","💪","🏃","🔥","✅","⭐","❤️","😊"];
const RT_COLORS = ["#12100d","#eb0915","#1a6dd4","#16a34a","#d97706","#7c3aed","#db2777","#0891b2","#ffffff"];

function RtBtn({ title, onCmd, children }: { title: string; onCmd: () => void; children: React.ReactNode }) {
  return (
    <button
      title={title}
      className="no-print"
      onMouseDown={(e) => { e.preventDefault(); onCmd(); }}
      style={{ background: "none", border: "none", color: "#fff", padding: "3px 7px", borderRadius: "4px", cursor: "pointer", fontSize: "13px", fontWeight: 700, lineHeight: 1, fontFamily: "sans-serif" }}
      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.15)")}
      onMouseLeave={e => (e.currentTarget.style.background = "none")}
    >
      {children}
    </button>
  );
}

function RichToolbar() {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showColor, setShowColor] = useState(false);

  useEffect(() => {
    const handler = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) { setPos(null); return; }
      const anchor = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
      if (!anchor?.closest("[data-rt]")) { setPos(null); return; }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      setPos({ top: rect.top + window.scrollY - 46, left: Math.max(4, rect.left + window.scrollX) });
    };
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, []);

  const exec = (cmd: string, val?: string) => document.execCommand(cmd, false, val);

  if (!pos) return null;
  return createPortal(
    <div
      className="no-print"
      style={{ position: "absolute", top: pos.top, left: pos.left, zIndex: 99999, background: "#1c1c1e", borderRadius: "8px", display: "flex", alignItems: "center", gap: "1px", padding: "4px 6px", boxShadow: "0 4px 20px rgba(0,0,0,0.4)", userSelect: "none" }}
      onMouseDown={e => e.preventDefault()}
    >
      <RtBtn title="Bold" onCmd={() => exec("bold")}><b>B</b></RtBtn>
      <RtBtn title="Italic" onCmd={() => exec("italic")}><i>I</i></RtBtn>
      <RtBtn title="Underline" onCmd={() => exec("underline")}><u>U</u></RtBtn>
      <RtBtn title="Strikethrough" onCmd={() => exec("strikeThrough")}><s>S</s></RtBtn>
      <div style={{ width: "1px", height: "16px", background: "rgba(255,255,255,0.2)", margin: "0 3px" }} />
      {/* Color picker */}
      <div style={{ position: "relative" }}>
        <RtBtn title="Màu chữ" onCmd={() => { setShowColor(v => !v); setShowEmoji(false); }}>
          <span style={{ borderBottom: "3px solid #eb0915" }}>A</span>
        </RtBtn>
        {showColor && (
          <div onMouseDown={e => e.preventDefault()} style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, background: "#fff", borderRadius: "8px", padding: "8px", display: "flex", flexWrap: "wrap", gap: "5px", width: "116px", boxShadow: "0 4px 12px rgba(0,0,0,0.2)", zIndex: 1 }}>
            {RT_COLORS.map(c => (
              <div key={c} onMouseDown={e => { e.preventDefault(); exec("foreColor", c); setShowColor(false); }}
                style={{ width: "18px", height: "18px", borderRadius: "50%", background: c, cursor: "pointer", border: c === "#ffffff" ? "1px solid #ccc" : "2px solid transparent", outline: "2px solid transparent", transition: "outline 0.1s" }}
                onMouseEnter={e => ((e.currentTarget as HTMLDivElement).style.outline = `2px solid ${c}`)}
                onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.outline = "2px solid transparent")}
              />
            ))}
          </div>
        )}
      </div>
      <div style={{ width: "1px", height: "16px", background: "rgba(255,255,255,0.2)", margin: "0 3px" }} />
      {/* Emoji picker */}
      <div style={{ position: "relative" }}>
        <RtBtn title="Emoji" onCmd={() => { setShowEmoji(v => !v); setShowColor(false); }}>😊</RtBtn>
        {showEmoji && (
          <div onMouseDown={e => e.preventDefault()} style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, background: "#fff", borderRadius: "8px", padding: "8px", display: "flex", flexWrap: "wrap", gap: "3px", width: "196px", boxShadow: "0 4px 12px rgba(0,0,0,0.2)", zIndex: 1 }}>
            {RT_EMOJIS.map(em => (
              <span key={em} onMouseDown={e => { e.preventDefault(); exec("insertText", em); setShowEmoji(false); }}
                style={{ fontSize: "18px", cursor: "pointer", padding: "2px 3px", borderRadius: "4px", lineHeight: 1 }}
                onMouseEnter={e => ((e.currentTarget as HTMLSpanElement).style.background = "rgba(0,0,0,0.07)")}
                onMouseLeave={e => ((e.currentTarget as HTMLSpanElement).style.background = "")}
              >{em}</span>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// ─── FoodNameCell: rich-text editable name + DB search in one cell ───────────
// • Renders a [data-rt] contentEditable div (rich-text toolbar activates on selection)
// • When hovering the parent row, a 🔍 icon appears (no-print)
// • Clicking 🔍 opens a DB search dropdown; picking a food preserves rich-text wrapping
// • In readOnly mode: not editable, no search icon/dropdown (customer view)

interface FoodNameCellProps {
  richHtml: string;
  isHovered: boolean;
  readOnly?: boolean;
  onFoodPicked: (food: FoodItem, newHtml: string) => void;
}

function FoodNameCell({ richHtml, isHovered, readOnly = false, onFoodPicked }: FoodNameCellProps) {
  const ref = useRef<HTMLDivElement>(null);
  const prevRef = useRef(richHtml);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const results = query.trim() ? searchFoods(query) : [];

  // Set innerHTML on mount (avoids dangerouslySetInnerHTML + contentEditable conflict)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (ref.current) { ref.current.innerHTML = richHtml; prevRef.current = richHtml; }
  }, []);

  // Sync from parent when richHtml prop changes (i.e. after a food pick)
  useEffect(() => {
    if (richHtml !== prevRef.current && ref.current && document.activeElement !== ref.current) {
      ref.current.innerHTML = richHtml;
      prevRef.current = richHtml;
    }
  }, [richHtml]);

  const handlePick = (food: FoodItem) => {
    const curHtml = ref.current?.innerHTML ?? "";
    const curText = (ref.current?.textContent ?? "").trim();
    let newHtml = food.name;
    // Preserve existing rich-text wrapper tags: replace only the text node content
    if (curText && curHtml !== curText) {
      try {
        const esc = curText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const replaced = curHtml.replace(new RegExp(esc), food.name);
        if (replaced !== curHtml) newHtml = replaced;
      } catch { /* fall back to plain name */ }
    }
    setSearchOpen(false);
    setQuery("");
    onFoodPicked(food, newHtml);
  };

  const openSearch = () => { setSearchOpen(true); setQuery(""); };

  return (
    <>
      {/* Editable name (rich-text, always visible including in print) */}
      <div
        ref={ref}
        data-rt
        contentEditable={!readOnly}
        suppressContentEditableWarning
        style={{ outline: "none", minHeight: "1em", paddingRight: !readOnly && isHovered ? "46px" : undefined }}
      />

      {/* Search icon – no-print, shown on row hover (editable only) */}
      {!readOnly && isHovered && (
        <button
          className="no-print"
          onClick={openSearch}
          title="Tìm trong database thực phẩm"
          style={{ position: "absolute", top: "50%", right: "26px", transform: "translateY(-50%)", background: "rgba(26,109,212,0.12)", border: "none", color: "#1a6dd4", borderRadius: "50%", width: "18px", height: "18px", cursor: "pointer", fontSize: "11px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          🔍
        </button>
      )}

      {/* Search dropdown – no-print, absolutely positioned below the cell */}
      {!readOnly && searchOpen && (
        <div
          className="no-print"
          style={{ position: "absolute", left: 0, top: "calc(100% + 2px)", zIndex: 9999, width: "300px", background: "#fff", borderRadius: "10px", boxShadow: "0 8px 28px rgba(0,0,0,0.18)", border: "1px solid rgba(18,16,13,0.08)", overflow: "hidden" }}>
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Escape" && setSearchOpen(false)}
            placeholder="Tìm thực phẩm trong database..."
            style={{ display: "block", width: "100%", padding: "9px 12px", border: "none", borderBottom: "1px solid rgba(18,16,13,0.07)", fontSize: "12px", outline: "none", boxSizing: "border-box" }}
          />
          {results.slice(0, 7).map(f => (
            <button
              key={f.name}
              type="button"
              onMouseDown={e => { e.preventDefault(); handlePick(f); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", border: "none", background: "none", cursor: "pointer", borderBottom: "1px solid rgba(18,16,13,0.04)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(235,9,21,0.045)")}
              onMouseLeave={e => (e.currentTarget.style.background = "")}>
              <div style={{ fontWeight: 600, fontSize: "12px", color: "#12100d" }}>{f.name}</div>
              <div style={{ fontSize: "10px", color: "rgba(18,16,13,0.4)", marginTop: "1px" }}>
                {f.calories} kcal · P:{f.protein}g · F:{f.fat}g · C:{f.carbs}g /{f.tag === "drink" ? "100ml" : "100g"}
              </div>
            </button>
          ))}
          {query.trim() && results.length === 0 && (
            <div style={{ padding: "10px 12px", fontSize: "12px", color: "rgba(18,16,13,0.38)" }}>Không tìm thấy kết quả</div>
          )}
        </div>
      )}
    </>
  );
}

// ─── PrintPreview (the full editable + printable PDF template) ────────────────

export function PrintPreview({
  result, aiMeals, manualFoods, date, logoUrl, imageSize, noticeMethod, noticeWater, noticeTips, printCyclingDay, cyclingSchedule, readOnly = false, showToolbar = true, onPhaseNavigate,
}: {
  result: NutritionResult;
  aiMeals: AiMeal[] | null;
  manualFoods: ManualFood[];
  date: string;
  logoUrl: string | null;
  imageSize: number;
  noticeMethod: string;
  noticeWater: string;
  noticeTips: string;
  printCyclingDay: { kcal: number; protein: number; fat: number; carbs: number; phase: "high" | "medium" | "low" } | null;
  cyclingSchedule: CyclingSchedule | null;
  readOnly?: boolean;
  /** Render the shared floating rich-text toolbar. When several PrintPreviews are
   *  mounted at once (per-day PDF), only one instance should render it. */
  showToolbar?: boolean;
  /** Clicking a Low/Medium/High phase column navigates to that phase's day so its
   *  selected meals are shown. When omitted, phase click only re-highlights totals. */
  onPhaseNavigate?: (phase: PhaseKey) => void;
}) {
  const editable = !readOnly;
  const th: React.CSSProperties = { padding: "9px 13px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", background: "#eb0915", color: "#ffffff", fontFamily: "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", textAlign: "left" };
  const thDark: React.CSSProperties = { ...th, background: "#12100d" };
  const td: React.CSSProperties = { padding: "9px 13px", fontSize: "12px", borderBottom: "1px solid rgba(18,16,13,0.07)", color: "#12100d", fontFamily: "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" };
  const tdRight: React.CSSProperties = { ...td, textAlign: "right" };
  const tdCenter: React.CSSProperties = { ...td, textAlign: "center" };
  const tdBold: React.CSSProperties = { ...td, fontWeight: 700 };

  const aiGrand = aiMeals
    ? aiMeals.reduce((a, m) => ({ cal: a.cal + m.calories, p: a.p + m.protein, f: a.f + m.fat, c: a.c + m.carbs }), { cal: 0, p: 0, f: 0, c: 0 })
    : null;
  const manualTotal = manualFoods.reduce((a, f) => ({ cal: a.cal + f.calories, p: a.p + f.protein, f: a.f + f.fat, c: a.c + f.carbs }), { cal: 0, p: 0, f: 0, c: 0 });

  // ── Cycling phase data (read-only, locked) ─────────────────────────────────
  const phaseVals = cyclingSchedule ? (() => {
    const fd = (p: PhaseKey) => cyclingSchedule.days.find(d => d.phase === p);
    const lo = fd("low"); const me = fd("medium"); const hi = fd("high");
    return {
      low:    { kcal: cyclingSchedule.lowCalKcal,  protein: lo?.protein ?? result.protein, fat: lo?.fat ?? result.fat, carbs: lo?.carbs ?? result.carbs },
      medium: { kcal: cyclingSchedule.medCalKcal,  protein: me?.protein ?? result.protein, fat: me?.fat ?? result.fat, carbs: me?.carbs ?? result.carbs },
      high:   { kcal: cyclingSchedule.highCalKcal, protein: hi?.protein ?? result.protein, fat: hi?.fat ?? result.fat, carbs: hi?.carbs ?? result.carbs },
    };
  })() : null;

  // ── Active-phase selection (locked in readOnly to the day's phase) ──────────
  // Each preview page represents exactly one cycling day, so the highlighted phase
  // always follows that day's phase. Clicking a phase navigates to that phase's day;
  // the page that becomes visible already highlights it. Deriving it (instead of a
  // separate local state) avoids the one-click-behind stale highlight.
  const activePhase: PhaseKey = printCyclingDay?.phase ?? "medium";
  const pickPhase = (p: PhaseKey) => {
    if (editable) onPhaseNavigate?.(p);
  };

  // ── Local meal lists (supports in-preview delete) ──────────────────────────
  const [localAiMeals, setLocalAiMeals] = useState<AiMeal[]>(() => aiMeals ?? []);
  const [localManualFoods, setLocalManualFoods] = useState<PrintFood[]>(() =>
    manualFoods.map(f => ({ ...f, richHtml: f.name }))
  );
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  const hasNotice = noticeMethod || noticeWater || noticeTips;

  return (
    <div style={{ background: "#ffffff", fontFamily: "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", color: "#12100d" }}>

      {/* ── Rich-text floating toolbar (editable only, one shared instance) ── */}
      {editable && showToolbar && <RichToolbar />}

      {/* ── Logo + date row ── */}
      <div style={{ padding: "20px 40px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ minHeight: "60px", display: "flex", alignItems: "center" }}>
          {logoUrl
            ? <img src={logoUrl} alt="Logo" style={{ width: `${imageSize}px`, height: "auto", objectFit: "contain" }} />
            : (editable
                ? <span className="no-print" style={{ fontSize: "11px", color: "rgba(18,16,13,0.3)", fontStyle: "italic" }}>[Upload logo để hiển thị ở đây]</span>
                : null)
          }
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "9px", color: "rgba(18,16,13,0.4)", textTransform: "uppercase", letterSpacing: "0.09em" }}>Ngày tạo</div>
          <div contentEditable={editable} suppressContentEditableWarning style={{ fontSize: "13px", fontWeight: 600, outline: "none" }}>{date}</div>
        </div>
      </div>

      {/* ── Red header ── */}
      <div style={{ background: "#eb0915", padding: "20px 40px 18px", marginTop: "16px" }}>
        <div contentEditable={editable} suppressContentEditableWarning style={{ fontSize: "28px", fontWeight: 900, color: "#ffffff", letterSpacing: "-0.03em", lineHeight: 1, outline: "none" }}>
          DIET PLAN
        </div>
        <div contentEditable={editable} suppressContentEditableWarning style={{ fontSize: "12px", color: "rgba(255,255,255,0.65)", marginTop: "5px", letterSpacing: "0.04em", outline: "none" }}>
          Máy Tính Dinh Dưỡng Chuyên Sâu
        </div>
      </div>

      {/* ── Client info ── */}
      {(() => {
        const LABEL_COLOR = "rgba(18,16,13,0.38)";
        const baseItems = [
          { label: "Khách hàng", value: result.name, large: true },
          { label: "Mục tiêu", value: GOAL_LABEL_PDF[result.weightGoal] ?? result.weightGoal },
          { label: "Thông số", value: `${result.gender === "male" ? "Nam" : "Nữ"} · ${result.age}t · ${result.height}cm · ${result.weight}kg` },
        ];

        return (
          <div style={{ padding: "18px 40px", display: "flex", alignItems: "flex-start", gap: "16px", borderBottom: "1px solid rgba(18,16,13,0.08)" }}>

            {/* ── Left: client profile — flex:1 so name can wrap and yield space ── */}
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexWrap: "wrap", gap: "8px 24px", alignItems: "flex-start" }}>
              {baseItems.map(item => (
                <div key={item.label} style={{ flexShrink: item.large ? 1 : 0, minWidth: 0 }}>
                  <div style={{ fontSize: "9px", color: LABEL_COLOR, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: "3px" }}>
                    {item.label}
                  </div>
                  <div contentEditable={editable} suppressContentEditableWarning
                    style={{ fontSize: item.large ? "18px" : "13px", fontWeight: item.large ? 800 : 600, outline: "none", whiteSpace: item.large ? "normal" : "nowrap", wordBreak: "break-word" }}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>

            {/* ── Right: calorie chips — flexShrink:0 so chips are never compressed ── */}
            <div style={{ flexShrink: 0, display: "flex", flexDirection: "row", alignItems: "flex-start", gap: "24px" }}>
              {phaseVals ? (
                /* ── 3 cột clickable LOW | MID | HIGH ── */
                (([
                  { label: "Calo (Low)",  phase: "low"    as PhaseKey },
                  { label: "Calo (Mid)",  phase: "medium" as PhaseKey },
                  { label: "Calo (High)", phase: "high"   as PhaseKey },
                ]).map(col => {
                  const isA = col.phase === activePhase;
                  return (
                    <div key={col.label} onClick={() => pickPhase(col.phase)}
                      style={{ textAlign: "center", cursor: editable ? "pointer" : "default", padding: "6px 10px", borderRadius: "8px", border: isA ? "1.5px solid #eb0915" : "1.5px solid transparent", background: isA ? "rgba(235,9,21,0.05)" : "transparent", transition: "all 0.18s" }}>
                      <div style={{ fontSize: "9px", color: isA ? "#eb0915" : LABEL_COLOR, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "3px", fontWeight: isA ? 700 : 400 }}>
                        {col.label}
                      </div>
                      <div style={{ fontSize: "14px", fontWeight: 800, color: isA ? "#eb0915" : "#12100d", lineHeight: 1 }}>
                        {phaseVals[col.phase].kcal > 0 ? phaseVals[col.phase].kcal.toLocaleString("vi-VN") : "—"}
                      </div>
                      <div style={{ fontSize: "9px", color: isA ? "#eb0915" : LABEL_COLOR, marginTop: "2px" }}>kcal</div>
                    </div>
                  );
                }))
              ) : (
                /* ── DER đơn (không có cycling) ── */
                <div>
                  <div style={{ fontSize: "9px", color: LABEL_COLOR, textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: "3px" }}>
                    DER (Calo/ngày)
                  </div>
                  <div contentEditable={editable} suppressContentEditableWarning style={{ fontSize: "13px", fontWeight: 600, outline: "none" }}>
                    {result.der.toLocaleString("vi-VN")} kcal
                  </div>
                </div>
              )}
            </div>

          </div>
        );
      })()}

      {/* ── Roadmap / Progress Summary ── */}
      {result.weeklyLoss !== null && (
        <div style={{ padding: "0 40px 14px" }}>
          <div data-print-block="roadmap" style={{
            display: "flex", alignItems: "stretch",
            borderRadius: "8px", overflow: "hidden",
            border: "1px solid rgba(235,9,21,0.18)", background: "rgba(235,9,21,0.028)",
          }}>
            {/* Left: summary text */}
            <div style={{ flex: 1, padding: "12px 16px", borderRight: "1px solid rgba(235,9,21,0.15)" }}>
              <div style={{ fontSize: "9px", fontWeight: 700, color: "rgba(18,16,13,0.38)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: "5px" }}>
                {result.daysToGoal ? "Lộ trình giảm cân" : "Tiến độ dự kiến"}
              </div>
              <div contentEditable={editable} suppressContentEditableWarning style={{ fontSize: "12px", fontWeight: 600, color: "#12100d", lineHeight: 1.6, outline: "none" }}>
                {result.daysToGoal
                  ? `Cần ${result.daysToGoal} ngày · ${result.weeksToGoal} tuần · ${result.monthsToGoal} tháng để đạt mục tiêu.`
                  : `Với mức thâm hụt này, khách có thể giảm khoảng ${result.weeklyLoss.toFixed(2)} kg trong 1 tuần.`
                }
              </div>
            </div>

            {/* Right: 3 stat columns */}
            <div style={{ display: "flex", flexShrink: 0, alignItems: "stretch" }}>
              {result.totalToLose !== null && (
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "12px 18px", borderRight: "1px solid rgba(235,9,21,0.12)", minWidth: "88px" }}>
                  <div style={{ fontSize: "9px", color: "rgba(18,16,13,0.38)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "3px" }}>Cần giảm</div>
                  <div style={{ fontSize: "22px", fontWeight: 900, color: "#eb0915", lineHeight: 1.1 }}>{result.totalToLose.toFixed(1)}</div>
                  <div style={{ fontSize: "10px", fontWeight: 700, color: "#eb0915" }}>kg</div>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "12px 18px", borderRight: result.tdee > result.der ? "1px solid rgba(235,9,21,0.12)" : undefined, minWidth: "88px" }}>
                <div style={{ fontSize: "9px", color: "rgba(18,16,13,0.38)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "3px" }}>Giảm / tuần</div>
                <div style={{ fontSize: "22px", fontWeight: 900, color: "#eb0915", lineHeight: 1.1 }}>{result.weeklyLoss.toFixed(2)}</div>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "#eb0915" }}>kg</div>
              </div>
              {(() => {
                // Dynamic: use the currently selected phase's kcal target
                const activeKcal = phaseVals ? phaseVals[activePhase].kcal : (printCyclingDay?.kcal ?? result.der);
                const deficit    = Math.round(result.tdee - activeKcal);
                if (deficit <= 0) return null;
                return (
                  <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", padding: "12px 18px", minWidth: "100px" }}>
                    <div style={{ fontSize: "9px", color: "rgba(18,16,13,0.38)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "3px" }}>Thâm hụt / ngày</div>
                    <div style={{ fontSize: "22px", fontWeight: 900, color: "#eb0915", lineHeight: 1.1 }}>{deficit.toLocaleString("vi-VN")}</div>
                    <div style={{ fontSize: "10px", fontWeight: 700, color: "#eb0915" }}>kcal</div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Nutrition targets table ── */}
      {phaseVals ? (
        /* ── Cycling: 4-column locked table, clickable phase headers ── */
        <div style={{ padding: "14px 40px 16px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "rgba(18,16,13,0.38)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: "8px" }}>
            Tổng dinh dưỡng
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <colgroup>
              <col style={{ width: "28%" }} />
              <col style={{ width: "24%" }} />
              <col style={{ width: "24%" }} />
              <col style={{ width: "24%" }} />
            </colgroup>
            <thead>
              <tr>
                <th style={th}>Chỉ số</th>
                {(["low", "medium", "high"] as PhaseKey[]).map(phase => {
                  const isA = phase === activePhase;
                  return (
                    <th key={phase} onClick={() => pickPhase(phase)}
                      style={{ ...th, textAlign: "center", background: isA ? "#eb0915" : "#3a3a3a", cursor: editable ? "pointer" : "default", userSelect: "none" }}>
                      {phase === "low" ? "Low" : phase === "medium" ? "Medium" : "High"}
                      {isA && <span style={{ display: "inline-block", width: "5px", height: "5px", borderRadius: "50%", background: "#fff", marginLeft: "5px", verticalAlign: "middle" }} />}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {([
                { key: "kcal"    , label: "Calo",    unit: " kcal" },
                { key: "protein" , label: "Protein", unit: "g"     },
                { key: "fat"     , label: "Fat",     unit: "g"     },
                { key: "carbs"   , label: "Carbs",   unit: "g"     },
              ] as { key: keyof typeof phaseVals.low; label: string; unit: string }[]).map(({ key, label, unit }, i) => (
                <tr key={key} style={{ background: i % 2 === 0 ? "#fff" : "rgba(18,16,13,0.018)" }}>
                  <td style={td}>{label}</td>
                  {(["low", "medium", "high"] as PhaseKey[]).map(phase => {
                    const isA = phase === activePhase;
                    return (
                      <td key={phase} onClick={() => pickPhase(phase)}
                        style={{ ...tdRight, fontWeight: 700, fontSize: "14px", background: isA ? "rgba(235,9,21,0.06)" : undefined, cursor: editable ? "pointer" : "default" }}>
                        {phaseVals[phase][key].toLocaleString("vi-VN")}{unit}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── Non-cycling: simple 2-column table ── */
        (() => {
          const actualCal   = Math.round((aiGrand?.cal ?? 0) + manualTotal.cal);
          const actualPro   = Math.round((aiGrand?.p   ?? 0) + manualTotal.p);
          const actualFat   = Math.round((aiGrand?.f   ?? 0) + manualTotal.f);
          const actualCarbs = Math.round((aiGrand?.c   ?? 0) + manualTotal.c);
          const hasActual   = actualCal > 0;
          const displayKcal  = hasActual ? actualCal   : result.der;
          const displayPro   = hasActual ? actualPro   : result.protein;
          const displayFat   = hasActual ? actualFat   : result.fat;
          const displayCarbs = hasActual ? actualCarbs : result.carbs;
          const sectionTitle = hasActual ? "Tổng dinh dưỡng thực tế trong ngày" : "Mục tiêu dinh dưỡng hàng ngày";
          const colHeader    = hasActual ? "Thực tế / ngày" : "Mục tiêu / ngày";
          const calLabel     = hasActual ? "Tổng Calo" : "DER (Calo mục tiêu)";
          return (
            <div style={{ padding: "14px 40px 16px" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "rgba(18,16,13,0.38)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: "8px" }}>
                {sectionTitle}
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Chỉ số</th>
                    <th style={{ ...th, textAlign: "right" }}>{colHeader}</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: calLabel,    value: `${displayKcal.toLocaleString("vi-VN")} kcal` },
                    { label: "Protein",   value: `${displayPro}g`   },
                    { label: "Fat",       value: `${displayFat}g`   },
                    { label: "Carbs",     value: `${displayCarbs}g` },
                  ].map((row, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "rgba(18,16,13,0.018)" }}>
                      <td style={td} contentEditable={editable} suppressContentEditableWarning>{row.label}</td>
                      <td style={{ ...tdRight, fontWeight: 700, fontSize: "14px" }} contentEditable={editable} suppressContentEditableWarning>{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()
      )}

      {/* ── AI Meal table ── */}
      {localAiMeals.length > 0 && (
        <div style={{ padding: "0 40px 16px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "rgba(18,16,13,0.38)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: "8px" }}>Kế hoạch thực đơn</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...th, whiteSpace: "nowrap" }}>Bữa ăn</th>
                <th style={thDark}>Thực đơn chi tiết</th>
                <th style={{ ...thDark, textAlign: "center" }}>Calo</th>
                <th style={{ ...thDark, textAlign: "center" }}>P(g)</th>
                <th style={{ ...thDark, textAlign: "center" }}>F(g)</th>
                <th style={{ ...thDark, textAlign: "center" }}>C(g)</th>
              </tr>
            </thead>
            <tbody>
              {localAiMeals.map((meal, i) => {
                const rowId = `ai-${i}`;
                const isHov = hoveredRow === rowId;
                return (
                  <tr key={i}
                    style={{ background: i % 2 === 0 ? "#fff" : "rgba(18,16,13,0.018)", position: "relative" }}
                    onMouseEnter={() => setHoveredRow(rowId)} onMouseLeave={() => setHoveredRow(null)}>
                    <td style={{ ...tdBold, color: "#eb0915", whiteSpace: "nowrap", position: "relative" }}>
                      <div data-rt contentEditable={editable} suppressContentEditableWarning style={{ outline: "none", display: "inline" }}>{meal.mealName}</div>
                      {editable && isHov && (
                        <button className="no-print" onMouseDown={e => { e.preventDefault(); setLocalAiMeals(prev => prev.filter((_, j) => j !== i)); }}
                          style={{ position: "absolute", top: "50%", right: "4px", transform: "translateY(-50%)", background: "#eb0915", border: "none", color: "#fff", borderRadius: "50%", width: "18px", height: "18px", cursor: "pointer", fontSize: "11px", fontWeight: 700, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          ×
                        </button>
                      )}
                    </td>
                    <td style={td}><div data-rt contentEditable={editable} suppressContentEditableWarning style={{ outline: "none" }}>{meal.name}</div></td>
                    <td style={{ ...tdCenter, fontWeight: 600 }}>{Math.round(meal.calories)}</td>
                    <td style={tdCenter}>{Math.round(meal.protein)}</td>
                    <td style={tdCenter}>{Math.round(meal.fat)}</td>
                    <td style={tdCenter}>{Math.round(meal.carbs)}</td>
                  </tr>
                );
              })}
              {/* Tổng ngày: phase target when cycling, computed sum otherwise */}
              <tr style={{ background: "rgba(235,9,21,0.05)" }}>
                <td style={{ ...tdBold, color: "#eb0915" }} colSpan={2}>
                  {phaseVals ? `Mục tiêu ${activePhase === "low" ? "Low" : activePhase === "medium" ? "Medium" : "High"}` : "Tổng cả ngày"}
                </td>
                <td style={{ ...tdCenter, fontWeight: 700, color: "#eb0915" }}>
                  {phaseVals ? phaseVals[activePhase].kcal.toLocaleString("vi-VN") : Math.round(localAiMeals.reduce((s, m) => s + m.calories, 0))}
                </td>
                <td style={{ ...tdCenter, fontWeight: 700, color: "#eb0915" }}>
                  {phaseVals ? phaseVals[activePhase].protein : Math.round(localAiMeals.reduce((s, m) => s + m.protein, 0))}
                </td>
                <td style={{ ...tdCenter, fontWeight: 700, color: "#eb0915" }}>
                  {phaseVals ? phaseVals[activePhase].fat : Math.round(localAiMeals.reduce((s, m) => s + m.fat, 0))}
                </td>
                <td style={{ ...tdCenter, fontWeight: 700, color: "#eb0915" }}>
                  {phaseVals ? phaseVals[activePhase].carbs : Math.round(localAiMeals.reduce((s, m) => s + m.carbs, 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── Manual foods table ── */}
      {localManualFoods.length > 0 && (
        <div style={{ padding: "0 40px 16px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "rgba(18,16,13,0.38)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: "8px" }}>Thực đơn tự nhập</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Món ăn</th>
                <th style={{ ...th, textAlign: "center" }}>Calo</th>
                <th style={{ ...th, textAlign: "center" }}>P(g)</th>
                <th style={{ ...th, textAlign: "center" }}>F(g)</th>
                <th style={{ ...th, textAlign: "center" }}>C(g)</th>
              </tr>
            </thead>
            <tbody>
              {localManualFoods.map((food, i) => {
                const rowId = `mf-${food.id}`;
                const isHov = hoveredRow === rowId;
                return (
                  <tr key={food.id}
                    style={{ background: i % 2 === 0 ? "#fff" : "rgba(18,16,13,0.018)" }}
                    onMouseEnter={() => setHoveredRow(rowId)} onMouseLeave={() => setHoveredRow(null)}>

                    {/* ── Name cell: FoodNameCell (rich-text + DB search) ── */}
                    <td style={{ ...td, position: "relative" }}>
                      <FoodNameCell
                        richHtml={food.richHtml}
                        isHovered={isHov}
                        readOnly={readOnly}
                        onFoodPicked={(pickedFood, newHtml) => {
                          // Compute macros for 100g default (same as computeRowMacros)
                          const macros = computeRowMacros(pickedFood, 100);
                          setLocalManualFoods(prev => prev.map(f =>
                            f.id === food.id
                              ? { ...f, name: pickedFood.name, richHtml: newHtml, ...macros }
                              : f
                          ));
                        }}
                      />
                      {/* Delete button – no-print */}
                      {editable && isHov && (
                        <button className="no-print"
                          onMouseDown={e => { e.preventDefault(); setLocalManualFoods(prev => prev.filter(f => f.id !== food.id)); }}
                          style={{ position: "absolute", top: "50%", right: "4px", transform: "translateY(-50%)", background: "#eb0915", border: "none", color: "#fff", borderRadius: "50%", width: "18px", height: "18px", cursor: "pointer", fontSize: "11px", fontWeight: 700, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          ×
                        </button>
                      )}
                    </td>

                    {/* ── Macro cells: locked (auto-updated from state) ── */}
                    <td style={{ ...tdCenter, fontWeight: 600 }}>{Math.round(food.calories)}</td>
                    <td style={tdCenter}>{Math.round(food.protein)}</td>
                    <td style={tdCenter}>{Math.round(food.fat)}</td>
                    <td style={tdCenter}>{Math.round(food.carbs)}</td>
                  </tr>
                );
              })}
              {/* Tổng ngày: phase target when cycling, computed sum otherwise */}
              <tr style={{ background: "rgba(235,9,21,0.04)" }}>
                <td style={{ ...tdBold, color: "#eb0915" }}>
                  {phaseVals ? `Mục tiêu ${activePhase === "low" ? "Low" : activePhase === "medium" ? "Medium" : "High"}` : "Tổng ngày"}
                </td>
                <td style={{ ...tdCenter, fontWeight: 700, color: "#eb0915" }}>
                  {phaseVals ? phaseVals[activePhase].kcal.toLocaleString("vi-VN") : Math.round(localManualFoods.reduce((s, f) => s + f.calories, 0))}
                </td>
                <td style={{ ...tdCenter, fontWeight: 700, color: "#eb0915" }}>
                  {phaseVals ? phaseVals[activePhase].protein : Math.round(localManualFoods.reduce((s, f) => s + f.protein, 0))}
                </td>
                <td style={{ ...tdCenter, fontWeight: 700, color: "#eb0915" }}>
                  {phaseVals ? phaseVals[activePhase].fat : Math.round(localManualFoods.reduce((s, f) => s + f.fat, 0))}
                </td>
                <td style={{ ...tdCenter, fontWeight: 700, color: "#eb0915" }}>
                  {phaseVals ? phaseVals[activePhase].carbs : Math.round(localManualFoods.reduce((s, f) => s + f.carbs, 0))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── Notice section ── */}
      {hasNotice && (
        <div style={{ padding: "14px 40px 18px", borderTop: "1px solid rgba(18,16,13,0.08)" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "rgba(18,16,13,0.38)", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: "12px" }}>Hướng dẫn & Lưu ý</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {noticeMethod && (
              <div style={{ background: "rgba(235,9,21,0.04)", borderLeft: "3px solid #eb0915", padding: "10px 14px", borderRadius: "0 6px 6px 0" }}>
                <div style={{ fontSize: "9px", color: "rgba(18,16,13,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>Phương pháp & Mục tiêu</div>
                <div contentEditable={editable} suppressContentEditableWarning style={{ fontSize: "12px", color: "#12100d", lineHeight: 1.6, outline: "none" }}>{noticeMethod}</div>
              </div>
            )}
            {noticeWater && (
              <div style={{ background: "rgba(59,130,246,0.05)", borderLeft: "3px solid #3b82f6", padding: "10px 14px", borderRadius: "0 6px 6px 0" }}>
                <div style={{ fontSize: "9px", color: "rgba(18,16,13,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>Lượng nước uống</div>
                <div contentEditable={editable} suppressContentEditableWarning style={{ fontSize: "12px", color: "#12100d", lineHeight: 1.6, outline: "none" }}>{noticeWater}</div>
              </div>
            )}
            {noticeTips && (
              <div style={{ background: "rgba(16,185,129,0.05)", borderLeft: "3px solid #10b981", padding: "10px 14px", borderRadius: "0 6px 6px 0" }}>
                <div style={{ fontSize: "9px", color: "rgba(18,16,13,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>Hướng dẫn chế biến & Lưu ý</div>
                <div contentEditable={editable} suppressContentEditableWarning style={{ fontSize: "12px", color: "#12100d", lineHeight: 1.6, whiteSpace: "pre-wrap", outline: "none" }}>{noticeTips}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{ padding: "14px 40px", borderTop: "1px solid rgba(18,16,13,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span contentEditable={editable} suppressContentEditableWarning style={{ fontSize: "10px", color: "rgba(18,16,13,0.3)", fontStyle: "italic", outline: "none" }}>
          Được tạo bởi Diet Plan · Máy Tính Dinh Dưỡng Chuyên Sâu
        </span>
        <span style={{ fontSize: "12px", fontWeight: 900, color: "#eb0915", letterSpacing: "-0.01em" }}>DIET PLAN</span>
      </div>
    </div>
  );
}
