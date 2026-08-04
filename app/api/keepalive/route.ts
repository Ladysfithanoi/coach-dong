import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Supabase (gói free) tự động PAUSE project sau 7 ngày không có truy vấn nào.
// App này gần như không đụng tới DB nên rất hay bị pause.
//
// Route này chạy một truy vấn thật (đọc bảng User) để Supabase ghi nhận là
// database vẫn đang được dùng. Cố tình KHÔNG dùng `SELECT 1` nữa: truy vấn
// chạm vào bảng thật chắc chắn được tính là hoạt động của database.
//
// Có 2 nơi gọi endpoint này (cố ý làm dư ra để phòng khi 1 cái chết):
//   1. GitHub Actions  — .github/workflows/keepalive.yml, 6 tiếng/lần
//   2. Vercel Cron     — vercel.json, 1 ngày/lần
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Nếu có đặt biến môi trường CRON_SECRET trên Vercel thì chỉ cho phép cron
  // của Vercel gọi (Vercel tự gắn header Authorization: Bearer <CRON_SECRET>).
  // Không đặt cũng không sao — endpoint chỉ đọc, không sửa gì.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const startedAt = Date.now();

  try {
    // Truy vấn thật vào bảng thật (không phải SELECT 1).
    const users = await prisma.user.count();

    const body = {
      ok: true,
      users,
      ms: Date.now() - startedAt,
      at: new Date().toISOString(),
    };
    console.log("[keepalive] OK", JSON.stringify(body));
    return NextResponse.json(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Keep-alive lỗi";
    // Log ra để còn thấy trong Vercel Logs khi đi tìm nguyên nhân.
    console.error("[keepalive] FAILED:", message);
    return NextResponse.json(
      { ok: false, error: message, ms: Date.now() - startedAt },
      { status: 500 },
    );
  }
}
