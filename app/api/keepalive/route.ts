import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Supabase (gói free) tự động PAUSE project sau 7 ngày không có truy vấn nào.
// App này gần như không đụng tới DB nên rất hay bị pause. Route này chỉ chạy
// một truy vấn cực nhẹ (SELECT 1) để giữ database luôn "active".
//
// Vercel Cron (xem vercel.json) sẽ tự gọi endpoint này mỗi ngày -> DB không
// bao giờ đủ 7 ngày idle -> không bị pause nữa.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Nếu có đặt biến môi trường CRON_SECRET trên Vercel thì chỉ cho phép cron
  // của Vercel gọi (Vercel tự gắn header Authorization: Bearer <CRON_SECRET>).
  // Không đặt cũng không sao — endpoint chỉ chạy SELECT 1, vô hại.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, at: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Keep-alive lỗi";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
