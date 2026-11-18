import Link from "next/link";
import { OrganizeClient } from "./organize-client";

export default function OrganizePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-6 sm:p-10">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">
        ← 처음으로
      </Link>
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">2단계</p>
        <h1 className="text-2xl font-semibold">AI 데이터 정리</h1>
        <p className="text-muted-foreground">
          급여대장마다 다른 열 이름을 표준 항목(기본급, 국민연금 …)으로 맞추고, 직원별 지급·공제 금액을 정리해 검산했어요.
        </p>
      </header>
      <OrganizeClient />
    </main>
  );
}
