import { PageShell } from "@/components/common/page-shell";
import { SettingsClient } from "./settings-client";

export default function SettingsPage() {
  return (
    <PageShell
      step="인건비 관리"
      title="기본 관리"
      description="사업장마다 한 번 정해 두면 계속 쓰는 값이에요. 소득 구분과, 급여대장 엑셀의 항목을 어떤 수당·공제 항목으로 읽을지 정해 주세요."
    >
      <SettingsClient />
    </PageShell>
  );
}
