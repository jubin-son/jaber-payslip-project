import { PageShell } from "@/components/common/page-shell";
import { DashboardClient } from "./dashboard-client";

export default function DashboardPage() {
  return (
    <PageShell
      step="급여명세서 관리"
      title="월별 급여 대시보드"
      width="wide"
      description="달마다 쌓인 명세서를 합산해서 한눈에 보여줘요. 지난달과 비교해 어디서 얼마나 달라졌는지도 확인할 수 있어요."
    >
      <DashboardClient />
    </PageShell>
  );
}
