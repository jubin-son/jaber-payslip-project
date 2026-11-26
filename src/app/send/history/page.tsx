import { PageShell } from "@/components/common/page-shell";
import { HistoryClient } from "./history-client";

export default function SendHistoryPage() {
  return (
    <PageShell
      step="발송 관리"
      title="발송 결과·재발송"
      width="wide"
      description="보낸 급여명세서를 누가 언제 받았고 열어 봤는지 한곳에서 봐요. 아직 열지 않은 직원에게는 바로 재발송할 수 있어요."
    >
      <HistoryClient />
    </PageShell>
  );
}
