import { NextRequest, NextResponse } from "next/server";
import { FOODS } from "@/lib/foods-data";
import { getAuth } from "@/lib/auth";

// Always read env vars fresh — never use build-time cached values
export const dynamic = "force-dynamic";

// Comma-separated keys: GEMINI_API_KEYS=key1,key2,key3
const API_KEYS: string[] = process.env.GEMINI_API_KEYS
  ? process.env.GEMINI_API_KEYS.split(",")
      .map((k) => k.trim())
      .filter(Boolean)
  : [];

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";

// Shuffle a copy of the foods array — Fisher-Yates — returns new array, never mutates original
function shuffleFoods<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Build system instruction fresh each request with shuffled food order.
// Shuffling forces Gemini to scan from a different starting point each call → natural rotation.
function buildSystemInstruction(): string {
  const foodsJson = JSON.stringify(shuffleFoods(FOODS));
  return `Cậu là một thuật toán toán học xếp hình thực đơn siêu tốc dành cho người Việt.
Nhiệm vụ: Dựa trên yêu cầu từ HLV (Protein/Fat/Carbs/Calo mục tiêu, số bữa), lựa chọn thực phẩm từ MẢNG DỮ LIỆU BÊN DƯỚI và thiết kế thực đơn theo đúng QUY TRÌNH 4 BƯỚC.

MẢNG DỮ LIỆU THỰC PHẨM (526 món chuẩn Việt Nam — thứ tự xáo trộn mỗi lần gọi để tăng đa dạng):
${foodsJson}

══════════════════════════════════════════════
⛔ QUY TẮC ĐA DẠNG BỮA ĂN — VI PHẠM = ĐẦU RA VÔ HIỆU
══════════════════════════════════════════════

ANTI-DUPLICATE MEALS (áp dụng TRƯỚC mọi bước khác):

1. CẤM TUYỆT ĐỐI các bữa trong cùng một ngày có thực đơn giống hệt nhau hoặc trùng lặp trên 70% danh sách thực phẩm (tính theo tên món, không tính khối lượng).
   → Ví dụ sai: Bữa 1 [Thịt bò + Trứng + Cơm], Bữa 2 [Thịt bò + Trứng + Cơm] — BỊ CẤM.
   → Ví dụ sai: Bữa 1 [Thịt bò + Trứng + Cơm], Bữa 2 [Thịt bò + Trứng + Khoai lang] — BỊ CẤM (2/3 món trùng = 67%, gần ngưỡng cần tránh).

2. MỖI BỮA phải dùng nguồn đạm (Protein), tinh bột (Carbs) và chất béo (Fat) KHÁC NHAU so với các bữa còn lại trong ngày:
   • Nguồn đạm phải KHÁC LOÀI/LOẠI: Bữa 1 dùng Thịt bò → Bữa 2 PHẢI là Cá / Tôm / Ức gà / Thịt heo nạc / Trứng / Đậu phụ (chọn loại chưa dùng).
   • Nguồn tinh bột phải KHÁC DẠNG: Bữa 1 dùng Cơm → Bữa 2 PHẢI là Bún / Khoai lang / Bánh mì / Phở / Yến mạch (chọn dạng chưa dùng).
   • Nếu bắt buộc phải dùng lại một món (ví dụ Rau muống xuất hiện 2 bữa), các thực phẩm chính (đạm + tinh bột) vẫn phải hoàn toàn khác nhau.

3. Trước khi xuất JSON, đọc lại toàn bộ danh sách bữa và tự hỏi: "Có bữa nào dùng cùng nguồn đạm với bữa khác không?" — Nếu có → phải đổi món ngay, không xuất.

══════════════════════════════════════════════
QUY TRÌNH 4 BƯỚC BẮT BUỘC
══════════════════════════════════════════════

BƯỚC 1 — CHỌN NGUYÊN LIỆU NGẪU NHIÊN (ĐA DẠNG TỐI ĐA):
• Liệt kê sẵn nguồn đạm cho từng bữa TRƯỚC KHI tính gram — đảm bảo không bữa nào trùng nhau.
  Ví dụ 3 bữa: [Bữa 1: Cá hồi], [Bữa 2: Ức gà], [Bữa 3: Tôm sú] → xác nhận không trùng → tiến hành tính.
• Đạm: luân phiên giữa cá các loại, thịt bò nạc, tôm, trứng, thịt heo nạc, đậu phụ, hải sản...
• Tinh bột: luân phiên giữa cơm gạo lứt, cơm trắng, bún, phở, khoai lang, bánh mì nguyên cám, yến mạch...
• Chất béo: lấy từ mỡ tự nhiên trong thực phẩm, dầu olive, bơ, các loại hạt có trong data.
• Nếu có từ 3 bữa trở lên: Bữa 1 (sáng) ưu tiên bún, phở, xôi, bánh mì, bánh bao, yến mạch.
• KHÔNG sáng tác món ngoài mảng dữ liệu. Chỉ dùng đúng tên món có trong data.

BƯỚC 2 — GIẢI PHƯƠNG TRÌNH KHỐI LƯỢNG:
• Sau khi chọn xong món (đã đảm bảo đa dạng ở Bước 1), tính chính xác số GRAM của từng thực phẩm.
• Công thức: macro_thực_tế = macro_per_100g × (gram / 100)
• Điều chỉnh gram tăng/giảm sao cho tổng Protein, Fat, Carbs cộng lại đạt 95%–100% mục tiêu HLV.
• Ghi định lượng rõ trong trường "name": "Cơm lứt 200g + Cá lóc hấp 150g + Rau muống 100g"
• Nếu việc đổi món làm lệch macro → điều chỉnh GRAM, KHÔNG đổi ngược lại về món cũ.

BƯỚC 3 — PHÂN BỔ CALO ĐỀU THEO BỮA:
• Tổng calo ngày chia đều ra tất cả các bữa — mỗi bữa chiếm 30%–35% tổng calo.
• Sai số calo tối đa cho phép: ±50 kcal giữa các bữa với nhau.
• CẤM dồn calo vào một bữa duy nhất.

BƯỚC 4 — VÒNG LẶP TỰ KIỂM TRA KÉP (Self-Check):
• Kiểm tra ĐA DẠNG: Đọc lại danh sách bữa — có bữa nào trùng nguồn đạm hoặc tinh bột không? Nếu có → đổi món ngay.
• Kiểm tra TOÁN HỌC: Cộng tổng macro của tất cả bữa.
  - Nếu tổng Protein HOẶC Fat HOẶC Carbs lệch > 5% so với mục tiêu → BẮT BUỘC điều chỉnh lại gram.
  - Nếu tổng Calo lệch > ±50 kcal → điều chỉnh lại khẩu phần.
• Chỉ xuất JSON khi CẢ HAI điều kiện (đa dạng + toán học) đều đạt.

══════════════════════════════════════════════
ĐỊNH DẠNG ĐẦU RA (BẮT BUỘC TUYỆT ĐỐI)
══════════════════════════════════════════════
Trả về CHỈ JSON hợp lệ, không markdown, không giải thích:
[{"mealName":"Bữa 1 - Sáng (7:00)","name":"Tên món 150g + Tên món 2 200g","calories":500,"protein":35,"fat":15,"carbs":55}]`;
}

// HTTP status codes that are transient — skip to next key instead of failing hard
function isRetryableStatus(status: number): boolean {
  return [400, 429, 500, 503].includes(status);
}

async function callGemini(prompt: string): Promise<string> {
  if (API_KEYS.length === 0) {
    throw new Error(
      "Chưa cấu hình GEMINI_API_KEYS trong .env.local (định dạng: key1,key2,...)"
    );
  }

  let lastStatus = 0;

  for (let i = 0; i < API_KEYS.length; i++) {
    const key = API_KEYS[i];

    let response: Response;
    try {
      response = await fetch(`${GEMINI_URL}?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: buildSystemInstruction() }],
          },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.7,
            topP: 0.95,
            maxOutputTokens: 4096,
          },
        }),
      });
    } catch (networkErr) {
      console.log(`[Gemini] Key #${i + 1} lỗi mạng, thử key tiếp theo:`, networkErr);
      continue;
    }

    if (isRetryableStatus(response.status)) {
      console.log(
        `[Gemini] Key #${i + 1} trả về HTTP ${response.status}, thử key tiếp theo`
      );
      lastStatus = response.status;
      continue;
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gemini API lỗi HTTP ${response.status}: ${body}`);
    }

    const data = await response.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error("Gemini không trả về nội dung hợp lệ");
    }

    return text;
  }

  throw new Error(
    `Tất cả ${API_KEYS.length} key đều không khả dụng (lỗi cuối: HTTP ${lastStatus}). Vui lòng thêm key mới hoặc thử lại sau.`
  );
}

export async function POST(req: NextRequest) {
  const auth = await getAuth();
  if (!auth.ok) {
    return NextResponse.json(
      {
        error: auth.kicked
          ? "Tài khoản của bạn đang được đăng nhập ở một thiết bị khác!"
          : "Chưa đăng nhập",
        kicked: auth.kicked,
      },
      { status: 401 }
    );
  }

  try {
    const body = await req.json() as { prompt?: string };
    const { prompt } = body;

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json(
        { error: "Thiếu hoặc sai định dạng tham số 'prompt'" },
        { status: 400 }
      );
    }

    const result = await callGemini(prompt.trim());
    return NextResponse.json({ result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Lỗi không xác định từ Gemini";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
