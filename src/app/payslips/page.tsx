import { PageShell } from "@/components/common/page-shell";
import { PayslipsClient } from "./payslips-client";

export default function PayslipsPage() {
  return (
    <PageShell
      step="3단계"
      title="직원별 급여명세서" width="wide"
      description="확인·수정 화면에서 확인한 금액으로 직원마다 명세서를 만들었어요. 직원을 누르면 미리 볼 수 있고, 링크는 직원이 여는 화면이에요."
    >
      <PayslipsClient />
    </PageShell>
  );
}
