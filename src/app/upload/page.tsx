import Link from "next/link";
import { UploadClient } from "./upload-client";

export default function UploadPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-6 sm:p-10">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">
        ← 처음으로
      </Link>
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">1단계 · 담당 주빈</p>
        <h1 className="text-2xl font-semibold">급여대장 업로드</h1>
        <p className="text-muted-foreground">
          세무사·노무사에게 받은 급여대장을 올리면 파일 안의 시트와 표를 그대로 읽어 보여줘요. 파일은 이 브라우저
          안에서만 읽고 서버로 보내지 않아요.
        </p>
      </header>
      <UploadClient />
    </main>
  );
}
