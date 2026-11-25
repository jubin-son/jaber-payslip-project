import { PageShell } from "@/components/common/page-shell";
import { ReviewClient } from "./review-client";

export default function ReviewPage() {
  return (
    <PageShell
      step="급여명세서 작성 · 2단계"
      title="급여명세서 확인" width="full"
      description="급여대장에서 읽어 낸 내용을 직원별로 확인하세요. 고친 내용은 다음 단계 명세서 변환에서 명세서로 확인할 수 있어요."
    >
      <ReviewClient />
    </PageShell>
  );
}
