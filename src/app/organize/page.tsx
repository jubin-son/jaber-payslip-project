import { PageShell } from "@/components/common/page-shell";
import { OrganizeClient } from "./organize-client";

export default function OrganizePage() {
  return (
    <PageShell
      step="2단계"
      title="AI 데이터 정리"
      description="급여대장마다 다른 열 이름을 표준 항목(기본급, 국민연금 …)으로 맞추고, 직원별 지급·공제 금액을 정리해 검산했어요."
    >
      <OrganizeClient />
    </PageShell>
  );
}
