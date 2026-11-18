import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const steps = [
  { href: "/upload", step: "1", title: "급여대장 업로드" },
  { href: "/organize", step: "2", title: "AI 데이터 정리" },
  { href: "/review", step: "3", title: "담당자 확인·수정" },
  { href: "/payslips", step: "4", title: "직원별 급여명세서" },
  { href: "/send", step: "5", title: "발송" },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-6 sm:p-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">자버 급여명세서</h1>
        <p className="text-muted-foreground">
          세무사·노무사가 보낸 급여대장 파일 하나로, 직원별 급여명세서 발송까지.
        </p>
      </header>
      <ol className="grid gap-3 sm:grid-cols-2">
        {steps.map((s) => (
          <li key={s.href}>
            <Link href={s.href}>
              <Card className="h-full transition-colors hover:bg-muted">
                <CardHeader>
                  <CardDescription>
                    {s.step}단계
                  </CardDescription>
                  <CardTitle>{s.title}</CardTitle>
                </CardHeader>
              </Card>
            </Link>
          </li>
        ))}
      </ol>
    </main>
  );
}
