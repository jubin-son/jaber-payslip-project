import { PageShell } from "@/components/common/page-shell";
import { EmployeesClient } from "./employees-client";

export default function EmployeesPage() {
  return (
    <PageShell
      step="인건비 관리"
      title="임직원 관리"
      description="명세서를 받을 우리 사업장 직원을 등록해요. 엑셀로 한 번에 올리거나 한 명씩 직접 입력할 수 있고, 등록하면 회원번호(6자리)가 자동으로 붙어요. 사업장이 여러 곳이면 위에서 사업장을 골라 사업장별로 봐요."
      width="wide"
    >
      <EmployeesClient />
    </PageShell>
  );
}
