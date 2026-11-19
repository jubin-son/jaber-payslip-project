import { PageShell } from "@/components/common/page-shell";
import { UploadClient } from "./upload-client";

export default function UploadPage() {
  return (
    <PageShell
      step="1단계"
      title="급여대장 업로드"
      description="세무사·노무사에게 받은 급여대장을 올려 주세요. 여러 파일을 한 번에 올릴 수 있고, 파일은 이 브라우저 안에서만 읽고 서버로 보내지 않아요."
    >
      <UploadClient />
    </PageShell>
  );
}
