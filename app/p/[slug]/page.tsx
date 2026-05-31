import prisma from "@/lib/prisma";
import SharedPlanViewer, { type SharedPlanData } from "./SharedPlanViewer";

// Public read-only page — not covered by proxy.ts matcher, so no auth required.
export const dynamic = "force-dynamic";

export default async function SharedPlanPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  let plan: { data: unknown } | null = null;
  try {
    plan = await prisma.sharedPlan.findUnique({
      where: { id: slug },
      select: { data: true },
    });
  } catch {
    plan = null;
  }

  if (!plan) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-gray-100 text-center">
        <h1 className="text-xl font-bold" style={{ color: "#12100d" }}>Không tìm thấy thực đơn</h1>
        <p className="mt-2 text-sm" style={{ color: "rgba(18,16,13,0.55)" }}>
          Link có thể đã bị xoá hoặc không đúng. Vui lòng liên hệ HLV của bạn.
        </p>
      </div>
    );
  }

  return <SharedPlanViewer data={plan.data as unknown as SharedPlanData} />;
}
