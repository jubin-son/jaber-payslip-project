import { PageShell } from "@/components/common/page-shell";
import { ReviewClient } from "./review-client";

export default function ReviewPage() {
  return (
    <PageShell
      step="3단계"
      title="담당자 확인·수정" width="wide"
      description="AI가 정리한 금액에서 검산이 안 맞거나 확인이 필요한 칸을 색으로 표시했어요. 금액을 고치면 바로 다시 검산해요."
    >
      <ReviewClient />
    </PageShell>
  );
}
