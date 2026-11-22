import { PageShell } from "@/components/common/page-shell";
import { ReviewClient } from "./review-client";

export default function ReviewPage() {
  return (
    <PageShell
      step="2단계"
      title="급여명세서 확인" width="full"
      description="급여대장에서 읽어 낸 내용을 직원별로 확인하세요. 가운데에서 고치면 오른쪽 명세서에 바로 반영돼요."
    >
      <ReviewClient />
    </PageShell>
  );
}
