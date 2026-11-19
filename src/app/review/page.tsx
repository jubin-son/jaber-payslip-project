import Link from "next/link";
import { ReviewClient } from "./review-client";

export default function ReviewPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-4 sm:p-10">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">
        ← 처음으로
      </Link>
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">3단계</p>
        <h1 className="text-2xl font-semibold">담당자 확인·수정</h1>
        <p className="text-muted-foreground">
          AI가 정리한 금액에서 검산이 안 맞거나 확인이 필요한 칸을 색으로 표시했어요. 금액을 고치면 바로 다시 검산해요.
        </p>
      </header>
      <ReviewClient />
    </main>
  );
}
