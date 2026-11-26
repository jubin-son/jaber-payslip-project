import { PageShell } from "@/components/common/page-shell";
import { SendClient } from "./send-client";

export default function SendPage() {
  return (
    <PageShell
      step="발송 관리"
      title="명세서 발송하기"
      width="wide"
      description="직원마다 알림톡과 메일 중 어디로 보낼지 고르고, 받는 사람이 보게 될 안내를 미리 확인해요. 지금은 시연이라 실제로 발송되지는 않아요."
    >
      <SendClient />
    </PageShell>
  );
}
