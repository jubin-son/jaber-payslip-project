import { PageShell } from "@/components/common/page-shell";
import { RecordsClient } from "./records-client";

export default function RecordsPage() {
  return (
    <PageShell
      step="급여명세서 관리"
      title="월별 급여명세서 기록"
      width="wide"
      description="명세서로 변환한 내용이 귀속월별로 저장돼요. 지난달 명세서도 여기서 다시 찾아 직원별로 열어 볼 수 있어요."
    >
      <RecordsClient />
    </PageShell>
  );
}
