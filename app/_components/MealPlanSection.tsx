"use client";

import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import type { NutritionResult, CyclingSchedule } from "./DietForm";
import { type FoodItem } from "@/lib/foods-data";
import {
  PrintPreview,
  computeRowMacros,
  searchFoods,
  type AiMeal,
  type ManualFood,
  type PhaseKey,
} from "./PrintPreview";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "ai" | "manual";
type MealCount = 2 | 3 | 4 | 5;

interface IngredientRow {
  id: string;
  query: string;
  food: FoodItem | null;
  grams: number;
}

// ─── Utils ────────────────────────────────────────────────────────────────────

/** Return a new array with the item at `from` moved to `to`. The whole object
 *  (name + calo + macro) moves together, so they can never fall out of sync. */
function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}

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

// Compact up/down control to reorder a list item. Moving an item moves its whole
// object, so calo/macro always travel with the name.
function ReorderButtons({ onUp, onDown, canUp, canDown }: {
  onUp: () => void; onDown: () => void; canUp: boolean; canDown: boolean;
}) {
  const btn = (dir: "up" | "down", on: () => void, can: boolean) => (
    <button type="button" onClick={on} disabled={!can} aria-label={dir === "up" ? "Lên" : "Xuống"}
      className="w-5 h-4 flex items-center justify-center rounded transition-colors"
      style={{ background: can ? "rgba(18,16,13,0.05)" : "transparent", color: can ? "rgba(18,16,13,0.5)" : "rgba(18,16,13,0.18)", cursor: can ? "pointer" : "default", lineHeight: 1 }}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2">
        {dir === "up" ? <polyline points="6 15 12 9 18 15" /> : <polyline points="6 9 12 15 18 9" />}
      </svg>
    </button>
  );
  return (
    <div className="flex flex-col gap-0.5 flex-shrink-0">
      {btn("up", onUp, canUp)}
      {btn("down", onDown, canDown)}
    </div>
  );
}

function AiMealCard({ meal, onMoveUp, onMoveDown, canMoveUp, canMoveDown }: {
  meal: AiMeal;
  onMoveUp: () => void; onMoveDown: () => void; canMoveUp: boolean; canMoveDown: boolean;
}) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(18,16,13,0.1)" }}>
      <div className="px-4 py-2 flex items-center justify-between gap-2" style={{ background: "rgba(235,9,21,0.05)" }}>
        <div className="flex items-center gap-2 min-w-0">
          <ReorderButtons onUp={onMoveUp} onDown={onMoveDown} canUp={canMoveUp} canDown={canMoveDown} />
          <span className="truncate" style={{ fontSize: "0.875rem", fontWeight: 700, color: "#eb0915" }}>{meal.mealName}</span>
        </div>
        <span className="flex-shrink-0" style={{ fontSize: "0.875rem", fontWeight: 700, color: "#12100d" }}>{meal.calories} kcal</span>
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

  // Unified "current day" — both the AI generator and the manual tracking board edit this day.
  const [selectedDayIdx, setSelectedDayIdx] = useState(todayIdx);

  const [activeTab, setActiveTab] = useState<Tab>("ai");
  const [mealCount, setMealCount] = useState<MealCount>(3);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiCooldown, setAiCooldown] = useState(0);
  const [aiError, setAiError] = useState<string | null>(null);

  // ── Per-day menu storage (index 0..6). When cycling is OFF only bucket 0 is used. ──
  const [aiMealsByDay, setAiMealsByDay] = useState<(AiMeal[] | null)[]>(() => Array(7).fill(null));
  const [manualFoodsByDay, setManualFoodsByDay] = useState<ManualFood[][]>(() => Array.from({ length: 7 }, () => []));

  const [rows, setRows] = useState<IngredientRow[]>(() => [newRow()]);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Effective day bucket: when cycling disabled, everything lives in bucket 0.
  const dayIdx = cyclingSchedule?.enabled ? selectedDayIdx : 0;
  const aiMeals = aiMealsByDay[dayIdx];
  const manualFoods = manualFoodsByDay[dayIdx];

  const setAiMealsForDay = useCallback((idx: number, v: AiMeal[] | null) => {
    setAiMealsByDay(prev => prev.map((d, i) => (i === idx ? v : d)));
  }, []);
  const updateManualForDay = (idx: number, fn: (list: ManualFood[]) => ManualFood[]) => {
    setManualFoodsByDay(prev => prev.map((d, i) => (i === idx ? fn(d) : d)));
  };

  // Notice block state
  const [noticeMethod, setNoticeMethod] = useState(() => GOAL_DESC[result.weightGoal] ?? "");
  const [noticeWater, setNoticeWater] = useState(() => {
    const ml = Math.round(result.weight * 40);
    return `Khuyến nghị uống tối thiểu ${ml.toLocaleString("vi-VN")}ml nước mỗi ngày (40ml/kg trọng lượng cơ thể)`;
  });
  const [noticeTips, setNoticeTips] = useState("");

  // Preview / PDF state
  const [showPreview, setShowPreview] = useState(false);
  const [previewDayIdx, setPreviewDayIdx] = useState(todayIdx);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState(150);

  // Clicking a Low/Medium/High column in the preview's "Tổng dinh dưỡng" table
  // jumps to that phase's day so its selected meals are shown. Prefer a day of
  // that phase that already has a menu; otherwise the first day of that phase.
  const goToPhaseDay = useCallback((phase: PhaseKey) => {
    if (!cyclingSchedule?.enabled) return;
    const days = cyclingSchedule.days;
    const withMenu = days.findIndex((d, i) =>
      d.phase === phase && ((aiMealsByDay[i] && aiMealsByDay[i]!.length > 0) || manualFoodsByDay[i].length > 0));
    const target = withMenu >= 0 ? withMenu : days.findIndex(d => d.phase === phase);
    if (target >= 0) setPreviewDayIdx(target);
  }, [cyclingSchedule, aiMealsByDay, manualFoodsByDay]);

  // Share-link state
  const [shareLoading, setShareLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const totals = manualFoods.reduce(
    (a, f) => ({ calories: a.calories + f.calories, protein: a.protein + f.protein, fat: a.fat + f.fat, carbs: a.carbs + f.carbs }),
    { calories: 0, protein: 0, fat: 0, carbs: 0 }
  );

  const trackingDay = cyclingSchedule?.enabled ? cyclingSchedule.days[selectedDayIdx] : null;
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

    // Target the currently selected day (bucket 0 when cycling disabled).
    const targetDay = cyclingSchedule?.enabled ? selectedDayIdx : 0;
    setAiMealsForDay(targetDay, null);

    // Effective calorie/macro for the selected cycling day (or base DER if cycling disabled)
    // Protein & Fat are LOCKED; only Carbs adjusts as the lever (calcDayMacros logic in DietForm)
    const cyclingDay = cyclingSchedule?.enabled ? cyclingSchedule.days[targetDay] : null;
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
      setAiMealsForDay(targetDay, parseAiResponse(data.result));
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
  }, [result, mealCount, liveDer, liveProtein, liveFat, liveCarbs, cyclingSchedule, selectedDayIdx, setAiMealsForDay]);

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
      updateManualForDay(dayIdx, prev => prev.map(f => {
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
      updateManualForDay(dayIdx, prev => {
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

  // ── Share link ───────────────────────────────────────────────────────────────

  const handleCreateShare = useCallback(async () => {
    if (shareLoading) return;
    setShareLoading(true);
    setShareError(null);
    setShareUrl(null);
    setCopied(false);

    const payload = {
      result,
      cyclingSchedule: cyclingSchedule?.enabled ? cyclingSchedule : null,
      days: Array.from({ length: 7 }, (_, i) => ({
        aiMeals: aiMealsByDay[i],
        manualFoods: manualFoodsByDay[i].map(f => ({
          id: f.id, name: f.name, calories: f.calories, protein: f.protein, fat: f.fat, carbs: f.carbs,
        })),
      })),
      notices: { method: noticeMethod, water: noticeWater, tips: noticeTips },
      logoUrl,
      imageSize,
      date: new Date().toLocaleDateString("vi-VN"),
    };

    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 401) { window.location.replace("/login"); return; }
      const data = await res.json() as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? "Không tạo được link chia sẻ");
      setShareUrl(`${window.location.origin}/p/${data.id}`);
    } catch (e) {
      setShareError(e instanceof Error ? e.message : "Lỗi tạo link, vui lòng thử lại");
    } finally {
      setShareLoading(false);
    }
  }, [shareLoading, result, cyclingSchedule, aiMealsByDay, manualFoodsByDay, noticeMethod, noticeWater, noticeTips, logoUrl, imageSize]);

  const copyLink = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked — user can select manually */ }
  }, [shareUrl]);

  // Any day has a menu → show notice/preview/share entry points.
  const hasAnyMealData =
    aiMealsByDay.some(d => d && d.length > 0) || manualFoodsByDay.some(d => d.length > 0);

  const today = new Date().toLocaleDateString("vi-VN");

  // ── Day picker (shared by both tabs) ─────────────────────────────────────────
  const renderDayPicker = (label: string) =>
    cyclingSchedule?.enabled ? (
      <div>
        <p className="dp-label">{label}</p>
        <div className="grid grid-cols-7 gap-1 mt-1">
          {cyclingSchedule.days.map((day, i) => {
            const phaseColor = day.phase === "high" ? "#eb0915" : day.phase === "medium" ? "#d97706" : "#3b82f6";
            const phaseBg   = day.phase === "high" ? "rgba(235,9,21,0.07)" : day.phase === "medium" ? "rgba(217,119,6,0.07)" : "rgba(59,130,246,0.07)";
            const hasMenu = (aiMealsByDay[i] && aiMealsByDay[i]!.length > 0) || manualFoodsByDay[i].length > 0;
            return (
              <button key={i} type="button" onClick={() => setSelectedDayIdx(i)}
                className="rounded-xl py-2 flex flex-col items-center transition-all relative"
                style={{
                  border: selectedDayIdx === i ? `1.5px solid ${phaseColor}` : "1px solid rgba(18,16,13,0.12)",
                  background: selectedDayIdx === i ? phaseBg : "#ffffff",
                  color: selectedDayIdx === i ? phaseColor : "rgba(18,16,13,0.45)",
                }}>
                {hasMenu && (
                  <span style={{ position: "absolute", top: "3px", right: "3px", width: "6px", height: "6px", borderRadius: "50%", background: "#16a34a" }} />
                )}
                <span style={{ fontSize: "10px", fontWeight: selectedDayIdx === i ? 700 : 400 }}>
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
          {cyclingSchedule.days[selectedDayIdx].phase === "high" ? "▲ Ngày HIGH" : cyclingSchedule.days[selectedDayIdx].phase === "medium" ? "◆ Ngày MED" : "▼ Ngày LOW"} — {cyclingSchedule.days[selectedDayIdx].kcal.toLocaleString("vi-VN")} kcal
          <span style={{ marginLeft: "6px", color: "#16a34a" }}>● ngày đã có thực đơn</span>
        </p>
      </div>
    ) : null;

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
              {renderDayPicker("Ngày muốn tạo thực đơn")}

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
                  {aiMeals.map((meal, i) => (
                    <AiMealCard key={i} meal={meal}
                      canMoveUp={i > 0} canMoveDown={i < aiMeals.length - 1}
                      onMoveUp={() => setAiMealsForDay(dayIdx, moveItem(aiMeals, i, i - 1))}
                      onMoveDown={() => setAiMealsForDay(dayIdx, moveItem(aiMeals, i, i + 1))}
                    />
                  ))}
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
                    {renderDayPicker("Ngày đang theo dõi")}
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
                  {manualFoods.map((food, i) => (
                    <div key={food.id} className="flex items-center gap-2 rounded-xl px-4 py-3"
                      style={{
                        background: editingMealId === food.id ? "rgba(29,78,216,0.06)" : "rgba(18,16,13,0.025)",
                        border: editingMealId === food.id ? "1px solid rgba(29,78,216,0.3)" : "1px solid rgba(18,16,13,0.07)",
                      }}>
                      <ReorderButtons
                        canUp={i > 0} canDown={i < manualFoods.length - 1}
                        onUp={() => updateManualForDay(dayIdx, list => moveItem(list, i, i - 1))}
                        onDown={() => updateManualForDay(dayIdx, list => moveItem(list, i, i + 1))}
                      />
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
                        updateManualForDay(dayIdx, prev => prev.filter(f => f.id !== food.id));
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
      {hasAnyMealData && (
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
      {hasAnyMealData && (
        <button
          type="button"
          onClick={() => { setPreviewDayIdx(dayIdx); setShowPreview(true); }}
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
              {/* Share link */}
              <button
                type="button"
                onClick={handleCreateShare}
                disabled={shareLoading}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all"
                style={{ background: shareLoading ? "rgba(22,163,74,0.55)" : "#16a34a", color: "#ffffff", cursor: shareLoading ? "not-allowed" : "pointer" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                </svg>
                {shareLoading ? "Đang tạo..." : "Tạo link cho khách"}
              </button>

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

          {/* Day selector row — only when cycling is active (hidden on print) */}
          {cyclingSchedule?.enabled && (
            <div className="no-print flex flex-wrap items-center gap-2 px-4 py-3" style={{ background: "#1c1a17", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.6)" }}>Xem thực đơn ngày:</span>
              <div className="flex flex-wrap gap-1.5">
                {cyclingSchedule.days.map((day, i) => {
                  const phaseColor = day.phase === "high" ? "#eb0915" : day.phase === "medium" ? "#d97706" : "#3b82f6";
                  const active = previewDayIdx === i;
                  const hasMenu = (aiMealsByDay[i] && aiMealsByDay[i]!.length > 0) || manualFoodsByDay[i].length > 0;
                  return (
                    <button key={i} type="button" onClick={() => setPreviewDayIdx(i)}
                      className="rounded-lg px-2.5 py-1.5 flex flex-col items-center transition-all relative"
                      style={{
                        border: active ? `1.5px solid ${phaseColor}` : "1px solid rgba(255,255,255,0.15)",
                        background: active ? phaseColor : "rgba(255,255,255,0.06)",
                        color: active ? "#fff" : "rgba(255,255,255,0.7)",
                        minWidth: "48px",
                      }}>
                      {hasMenu && (
                        <span style={{ position: "absolute", top: "3px", right: "3px", width: "5px", height: "5px", borderRadius: "50%", background: active ? "#fff" : "#16a34a" }} />
                      )}
                      <span style={{ fontSize: "11px", fontWeight: 700 }}>{DAY_SHORT_MS[i]}</span>
                      <span style={{ fontSize: "8px", opacity: 0.85 }}>
                        {day.kcal >= 1000 ? `${(day.kcal / 1000).toFixed(1)}k` : day.kcal}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* A4 print area(s) — one page per day that has a menu.
              All days stay mounted so per-day edits survive day-switching, and on
              print every menu day is emitted as its own page. On screen only the
              selected day is shown (CSS .pdf-day visibility below). */}
          <div className="py-6 px-4 flex justify-center">
            <div className="w-full" style={{ maxWidth: "794px" }}>
              {(() => {
                const cycling = !!cyclingSchedule?.enabled;
                const hasMenu = (i: number) =>
                  (!!aiMealsByDay[i] && aiMealsByDay[i]!.length > 0) || manualFoodsByDay[i].length > 0;

                let dayIndices: number[];
                if (cycling) {
                  dayIndices = Array.from({ length: 7 }, (_, i) => i).filter(hasMenu);
                  // Always keep the selected day visible on screen even if empty.
                  // Append last so it never sits between two printable pages.
                  if (!dayIndices.includes(previewDayIdx)) dayIndices.push(previewDayIdx);
                } else {
                  dayIndices = [0];
                }

                return dayIndices.map((i, pos) => {
                  const empty = cycling && !hasMenu(i);
                  const selected = cycling ? i === previewDayIdx : true;
                  return (
                    <div
                      key={i}
                      data-day-idx={i}
                      className={`pdf-day bg-white shadow-2xl${selected ? " pdf-day-selected" : ""}${empty ? " pdf-day-empty" : ""}`}
                      style={{ width: "100%", minHeight: "1123px", marginTop: pos === 0 ? 0 : "24px" }}
                    >
                      <PrintPreview
                        result={result}
                        aiMeals={aiMealsByDay[i]}
                        manualFoods={manualFoodsByDay[i]}
                        date={today}
                        logoUrl={logoUrl}
                        imageSize={imageSize}
                        noticeMethod={noticeMethod}
                        noticeWater={noticeWater}
                        noticeTips={noticeTips}
                        printCyclingDay={cycling ? cyclingSchedule!.days[i] : null}
                        cyclingSchedule={cycling ? cyclingSchedule! : null}
                        showToolbar={pos === 0}
                        onPhaseNavigate={cycling ? goToPhaseDay : undefined}
                      />
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Share-link modal */}
          {(shareUrl || shareError) && (
            <div
              className="no-print fixed inset-0 z-[60] flex items-center justify-center px-4"
              style={{ background: "rgba(18,16,13,0.55)" }}
              onClick={(e) => { if (e.target === e.currentTarget) { setShareUrl(null); setShareError(null); } }}
            >
              <div className="w-full max-w-md rounded-2xl p-6 shadow-2xl" style={{ background: "#fff" }}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold" style={{ color: "#12100d" }}>
                    {shareError ? "Không tạo được link" : "Link chia sẻ cho khách"}
                  </h3>
                  <button onClick={() => { setShareUrl(null); setShareError(null); }}
                    className="w-7 h-7 flex items-center justify-center rounded-lg"
                    style={{ color: "rgba(18,16,13,0.4)", background: "rgba(18,16,13,0.05)" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>

                {shareError ? (
                  <p className="text-sm" style={{ color: "#eb0915" }}>{shareError}</p>
                ) : (
                  <>
                    <p className="text-xs mb-3" style={{ color: "rgba(18,16,13,0.55)" }}>
                      Khách mở link này sẽ xem được thực đơn từng ngày (chỉ ngày đã lên món) và không chỉnh sửa được.
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={shareUrl ?? ""}
                        onFocus={(e) => e.currentTarget.select()}
                        className="flex-1 dp-input"
                        style={{ fontSize: "13px" }}
                      />
                      <button type="button" onClick={copyLink}
                        className="px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 flex-shrink-0"
                        style={{ background: copied ? "#16a34a" : "#12100d", color: "#fff" }}>
                        {copied ? "Đã copy ✓" : "Copy"}
                      </button>
                    </div>
                    <a href={shareUrl ?? "#"} target="_blank" rel="noopener noreferrer"
                      className="inline-block mt-3 text-sm font-semibold" style={{ color: "#1d4ed8" }}>
                      Mở thử link →
                    </a>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Print CSS */}
          <style>{`
            /* ── On screen: show only the selected day's page ── */
            .pdf-day { display: none; }
            .pdf-day.pdf-day-selected { display: block; }

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

              /* ── Wrapper: flex-center để các trang .pdf-day nằm chính giữa trang ── */
              #pdf-preview-root > div:not(.no-print) {
                padding: 0 !important;
                margin: 0 !important;
                display: flex !important;
                justify-content: center !important;
                align-items: flex-start !important;
              }

              /* ── In: hiện TẤT CẢ ngày có thực đơn, mỗi ngày 1 trang riêng ── */
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
              /* Ngày được chọn nhưng chưa có thực đơn → không in trang trống */
              .pdf-day.pdf-day-empty { display: none !important; }
              /* Mỗi trang ngày tiếp theo bắt đầu ở trang mới */
              .pdf-day + .pdf-day {
                page-break-before: always !important;
                break-before: page !important;
              }

              /* ── Ngăn ngắt trang giữa bảng biểu và khối notice ── */
              table {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
              }
              .pdf-day > div > div {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
              }

              /* ── Thu hẹp padding khối roadmap khi in để tiết kiệm chiều dọc ── */
              .pdf-day [data-print-block="roadmap"] {
                padding: 6px 10px !important;
                margin-bottom: 8px !important;
                break-inside: avoid !important;
                page-break-inside: avoid !important;
              }
              .pdf-day [data-print-block="roadmap"] > div {
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
