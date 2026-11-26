import { PageShell } from "@/components/common/page-shell";
import { PayslipsClient } from "./payslips-client";

export default function PayslipsPage() {
  return (
    <PageShell
      step="급여명세서 작성 · 3단계"
      title="명세서 변환" width="wide"
      description="올린 급여대장(확인·수정 화면에서 고친 내용 포함)으로 직원마다 명세서를 만들었어요. 직원을 누르면 미리 볼 수 있고, 변환된 명세서는 급여명세서 관리에 월별로 저장돼요."
    >
      <PayslipsClient />
    </PageShell>
  );
}
