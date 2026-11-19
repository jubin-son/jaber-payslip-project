import Link from "next/link";
import { PayslipsClient } from "./payslips-client";

export default function PayslipsPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-4 sm:p-10">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">
        ← 처음으로
      </Link>
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">4단계</p>
        <h1 className="text-2xl font-semibold">직원별 급여명세서</h1>
        <p className="text-muted-foreground">
          3단계에서 확인한 금액으로 직원마다 명세서를 만들었어요. 직원을 누르면 미리 볼 수 있고, 링크는 직원이 여는 화면이에요.
        </p>
      </header>
      <PayslipsClient />
    </main>
  );
}
