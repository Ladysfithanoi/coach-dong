"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import type { NutritionResult, CyclingSchedule } from "./DietForm";
import { FOODS, type FoodItem } from "@/lib/foods-data";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AiMeal {
  mealName: string;
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

interface ManualFood {
  id: string;
  name: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  sourceRows?: Array<{ food: FoodItem; grams: number }>;
}

type Tab = "ai" | "manual";
type MealCount = 2 | 3 | 4 | 5;
type PhaseKey = "low" | "medium" | "high";
/** ManualFood extended with per-cell rich-HTML snapshot (print-preview only) */
type PrintFood = ManualFood & { richHtml: string };

interface IngredientRow {
  id: string;
  query: string;
  food: FoodItem | null;
  grams: number;
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function stripMarkdown(text: string): string {
  return text.replace(/```(?:json)?\s*/gi, "").replace(/```\s*/g, "").trim();
}

function parseAiResponse(raw: string): AiMeal[] {
  const cleaned = stripMarkdown(raw);
  const parsed: unknown = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error("AI trả về dữ liệu không đúng định dạng mảng");
  return (parsed as Record<string, unknown>[]).map((item, i) => ({
    mealName: String(item.mealName ?? `Bữa ${i + 1}`),
    name: String(item.name ?? ""),
    calories: Math.round(Number(item.calories ?? 0)),
    protein: Math.round(Number(item.protein ?? 0)),
    fat: Math.round(Number(item.fat ?? 0)),
    carbs: Math.round(Number(item.carbs ?? 0)),
  }));
}

// ─── Food search helpers ──────────────────────────────────────────────────────

function newRow(): IngredientRow {
  return { id: `${Date.now()}-${Math.random()}`, query: "", food: null, grams: 100 };
}

function computeRowMacros(food: FoodItem, grams: number) {
  const r = grams / 100;
  return {
    calories: Math.round(food.calories * r),
    protein: Math.round(food.protein * r),
    fat: Math.round(food.fat * r),
    carbs: Math.round(food.carbs * r),
  };
}

function searchFoods(query: string): FoodItem[] {
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

// ─── Auto-fill helpers ────────────────────────────────────────────────────────

const suggestTemplates = [
  {
    method: "Thực đơn thâm hụt calo kiểm soát, ưu tiên tối ưu hóa tỷ lệ cơ nạc và đốt cháy mỡ thừa bền vững.",
    notes: "👉 Ưu tiên các phương pháp chế biến nguyên bản: Luộc, hấp, áp chảo bằng dầu xịt ăn kiêng (Olive/Canola). Hạn chế tối đa các loại sốt ướp sẵn nhiều đường và muối.\n👉 Nên chuẩn bị trước (Prep đồ ăn) vào tối hôm trước hoặc sáng sớm để tránh việc đi làm bận rộn rồi ăn sai lịch.\n👉 Ăn chậm, nhai kỹ để cơ thể kịp phát tín hiệu no, giúp kiểm soát cơn thèm ăn tốt hơn trong giai đoạn thâm hụt.",
  },
  {
    method: "Tái cấu trúc thói quen dinh dưỡng cá nhân, kích hoạt chế độ nỗ lực tối thiểu để đạt kết quả tối đa.",
    notes: "👉 Tuyệt đối không bỏ bữa, đặc biệt là các bữa có hàm lượng Protein cao để bảo vệ khối lượng cơ nạc.\n👉 Cố gắng đi ngủ trước 23h. Thức khuya làm tăng hormone Cortisol (gây stress) và kích thích cảm giác thèm ăn vặt vào ban đêm.\n👉 Nếu cảm thấy quá đói giữa các hiệp ăn, hãy bổ sung thêm các loại rau xanh lá hoặc dưa chuột.",
  },
  {
    method: "Lộ trình thiết kế may đo dựa trên lối sống thực tế, thích nghi không áp lực để chuyển giao tư duy làm chủ vóc dáng.",
    notes: "👉 Thực đơn là cái khung, không phải cái lồng. Nếu lỡ ăn lệch một bữa do tiếp khách, hãy quay lại kỷ luật ngay vào bữa kế tiếp.\n👉 Lắng nghe cơ thể: Ghi chép lại cảm giác năng lượng sau mỗi ngày áp dụng để HLV điều chỉnh thực đơn kịp thời.\n👉 Đo lường kết quả dựa trên cả sự thay đổi của trang phục và năng lượng tập luyện, không nên quá ám ảnh bởi con số trên cân mỗi ngày.",
  },
];

const GOAL_DESC: Record<string, string> = {
  lose: "Thực đơn thâm hụt calo — Mục tiêu Giảm cân (thâm hụt 1% trọng lượng/tuần)",
  fat_loss: "Thực đơn thâm hụt calo — Mục tiêu Giảm mỡ nâng cao (thâm hụt 0.5% trọng lượng/tuần)",
  gain: "Thực đơn tăng năng lượng — Mục tiêu Tăng cân (+500 kcal/ngày)",
  maintain: "Thực đơn duy trì năng lượng — Mục tiêu Giữ vóc dáng",
};

const GOAL_LABEL_PDF: Record<string, string> = {
  lose: "Giảm cân", fat_loss: "Giảm mỡ", gain: "Tăng cân", maintain: "Duy trì",
};

// ─── TrackingBar ──────────────────────────────────────────────────────────────

function TrackingBar({ label, current, target, color }: { label: string; current: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const over = current > target;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
        <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "rgba(18,16,13,0.5)" }}>{label}</span>
        <span style={{ fontSize: "0.75rem", color: over ? "#eb0915" : "rgba(18,16,13,0.38)" }}>
          {over ? `+${Math.round(current - target)} vượt` : `còn ${Math.round(target - current)}`}
        </span>
      </div>
      <div style={{ height: "6px", borderRadius: "99px", background: "rgba(18,16,13,0.08)" }}>
        <div style={{ height: "100%", borderRadius: "99px", width: `${pct}%`, background: over ? "#eb0915" : color, transition: "width 0.35s ease" }} />
      </div>
    </div>
  );
}

// ─── AiMealCard ───────────────────────────────────────────────────────────────

function AiMealCard({ meal }: { meal: AiMeal }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(18,16,13,0.1)" }}>
      <div className="px-4 py-2 flex items-center justify-between" style={{ background: "rgba(235,9,21,0.05)" }}>
        <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#eb0915" }}>{meal.mealName}</span>
        <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#12100d" }}>{meal.calories} kcal</span>
      </div>
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <p style={{ fontSize: "0.875rem", color: "#12100d", lineHeight: 1.55, flex: 1 }}>{meal.name}</p>
        <p className="flex-shrink-0 text-right" style={{ fontSize: "0.75rem", color: "rgba(18,16,13,0.45)", lineHeight: 1.8 }}>
          P: {Math.round(meal.protein)}g<br />F: {Math.round(meal.fat)}g<br />C: {Math.round(meal.carbs)}g
        </p>
      </div>
    </div>
  );
}

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
// • Clicking 🔍 opens a DB search dropdown; picking a food:
//   - preserves any bold/italic/color wrapping the coach applied (text-replace in innerHTML)
//   - calls onFoodPicked so the parent can update macros
// • All interactive chrome is hidden on @media print

interface FoodNameCellProps {
  richHtml: string;
  isHovered: boolean;
  onFoodPicked: (food: FoodItem, newHtml: string) => void;
}

function FoodNameCell({ richHtml, isHovered, onFoodPicked }: FoodNameCellProps) {
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
        contentEditable
        suppressContentEditableWarning
        style={{ outline: "none", minHeight: "1em", paddingRight: isHovered ? "46px" : undefined }}
      />

      {/* Search icon – no-print, shown on row hover */}
      {isHovered && (
        <button
          className="no-print"
          onClick={openSearch}
          title="Tìm trong database thực phẩm"
          style={{ position: "absolute", top: "50%", right: "26px", transform: "translateY(-50%)", background: "rgba(26,109,212,0.12)", border: "none", color: "#1a6dd4", borderRadius: "50%", width: "18px", height: "18px", cursor: "pointer", fontSize: "11px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          🔍
        </button>
      )}

      {/* Search dropdown – no-print, absolutely positioned below the cell */}
      {searchOpen && (
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

function PrintPreview({
  result, aiMeals, manualFoods, date, logoUrl, imageSize, noticeMethod, noticeWater, noticeTips, printCyclingDay, cyclingSchedule,
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
}) {
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

  // ── Interactive active-phase selection ─────────────────────────────────────
  const [activePhase, setActivePhase] = useState<PhaseKey>(printCyclingDay?.phase ?? "medium");

  // ── Local meal lists (supports in-preview delete) ──────────────────────────
  const [localAiMeals, setLocalAiMeals] = useState<AiMeal[]>(() => aiMeals ?? []);
  const [localManualFoods, setLocalManualFoods] = useState<PrintFood[]>(() =>
    manualFoods.map(f => ({ ...f, richHtml: f.name }))
  );
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  const hasNotice = noticeMethod || noticeWater || noticeTips;

  return (
    <div style={{ background: "#ffffff", fontFamily: "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", color: "#12100d" }}>

      {/* ── Rich-text floating toolbar (no-print, activates on text selection inside data-rt) ── */}
      <RichToolbar />

      {/* ── Logo + date row ── */}
      <div style={{ padding: "20px 40px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ minHeight: "60px", display: "flex", alignItems: "center" }}>
          {logoUrl
            ? <img src={logoUrl} alt="Logo" style={{ width: `${imageSize}px`, height: "auto", objectFit: "contain" }} />
            : <span className="no-print" style={{ fontSize: "11px", color: "rgba(18,16,13,0.3)", fontStyle: "italic" }}>[Upload logo để hiển thị ở đây]</span>
          }
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "9px", color: "rgba(18,16,13,0.4)", textTransform: "uppercase", letterSpacing: "0.09em" }}>Ngày tạo</div>
          <div contentEditable suppressContentEditableWarning style={{ fontSize: "13px", fontWeight: 600, outline: "none" }}>{date}</div>
        </div>
      </div>

      {/* ── Red header ── */}
      <div style={{ background: "#eb0915", padding: "20px 40px 18px", marginTop: "16px" }}>
        <div contentEditable suppressContentEditableWarning style={{ fontSize: "28px", fontWeight: 900, color: "#ffffff", letterSpacing: "-0.03em", lineHeight: 1, outline: "none" }}>
          DIET PLAN
        </div>
        <div contentEditable suppressContentEditableWarning style={{ fontSize: "12px", color: "rgba(255,255,255,0.65)", marginTop: "5px", letterSpacing: "0.04em", outline: "none" }}>
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
                  <div contentEditable suppressContentEditableWarning
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
                    <div key={col.label} onClick={() => setActivePhase(col.phase)}
                      style={{ textAlign: "center", cursor: "pointer", padding: "6px 10px", borderRadius: "8px", border: isA ? "1.5px solid #eb0915" : "1.5px solid transparent", background: isA ? "rgba(235,9,21,0.05)" : "transparent", transition: "all 0.18s" }}>
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
                  <div contentEditable suppressContentEditableWarning style={{ fontSize: "13px", fontWeight: 600, outline: "none" }}>
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
              <div contentEditable suppressContentEditableWarning style={{ fontSize: "12px", fontWeight: 600, color: "#12100d", lineHeight: 1.6, outline: "none" }}>
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
                    <th key={phase} onClick={() => setActivePhase(phase)}
                      style={{ ...th, textAlign: "center", background: isA ? "#eb0915" : "#3a3a3a", cursor: "pointer", userSelect: "none" }}>
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
                      <td key={phase} onClick={() => setActivePhase(phase)}
                        style={{ ...tdRight, fontWeight: 700, fontSize: "14px", background: isA ? "rgba(235,9,21,0.06)" : undefined, cursor: "pointer" }}>
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
                      <td style={td} contentEditable suppressContentEditableWarning>{row.label}</td>
                      <td style={{ ...tdRight, fontWeight: 700, fontSize: "14px" }} contentEditable suppressContentEditableWarning>{row.value}</td>
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
                      <div data-rt contentEditable suppressContentEditableWarning style={{ outline: "none", display: "inline" }}>{meal.mealName}</div>
                      {isHov && (
                        <button className="no-print" onMouseDown={e => { e.preventDefault(); setLocalAiMeals(prev => prev.filter((_, j) => j !== i)); }}
                          style={{ position: "absolute", top: "50%", right: "4px", transform: "translateY(-50%)", background: "#eb0915", border: "none", color: "#fff", borderRadius: "50%", width: "18px", height: "18px", cursor: "pointer", fontSize: "11px", fontWeight: 700, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          ×
                        </button>
                      )}
                    </td>
                    <td style={td}><div data-rt contentEditable suppressContentEditableWarning style={{ outline: "none" }}>{meal.name}</div></td>
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
                      {isHov && (
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
                <div contentEditable suppressContentEditableWarning style={{ fontSize: "12px", color: "#12100d", lineHeight: 1.6, outline: "none" }}>{noticeMethod}</div>
              </div>
            )}
            {noticeWater && (
              <div style={{ background: "rgba(59,130,246,0.05)", borderLeft: "3px solid #3b82f6", padding: "10px 14px", borderRadius: "0 6px 6px 0" }}>
                <div style={{ fontSize: "9px", color: "rgba(18,16,13,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>Lượng nước uống</div>
                <div contentEditable suppressContentEditableWarning style={{ fontSize: "12px", color: "#12100d", lineHeight: 1.6, outline: "none" }}>{noticeWater}</div>
              </div>
            )}
            {noticeTips && (
              <div style={{ background: "rgba(16,185,129,0.05)", borderLeft: "3px solid #10b981", padding: "10px 14px", borderRadius: "0 6px 6px 0" }}>
                <div style={{ fontSize: "9px", color: "rgba(18,16,13,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" }}>Hướng dẫn chế biến & Lưu ý</div>
                <div contentEditable suppressContentEditableWarning style={{ fontSize: "12px", color: "#12100d", lineHeight: 1.6, whiteSpace: "pre-wrap", outline: "none" }}>{noticeTips}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{ padding: "14px 40px", borderTop: "1px solid rgba(18,16,13,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span contentEditable suppressContentEditableWarning style={{ fontSize: "10px", color: "rgba(18,16,13,0.3)", fontStyle: "italic", outline: "none" }}>
          Được tạo bởi Diet Plan · Máy Tính Dinh Dưỡng Chuyên Sâu
        </span>
        <span style={{ fontSize: "12px", fontWeight: 900, color: "#eb0915", letterSpacing: "-0.01em" }}>DIET PLAN</span>
      </div>
    </div>
  );
}

// ─── IngredientSearchRow ──────────────────────────────────────────────────────

function IngredientSearchRow({
  row, isActive, canRemove, onQueryChange, onSelect, onGramsChange, onRemove, onFocus, onBlur,
}: {
  row: IngredientRow; isActive: boolean; canRemove: boolean;
  onQueryChange: (val: string) => void; onSelect: (food: FoodItem) => void;
  onGramsChange: (g: number) => void; onRemove: () => void; onFocus: () => void; onBlur: () => void;
}) {
  const [rawGrams, setRawGrams] = useState(String(row.grams));
  const results = isActive && row.query ? searchFoods(row.query) : [];
  const macros = row.food ? computeRowMacros(row.food, row.grams) : null;

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2 items-center">
        <div className="relative flex-1 min-w-0">
          <input type="text" placeholder="Tìm nguyên liệu... (VD: cá lóc, gạo lứt)" value={row.query}
            onChange={e => onQueryChange(e.target.value)} onFocus={onFocus} onBlur={onBlur}
            className="dp-input w-full" autoComplete="off" />
          {results.length > 0 && (
            <div className="absolute z-50 left-0 right-0 top-full mt-1 rounded-xl overflow-hidden shadow-xl"
              style={{ background: "#fff", border: "1px solid rgba(18,16,13,0.12)" }}>
              {results.map(food => (
                <button key={food.name} type="button" onMouseDown={() => onSelect(food)}
                  className="w-full text-left px-3 py-2.5 transition-colors"
                  style={{ borderBottom: "1px solid rgba(18,16,13,0.05)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(235,9,21,0.04)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "")}>
                  <span className="text-sm font-semibold" style={{ color: "#12100d" }}>{food.name}</span>
                  <span className="text-xs ml-2" style={{ color: "rgba(18,16,13,0.4)" }}>
                    {food.calories} kcal · P:{food.protein}g F:{food.fat}g C:{food.carbs}g /{food.tag === 'drink' ? '100ml' : '100g'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <input type="number" value={rawGrams} min={1}
            onChange={e => {
              setRawGrams(e.target.value);
              const n = parseInt(e.target.value);
              if (!isNaN(n) && n >= 1) onGramsChange(n);
            }}
            onBlur={() => {
              const n = parseInt(rawGrams);
              if (isNaN(n) || n < 1) { setRawGrams("100"); onGramsChange(100); }
            }}
            className="dp-input text-center" style={{ width: "68px" }} />
          <span className="text-xs font-semibold" style={{ color: "rgba(18,16,13,0.4)" }}>{row.food?.tag === 'drink' ? 'ml' : 'g'}</span>
        </div>
        {canRemove && (
          <button type="button" onClick={onRemove}
            className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-lg"
            style={{ background: "rgba(235,9,21,0.08)", color: "#eb0915" }} aria-label="Xoá nguyên liệu">
            ×
          </button>
        )}
      </div>
      {macros && (
        <div className="flex gap-3 pl-1 flex-wrap">
          {([
            { label: "Calo", value: `${macros.calories} kcal`, color: "#eb0915" },
            { label: "P", value: `${macros.protein}g`, color: "#1d4ed8" },
            { label: "F", value: `${macros.fat}g`, color: "#b45309" },
            { label: "C", value: `${macros.carbs}g`, color: "#065f46" },
          ] as const).map(item => (
            <span key={item.label} className="text-xs font-semibold" style={{ color: item.color }}>
              {item.label}: {item.value}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner({ light = false }: { light?: boolean }) {
  return (
    <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke={light ? "rgba(255,255,255,0.3)" : "rgba(18,16,13,0.15)"} strokeWidth="3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke={light ? "white" : "#12100d"} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

const DAY_SHORT_MS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

export default function MealPlanSection({
  result, liveProtein, liveFat, liveCarbs, liveDer, cyclingSchedule,
}: {
  result: NutritionResult; liveProtein: number; liveFat: number; liveCarbs: number; liveDer: number;
  cyclingSchedule: CyclingSchedule | null;
}) {
  const aiInFlight = useRef(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Default cycling day = today (0=Mon…6=Sun)
  const todayIdx = (() => { const d = new Date().getDay(); return d === 0 ? 6 : d - 1; })();
  const [cyclingDayIdx, setCyclingDayIdx] = useState(todayIdx);
  const [trackingDayIdx, setTrackingDayIdx] = useState(todayIdx);

  const [activeTab, setActiveTab] = useState<Tab>("ai");
  const [mealCount, setMealCount] = useState<MealCount>(3);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiCooldown, setAiCooldown] = useState(0);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiMeals, setAiMeals] = useState<AiMeal[] | null>(null);
  const [manualFoods, setManualFoods] = useState<ManualFood[]>([]);
  const [rows, setRows] = useState<IngredientRow[]>(() => [newRow()]);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Notice block state
  const [noticeMethod, setNoticeMethod] = useState(() => GOAL_DESC[result.weightGoal] ?? "");
  const [noticeWater, setNoticeWater] = useState(() => {
    const ml = Math.round(result.weight * 40);
    return `Khuyến nghị uống tối thiểu ${ml.toLocaleString("vi-VN")}ml nước mỗi ngày (40ml/kg trọng lượng cơ thể)`;
  });
  const [noticeTips, setNoticeTips] = useState("");

  // Preview / PDF state
  const [showPreview, setShowPreview] = useState(false);
  // printDayIdx removed — PDF uses whichever cycling day is active in the current tab
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState(150);

  const totals = manualFoods.reduce(
    (a, f) => ({ calories: a.calories + f.calories, protein: a.protein + f.protein, fat: a.fat + f.fat, carbs: a.carbs + f.carbs }),
    { calories: 0, protein: 0, fat: 0, carbs: 0 }
  );

  const trackingDay = cyclingSchedule?.enabled ? cyclingSchedule.days[trackingDayIdx] : null;
  const trackTarget = {
    calories: trackingDay?.kcal    ?? liveDer,
    protein:  trackingDay?.protein ?? liveProtein,
    fat:      trackingDay?.fat     ?? liveFat,
    carbs:    trackingDay?.carbs   ?? liveCarbs,
  };

  // ── AI meal generation ─────────────────────────────────────────────────────

  const handleGenerateAI = useCallback(async () => {
    if (aiInFlight.current) return;
    aiInFlight.current = true;
    setAiLoading(true);
    setAiError(null);
    setAiMeals(null);

    // Effective calorie/macro for the selected cycling day (or base DER if cycling disabled)
    // Protein & Fat are LOCKED; only Carbs adjusts as the lever (calcDayMacros logic in DietForm)
    const cyclingDay = cyclingSchedule?.enabled ? cyclingSchedule.days[cyclingDayIdx] : null;
    const effectiveDer     = cyclingDay ? cyclingDay.kcal    : liveDer;
    const effectiveProtein = cyclingDay ? cyclingDay.protein : liveProtein;
    const effectiveFat     = cyclingDay ? cyclingDay.fat     : liveFat;
    const effectiveCarbs   = cyclingDay ? cyclingDay.carbs   : liveCarbs;

    // Per-meal targets
    const calPerMeal  = Math.round(effectiveDer     / mealCount);
    const proPerMeal  = Math.round(effectiveProtein / mealCount);
    const fatPerMeal  = Math.round(effectiveFat     / mealCount);
    const carbPerMeal = Math.round(effectiveCarbs   / mealCount);
    const calMin      = calPerMeal - 50;
    const calMax      = calPerMeal + 50;
    const proMin      = Math.round(effectiveProtein * 0.95);
    const fatMin      = Math.round(effectiveFat     * 0.95);

    const cyclingSection = cyclingSchedule?.enabled && cyclingDay
      ? `
=== CALORIE CYCLING — CHẾ ĐỘ ĂN LINH HOẠT 7 NGÀY ===
⚠️ LỆNH BẮT BUỘC: Thực đơn hôm nay là cho ${cyclingDay.name} (${cyclingDay.phase === "high" ? "Ngày HIGH Calo" : cyclingDay.phase === "medium" ? "Ngày MEDIUM Calo" : "Ngày LOW Calo"}).
Hạn mức ngày này: ${effectiveDer.toLocaleString("vi-VN")} kcal
Macro CHÍNH XÁC cho ngày này (KHÔNG được tự ý điều chỉnh): P:${effectiveProtein}g | F:${effectiveFat}g | C:${effectiveCarbs}g

Nguyên tắc: Protein & Fat được KHÓA CỨNG cố định. Chỉ có Carbs thay đổi theo từng ngày.
Tuyệt đối KHÔNG chia đều macro theo tỷ lệ — phải dùng đúng bộ số trên.

Lịch Calorie Cycling cả tuần (bối cảnh đầy đủ):
${cyclingSchedule.days.map(d => `• ${d.name}: ${d.kcal.toLocaleString("vi-VN")} kcal (${d.phase === "high" ? "HIGH" : d.phase === "medium" ? "MED" : "LOW"}) — P:${d.protein}g F:${d.fat}g C:${d.carbs}g`).join("\n")}
Trung bình tuần: ${cyclingSchedule.weeklyAvg.toLocaleString("vi-VN")} kcal/ngày`
      : "";

    const prompt = `⚠️ LỆNH BẮT BUỘC: Hãy thiết kế thực đơn bám sát theo chỉ số DER là ${effectiveDer} kcal và các Macro Protein: ${effectiveProtein}g, Carbs: ${effectiveCarbs}g, Fat: ${effectiveFat}g do người dùng tự cấu hình. Tuyệt đối không dùng công thức tính mặc định để suy ra lại macro. Mọi tính toán phân bổ gram thực phẩm đều phải xuất phát từ các con số này.
${cyclingSection}
Thiết kế thực đơn ${mealCount} bữa cho khách hàng theo QUY TRÌNH 4 BƯỚC.

=== DỮ LIỆU ĐẦU VÀO (DO PT CẤU HÌNH — KHÔNG ĐƯỢC THAY ĐỔI) ===
Tổng Calo mục tiêu: ${effectiveDer} kcal
Protein mục tiêu: ${effectiveProtein}g | Fat mục tiêu: ${effectiveFat}g | Carbs mục tiêu: ${effectiveCarbs}g
Thực phẩm THÍCH: ${result.likes || "không có"}
Thực phẩm GÉT/DỊ ỨNG: ${result.dislikes || "không có"}

=== CHỈ TIÊU TỪNG BỮA (${mealCount} bữa — Bước 2 & 3) ===
Calo mỗi bữa: ~${calPerMeal} kcal (dao động cho phép: ${calMin}–${calMax} kcal)
Protein mỗi bữa: ~${proPerMeal}g | Fat: ~${fatPerMeal}g | Carbs: ~${carbPerMeal}g

=== NGƯỠNG TỰ KIỂM TRA — Bước 4 (Self-Check) ===
Tổng Protein cả ngày: ${proMin}g – ${effectiveProtein}g (95%–100%)
Tổng Fat cả ngày: ${fatMin}g – ${effectiveFat}g (95%–100%)
Tổng Calo cả ngày: ${effectiveDer - 50}–${effectiveDer + 50} kcal
→ Nếu BẤT KỲ chỉ số nào lệch ngoài ngưỡng trên, điều chỉnh lại gram thực phẩm trước khi xuất JSON.`;

    try {
      const res = await fetch("/api/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (res.status === 401) {
        const errData = await res.json() as { kicked?: boolean };
        window.location.replace(errData.kicked ? "/login?kicked=1" : "/login");
        return;
      }
      const data: { result?: string; error?: string } = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Lỗi từ Gemini API");
      if (!data.result) throw new Error("Gemini không trả về nội dung");
      setAiMeals(parseAiResponse(data.result));
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Đã xảy ra lỗi, vui lòng thử lại");
    } finally {
      setAiLoading(false);
      aiInFlight.current = false;
      setAiCooldown(5);
      const t = setInterval(() => {
        setAiCooldown(s => { if (s <= 1) { clearInterval(t); return 0; } return s - 1; });
      }, 1000);
    }
  }, [result, mealCount, liveDer, liveProtein, liveFat, liveCarbs, cyclingSchedule, cyclingDayIdx]);

  // ── Random suggest ────────────────────────────────────────────────────────

  function handleSuggestRandom() {
    const tpl = suggestTemplates[Math.floor(Math.random() * suggestTemplates.length)];
    setNoticeMethod(tpl.method);
    setNoticeTips(tpl.notes);
  }

  // ── Manual food ────────────────────────────────────────────────────────────

  function handleEditMeal(mealId: string) {
    const meal = manualFoods.find(f => f.id === mealId);
    if (!meal || !meal.sourceRows || meal.sourceRows.length === 0) return;
    const restoredRows: IngredientRow[] = meal.sourceRows.map(sr => ({
      id: `${Date.now()}-${Math.random()}`,
      query: sr.food.name,
      food: sr.food,
      grams: sr.grams,
    }));
    setRows(restoredRows);
    setEditingMealId(mealId);
    setActiveDropdown(null);
    // Scroll form into view
    document.getElementById("manual-form-area")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleConfirmMeal() {
    const filled = rows.filter((r): r is IngredientRow & { food: FoodItem } => r.food !== null);
    if (filled.length === 0) return;
    const total = filled.reduce(
      (acc, row) => {
        const m = computeRowMacros(row.food, row.grams);
        return { calories: acc.calories + m.calories, protein: acc.protein + m.protein, fat: acc.fat + m.fat, carbs: acc.carbs + m.carbs };
      },
      { calories: 0, protein: 0, fat: 0, carbs: 0 }
    );
    const ingredients = filled.map(r => `${r.food.name} (${r.grams}${r.food.tag === 'drink' ? 'ml' : 'g'})`).join(" + ");
    const sourceRows = filled.map(r => ({ food: r.food, grams: r.grams }));

    if (editingMealId) {
      // UPDATE mode — ghi đè món đang sửa, giữ nguyên tên số thứ tự
      setManualFoods(prev => prev.map(f => {
        if (f.id !== editingMealId) return f;
        const mealNum = f.name.match(/^Bữa (\d+)/)?.[1] ?? "";
        return {
          ...f,
          name: `Bữa ${mealNum}: ${ingredients}`,
          calories: Math.round(total.calories),
          protein: Math.round(total.protein),
          fat: Math.round(total.fat),
          carbs: Math.round(total.carbs),
          sourceRows,
        };
      }));
      setEditingMealId(null);
    } else {
      // ADD mode — thêm món mới
      setManualFoods(prev => {
        const mealOrder = prev.length + 1;
        return [...prev, {
          id: `${Date.now()}-${Math.random()}`,
          name: `Bữa ${mealOrder}: ${ingredients}`,
          calories: Math.round(total.calories),
          protein: Math.round(total.protein),
          fat: Math.round(total.fat),
          carbs: Math.round(total.carbs),
          sourceRows,
        }];
      });
    }
    setRows([newRow()]);
    setActiveDropdown(null);
  }

  function handleCancelEdit() {
    setEditingMealId(null);
    setRows([newRow()]);
    setActiveDropdown(null);
  }

  // ── Logo upload ────────────────────────────────────────────────────────────

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setLogoUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  const hasMealData = (aiMeals && aiMeals.length > 0) || manualFoods.length > 0;
  const today = new Date().toLocaleDateString("vi-VN");

  return (
    <div id="meal-plan-section" className="mt-6 space-y-4">

      {/* ── Tab container ── */}
      <div className="bg-white rounded-2xl shadow-sm" style={{ border: "1px solid rgba(18,16,13,0.1)" }}>
        {/* Tab bar */}
        <div className="flex" style={{ borderBottom: "1px solid rgba(18,16,13,0.08)" }}>
          {(["ai", "manual"] as Tab[]).map(tab => (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)}
              className="flex-1 py-3.5 text-sm font-semibold transition-all"
              style={{
                borderBottom: activeTab === tab ? "2px solid #eb0915" : "2px solid transparent",
                color: activeTab === tab ? "#eb0915" : "rgba(18,16,13,0.45)",
                background: "transparent",
              }}>
              {tab === "ai" ? "✨ AI Thực đơn" : "✏️ Tự nhập tay"}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* ════ AI Tab ════ */}
          {activeTab === "ai" && (
            <div className="space-y-5">
              <div>
                <p className="dp-label">Số bữa ăn trong ngày</p>
                <div className="grid grid-cols-4 gap-2 mt-1">
                  {([2, 3, 4, 5] as MealCount[]).map(n => (
                    <button key={n} type="button" onClick={() => setMealCount(n)}
                      className="py-2.5 rounded-xl text-sm font-bold transition-all"
                      style={{
                        border: mealCount === n ? "1px solid #eb0915" : "1px solid rgba(18,16,13,0.15)",
                        background: mealCount === n ? "#eb0915" : "#ffffff",
                        color: mealCount === n ? "#ffffff" : "#12100d",
                      }}>
                      {n} bữa
                    </button>
                  ))}
                </div>
              </div>

              {/* Cycling day picker — only when cycling is active */}
              {cyclingSchedule?.enabled && (
                <div>
                  <p className="dp-label">Ngày muốn tạo thực đơn</p>
                  <div className="grid grid-cols-7 gap-1 mt-1">
                    {cyclingSchedule.days.map((day, i) => {
                      const phaseColor = day.phase === "high" ? "#eb0915" : day.phase === "medium" ? "#d97706" : "#3b82f6";
                      const phaseBg   = day.phase === "high" ? "rgba(235,9,21,0.07)" : day.phase === "medium" ? "rgba(217,119,6,0.07)" : "rgba(59,130,246,0.07)";
                      return (
                        <button key={i} type="button" onClick={() => setCyclingDayIdx(i)}
                          className="rounded-xl py-2 flex flex-col items-center transition-all"
                          style={{
                            border: cyclingDayIdx === i ? `1.5px solid ${phaseColor}` : "1px solid rgba(18,16,13,0.12)",
                            background: cyclingDayIdx === i ? phaseBg : "#ffffff",
                            color: cyclingDayIdx === i ? phaseColor : "rgba(18,16,13,0.45)",
                          }}>
                          <span style={{ fontSize: "10px", fontWeight: cyclingDayIdx === i ? 700 : 400 }}>
                            {DAY_SHORT_MS[i]}
                          </span>
                          <span style={{ fontSize: "8px", marginTop: "1px", fontWeight: 400 }}>
                            {day.kcal >= 1000 ? `${(day.kcal / 1000).toFixed(1)}k` : day.kcal}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-xs" style={{ color: "rgba(18,16,13,0.38)" }}>
                    {cyclingSchedule.days[cyclingDayIdx].phase === "high" ? "▲ Ngày HIGH" : cyclingSchedule.days[cyclingDayIdx].phase === "medium" ? "◆ Ngày MED" : "▼ Ngày LOW"} — {cyclingSchedule.days[cyclingDayIdx].kcal.toLocaleString("vi-VN")} kcal
                  </p>
                </div>
              )}

              {(() => {
                const blocked = aiLoading || aiCooldown > 0;
                return (
                  <button type="button" onClick={handleGenerateAI} disabled={blocked}
                    className="w-full py-3.5 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                    style={{ background: blocked ? "rgba(235,9,21,0.55)" : "#eb0915", color: "#ffffff", cursor: blocked ? "not-allowed" : "pointer", pointerEvents: blocked ? "none" : "auto" }}>
                    {aiLoading ? <><Spinner light /> AI đang phân tích...</> : aiCooldown > 0 ? `Chờ ${aiCooldown}s...` : "✨ Gợi ý bằng AI"}
                  </button>
                );
              })()}

              {aiError && (
                <div className="rounded-xl px-4 py-3 text-sm flex items-start gap-2"
                  style={{ background: "rgba(235,9,21,0.06)", border: "1px solid rgba(235,9,21,0.2)", color: "#eb0915" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 flex-shrink-0">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {aiError}
                </div>
              )}

              {aiMeals && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(18,16,13,0.35)" }}>Thực đơn gợi ý</p>
                  {aiMeals.map((meal, i) => <AiMealCard key={i} meal={meal} />)}
                  {(() => {
                    const gt = aiMeals.reduce((a, m) => ({ cal: a.cal + m.calories, p: a.p + m.protein, f: a.f + m.fat, c: a.c + m.carbs }), { cal: 0, p: 0, f: 0, c: 0 });
                    return (
                      <div className="rounded-xl p-4" style={{ background: "rgba(18,16,13,0.03)", border: "1px solid rgba(18,16,13,0.08)" }}>
                        <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(18,16,13,0.35)" }}>Tổng cả ngày</p>
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
                          {[
                            { label: "Calo", value: gt.cal, unit: "kcal", color: "#eb0915" },
                            { label: "Protein", value: Math.round(gt.p), unit: "g", color: "#1d4ed8" },
                            { label: "Fat", value: Math.round(gt.f), unit: "g", color: "#b45309" },
                            { label: "Carbs", value: Math.round(gt.c), unit: "g", color: "#065f46" },
                          ].map(item => (
                            <div key={item.label} className="text-center rounded-lg py-2.5 px-1" style={{ background: "#ffffff", border: "1px solid rgba(18,16,13,0.07)" }}>
                              <p className="text-xs" style={{ color: "rgba(18,16,13,0.4)" }}>{item.label}</p>
                              <p className="text-lg md:text-xl font-bold mt-0.5" style={{ color: item.color }}>
                                {item.value}<span className="text-xs md:text-sm font-semibold ml-0.5">{item.unit}</span>
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* ════ Manual Tab ════ */}
          {activeTab === "manual" && (
            <div className="space-y-5">
              <div className="rounded-xl p-4 space-y-3.5" style={{ background: "rgba(18,16,13,0.02)", border: "1px solid rgba(18,16,13,0.08)" }}>

                {/* Day picker — chỉ hiện khi Calorie Cycling đang bật */}
                {cyclingSchedule?.enabled && (
                  <div className="pb-3.5" style={{ borderBottom: "1px solid rgba(18,16,13,0.07)" }}>
                    <p className="dp-label mb-1.5">Ngày đang theo dõi</p>
                    <div className="grid grid-cols-7 gap-1">
                      {cyclingSchedule.days.map((day, i) => {
                        const phaseColor = day.phase === "high" ? "#eb0915" : day.phase === "medium" ? "#d97706" : "#3b82f6";
                        const phaseBg   = day.phase === "high" ? "rgba(235,9,21,0.07)" : day.phase === "medium" ? "rgba(217,119,6,0.07)" : "rgba(59,130,246,0.07)";
                        return (
                          <button key={i} type="button" onClick={() => setTrackingDayIdx(i)}
                            className="rounded-xl py-2 flex flex-col items-center transition-all"
                            style={{
                              border: trackingDayIdx === i ? `1.5px solid ${phaseColor}` : "1px solid rgba(18,16,13,0.12)",
                              background: trackingDayIdx === i ? phaseBg : "#ffffff",
                              color: trackingDayIdx === i ? phaseColor : "rgba(18,16,13,0.45)",
                            }}>
                            <span style={{ fontSize: "10px", fontWeight: trackingDayIdx === i ? 700 : 400 }}>
                              {DAY_SHORT_MS[i]}
                            </span>
                            <span style={{ fontSize: "8px", marginTop: "1px", fontWeight: 400 }}>
                              {day.kcal >= 1000 ? `${(day.kcal / 1000).toFixed(1)}k` : day.kcal}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-1.5 text-xs" style={{ color: "rgba(18,16,13,0.38)" }}>
                      {cyclingSchedule.days[trackingDayIdx].phase === "high" ? "▲ Ngày HIGH" : cyclingSchedule.days[trackingDayIdx].phase === "medium" ? "◆ Ngày MED" : "▼ Ngày LOW"} — {cyclingSchedule.days[trackingDayIdx].kcal.toLocaleString("vi-VN")} kcal
                    </p>
                  </div>
                )}

                <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(18,16,13,0.35)" }}>Tracking Board</p>
                <TrackingBar label={`Calo · ${totals.calories} / ${trackTarget.calories} kcal`} current={totals.calories} target={trackTarget.calories} color="#eb0915" />
                <TrackingBar label={`Protein · ${Math.round(totals.protein)} / ${trackTarget.protein}g`} current={totals.protein} target={trackTarget.protein} color="#1d4ed8" />
                <TrackingBar label={`Fat · ${Math.round(totals.fat)} / ${trackTarget.fat}g`} current={totals.fat} target={trackTarget.fat} color="#b45309" />
                <TrackingBar label={`Carbs · ${Math.round(totals.carbs)} / ${trackTarget.carbs}g`} current={totals.carbs} target={trackTarget.carbs} color="#065f46" />
              </div>

              <div id="manual-form-area" className="space-y-4">
                <p className="dp-label">
                  {editingMealId ? "Chỉnh sửa bữa ăn" : "Ghép bữa ăn từ nguyên liệu"}
                </p>
                <div className="space-y-4">
                  {rows.map(row => (
                    <IngredientSearchRow key={row.id} row={row} isActive={activeDropdown === row.id} canRemove={rows.length > 1}
                      onQueryChange={val => { setRows(prev => prev.map(r => r.id === row.id ? { ...r, query: val, food: null } : r)); setActiveDropdown(row.id); }}
                      onSelect={food => { setRows(prev => prev.map(r => r.id === row.id ? { ...r, food, query: food.name } : r)); setActiveDropdown(null); }}
                      onGramsChange={g => setRows(prev => prev.map(r => r.id === row.id ? { ...r, grams: g } : r))}
                      onRemove={() => setRows(prev => prev.filter(r => r.id !== row.id))}
                      onFocus={() => setActiveDropdown(row.id)}
                      onBlur={() => setTimeout(() => setActiveDropdown(prev => prev === row.id ? null : prev), 150)}
                    />
                  ))}
                </div>

                {rows.length < 5 && (
                  <button type="button" onClick={() => setRows(prev => [...prev, newRow()])}
                    className="text-sm font-semibold" style={{ color: "#eb0915" }}>
                    + Thêm nguyên liệu ({rows.length}/5)
                  </button>
                )}

                {(() => {
                  const filled = rows.filter((r): r is IngredientRow & { food: FoodItem } => r.food !== null);
                  if (filled.length === 0) return null;
                  const total = filled.reduce((acc, r) => { const m = computeRowMacros(r.food, r.grams); return { calories: acc.calories + m.calories, protein: acc.protein + m.protein, fat: acc.fat + m.fat, carbs: acc.carbs + m.carbs }; }, { calories: 0, protein: 0, fat: 0, carbs: 0 });
                  return (
                    <div className="rounded-xl p-3" style={{ background: "rgba(18,16,13,0.03)", border: "1px solid rgba(18,16,13,0.08)" }}>
                      <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "rgba(18,16,13,0.35)" }}>Tổng bữa · {filled.length} nguyên liệu</p>
                      <div className="flex gap-4 flex-wrap">
                        {[{ label: "Calo", value: `${Math.round(total.calories)} kcal`, color: "#eb0915" }, { label: "Protein", value: `${Math.round(total.protein)}g`, color: "#1d4ed8" }, { label: "Fat", value: `${Math.round(total.fat)}g`, color: "#b45309" }, { label: "Carbs", value: `${Math.round(total.carbs)}g`, color: "#065f46" }].map(item => (
                          <div key={item.label}>
                            <p className="text-xs" style={{ color: "rgba(18,16,13,0.4)" }}>{item.label}</p>
                            <p className="text-sm font-bold" style={{ color: item.color }}>{item.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                <div className={`mt-4 mb-1 ${editingMealId ? "flex gap-2" : ""}`}>
                  <button type="button" onClick={handleConfirmMeal} disabled={rows.every(r => r.food === null)}
                    className="flex-1 w-full py-3 px-6 rounded-xl text-sm font-bold text-center transition-all active:scale-[0.98]"
                    style={{
                      background: rows.every(r => r.food === null) ? "rgba(18,16,13,0.3)" : editingMealId ? "#1d4ed8" : "#12100d",
                      color: "#ffffff",
                      cursor: rows.some(r => r.food !== null) ? "pointer" : "not-allowed",
                    }}>
                    {editingMealId ? "✎ Cập nhật món ăn" : "✓ Xác nhận gộp bữa"}
                  </button>
                  {editingMealId && (
                    <button type="button" onClick={handleCancelEdit}
                      className="px-6 py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.98]"
                      style={{ background: "rgba(18,16,13,0.07)", color: "rgba(18,16,13,0.6)" }}>
                      Hủy
                    </button>
                  )}
                </div>
              </div>

              {manualFoods.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(18,16,13,0.35)" }}>Danh sách đã nhập ({manualFoods.length} món)</p>
                  {manualFoods.map(food => (
                    <div key={food.id} className="flex items-center gap-2 rounded-xl px-4 py-3"
                      style={{
                        background: editingMealId === food.id ? "rgba(29,78,216,0.06)" : "rgba(18,16,13,0.025)",
                        border: editingMealId === food.id ? "1px solid rgba(29,78,216,0.3)" : "1px solid rgba(18,16,13,0.07)",
                      }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: "#12100d" }}>{food.name}</p>
                        <p className="text-xs mt-0.5" style={{ color: "rgba(18,16,13,0.4)" }}>
                          {Math.round(food.calories)} kcal &nbsp;·&nbsp; P:{Math.round(food.protein)}g F:{Math.round(food.fat)}g C:{Math.round(food.carbs)}g
                        </p>
                      </div>
                      {food.sourceRows && food.sourceRows.length > 0 && (
                        <button type="button" onClick={() => handleEditMeal(food.id)}
                          className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm"
                          style={{ background: "rgba(29,78,216,0.09)", color: "#1d4ed8" }} aria-label="Chỉnh sửa">
                          ✎
                        </button>
                      )}
                      <button type="button" onClick={() => {
                        if (editingMealId === food.id) { setEditingMealId(null); setRows([newRow()]); }
                        setManualFoods(prev => prev.filter(f => f.id !== food.id));
                      }}
                        className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-base font-bold"
                        style={{ background: "rgba(235,9,21,0.08)", color: "#eb0915" }} aria-label="Xoá">
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Notice & Instructions block ── */}
      {hasMealData && (
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4" style={{ border: "1px solid rgba(18,16,13,0.1)" }}>
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "rgba(18,16,13,0.35)" }}>
            Hướng dẫn & Lưu ý Thực đơn
          </p>

          {/* Phương pháp & Mục tiêu */}
          <div>
            <label className="dp-label">Phương pháp & Mục tiêu</label>
            <textarea
              rows={2}
              value={noticeMethod}
              onChange={e => setNoticeMethod(e.target.value)}
              placeholder="Ví dụ: Thực đơn thâm hụt calo — Mục tiêu Giảm mỡ nâng cao"
              className="dp-input resize-none"
              style={{ lineHeight: 1.6 }}
            />
          </div>

          {/* Lượng nước */}
          <div>
            <label className="dp-label">
              Lượng nước uống khuyến nghị
              <span className="ml-1.5 text-xs font-normal" style={{ color: "rgba(18,16,13,0.35)" }}>
                (tự động: {result.weight}kg × 40ml = {Math.round(result.weight * 40).toLocaleString("vi-VN")}ml)
              </span>
            </label>
            <textarea
              rows={2}
              value={noticeWater}
              onChange={e => setNoticeWater(e.target.value)}
              className="dp-input resize-none"
              style={{ lineHeight: 1.6 }}
            />
          </div>

          {/* Hướng dẫn chế biến */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="dp-label mb-0">Hướng dẫn chế biến & Lưu ý</label>
              <button
                type="button"
                onClick={handleSuggestRandom}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all active:scale-95"
                style={{
                  background: "rgba(235,9,21,0.08)",
                  color: "#eb0915",
                  border: "1px solid rgba(235,9,21,0.2)",
                  cursor: "pointer",
                }}
              >
                ✨ Gợi ý tự động
              </button>
            </div>
            <textarea
              rows={5}
              value={noticeTips}
              onChange={e => setNoticeTips(e.target.value)}
              placeholder="PT tự điền mẹo nấu ăn, ăn nhạt, hạn chế dầu mỡ... hoặc bấm Gợi ý bởi AI"
              className="dp-input resize-none"
              style={{ lineHeight: 1.6 }}
            />
          </div>
        </div>
      )}

      {/* ── Preview / PDF button ── */}
      {hasMealData && (
        <button
          type="button"
          onClick={() => setShowPreview(true)}
          className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2.5 transition-all active:scale-[0.98]"
          style={{ background: "#12100d", color: "#ffffff" }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
          </svg>
          Xem trước & Thiết kế file PDF
        </button>
      )}

      {/* ── Preview Overlay (portal → direct child of body, fixes print blank-page bug) ── */}
      {showPreview && createPortal(
        <div id="pdf-preview-root" className="fixed inset-0 z-50 bg-gray-100 overflow-y-auto">

          {/* Controls bar — hidden on print */}
          <div
            className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 px-4 py-3 shadow-md"
            style={{ background: "#12100d" }}
          >
            {/* Logo upload */}
            <div className="flex items-center gap-2">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                onChange={handleLogoUpload}
                className="hidden"
                id="logo-upload-input"
              />
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all"
                style={{ background: logoUrl ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.1)", color: logoUrl ? "#10b981" : "rgba(255,255,255,0.8)", border: `1px solid ${logoUrl ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.15)"}` }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                </svg>
                {logoUrl ? "Đổi logo" : "Tải lên Logo"}
              </button>
              {logoUrl && (
                <button type="button" onClick={() => setLogoUrl(null)}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{ background: "rgba(235,9,21,0.2)", color: "#eb0915" }}>
                  ×
                </button>
              )}
            </div>

            {logoUrl && <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "20px" }}>|</span>}

            {/* Image size slider — only shown when logo is uploaded */}
            {logoUrl && (
              <div className="flex items-center gap-2.5" style={{ minWidth: "200px" }}>
                <span className="text-xs font-semibold flex-shrink-0" style={{ color: "rgba(255,255,255,0.7)" }}>
                  Kích thước ảnh: {imageSize}px
                </span>
                <input
                  type="range"
                  min={50}
                  max={400}
                  step={10}
                  value={imageSize}
                  onChange={(e) => setImageSize(Number(e.target.value))}
                  className="flex-1 h-1.5 rounded-lg appearance-none cursor-pointer"
                  style={{ accentColor: "#eb0915" }}
                />
              </div>
            )}

            <span className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
              Click vào bất kỳ văn bản nào để chỉnh sửa trực tiếp
            </span>

            <div className="ml-auto flex items-center gap-2">
              {/* Print / PDF */}
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all"
                style={{ background: "#eb0915", color: "#ffffff" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                  <rect x="6" y="14" width="12" height="8"/>
                </svg>
                In / Xuất PDF
              </button>

              {/* Close */}
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold"
                style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.7)", border: "1px solid rgba(255,255,255,0.12)" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
                Đóng
              </button>
            </div>
          </div>

          {/* A4 print area */}
          <div className="py-6 px-4 flex justify-center">
            <div
              id="pdf-print-area"
              className="w-full bg-white shadow-2xl"
              style={{ maxWidth: "794px", minHeight: "1123px" }}
            >
              {(() => {
                // Active cycling day = whichever day the PT is viewing in the current tab
                const activeDayIdx = activeTab === "manual" ? trackingDayIdx : cyclingDayIdx;
                return (
                  <PrintPreview
                    key={cyclingSchedule?.enabled ? activeDayIdx : "base"}
                    result={result}
                    aiMeals={aiMeals}
                    manualFoods={manualFoods}
                    date={today}
                    logoUrl={logoUrl}
                    imageSize={imageSize}
                    noticeMethod={noticeMethod}
                    noticeWater={noticeWater}
                    noticeTips={noticeTips}
                    printCyclingDay={cyclingSchedule?.enabled ? cyclingSchedule.days[activeDayIdx] : null}
                    cyclingSchedule={cyclingSchedule?.enabled ? cyclingSchedule : null}
                  />
                );
              })()}
            </div>
          </div>

          {/* Print CSS */}
          <style>{`
            @media print {
              /* ── Kích thước trang A4, margin 8mm ── */
              @page {
                size: A4 portrait;
                margin: 8mm;
              }

              /* ── Bắt buộc in màu nền (giữ màu đỏ header) + đồng bộ font ── */
              *, *::before, *::after {
                font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                color-adjust: exact !important;
              }

              /* ── Ẩn toàn bộ body content trừ overlay (overlay là direct child của body nhờ portal) ── */
              body > *:not(#pdf-preview-root) { display: none !important; }

              /* ── html/body không chiếm chiều cao thừa ── */
              html, body {
                height: auto !important;
                overflow: visible !important;
                margin: 0 !important;
                padding: 0 !important;
                background: white !important;
              }

              /* ── Xóa controls bar khỏi layout ── */
              .no-print { display: none !important; }

              /* ── Đặt overlay ở góc trên cùng trang, không fixed, không clip ── */
              #pdf-preview-root {
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                width: 100% !important;
                overflow: visible !important;
                background: white !important;
                height: auto !important;
                margin: 0 !important;
                padding: 0 !important;
              }

              /* ── Wrapper: flex-center để #pdf-print-area nằm chính giữa trang ── */
              #pdf-preview-root > div:not(.no-print) {
                padding: 0 !important;
                margin: 0 !important;
                display: flex !important;
                justify-content: center !important;
                align-items: flex-start !important;
              }

              /* ── Scale nội dung xuống ~82% để vừa A4 với 8mm margin, căn giữa ── */
              #pdf-print-area {
                position: static !important;
                box-shadow: none !important;
                width: 794px !important;
                max-width: unset !important;
                min-height: unset !important;
                zoom: 0.82 !important;
                margin: 0 auto !important;
              }

              /* ── Ngăn ngắt trang giữa bảng biểu và khối notice ── */
              table {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
              }
              #pdf-print-area > div > div {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
              }

              /* ── Thu hẹp padding khối roadmap khi in để tiết kiệm chiều dọc ── */
              #pdf-print-area [data-print-block="roadmap"] {
                padding: 6px 10px !important;
                margin-bottom: 8px !important;
                break-inside: avoid !important;
                page-break-inside: avoid !important;
              }
              #pdf-print-area [data-print-block="roadmap"] > div {
                gap: 8px !important;
              }

              /* ── Xoá viền và outline của contenteditable ── */
              [contenteditable] {
                outline: none !important;
                border: none !important;
              }
            }
          `}</style>
        </div>,
        document.body
      )}

    </div>
  );
}
