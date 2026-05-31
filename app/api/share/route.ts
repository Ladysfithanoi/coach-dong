import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getAuth } from "@/lib/auth";

// Creating a share link requires a logged-in coach. The public read happens
// directly in the server component at /p/[id], so there is no public GET here.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await getAuth();
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.kicked ? "Tài khoản đang đăng nhập ở thiết bị khác!" : "Chưa đăng nhập", kicked: auth.kicked },
      { status: 401 }
    );
  }

  try {
    const body = (await req.json()) as unknown;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    }

    const created = await prisma.sharedPlan.create({
      data: { data: body as Prisma.InputJsonValue },
      select: { id: true },
    });

    return NextResponse.json({ id: created.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi lưu link chia sẻ";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
