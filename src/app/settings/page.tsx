import { PageShell } from "@/components/common/page-shell";
import { SettingsClient } from "./settings-client";

export default function SettingsPage() {
  return (
    <PageShell
      step="인건비 관리"
      title="기본 관리"
      description="내 사업장 정보와 급여명세서 발행 설정을 정해요. 한 번 정해 두면 급여대장을 올릴 때마다 그대로 써요."
    >
      <SettingsClient />
    </PageShell>
  );
}
