"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";

export const STEPS = [
  // AI 정리(/organize)는 화면에 보여주지 않고 '명세서 변환하기' 안에서 돈다
  { href: "/upload", no: 1, label: "업로드" },
  { href: "/review", no: 2, label: "확인·수정" },
  { href: "/payslips", no: 3, label: "명세서 변환" },
];

/** 지금 경로가 급여명세서 작성의 몇 단계인지. 급여명세서 관리·발송 관리는 단계가 아니다 */
export function stepOf(pathname: string) {
  if (pathname.startsWith("/organize")) return STEPS[0];
  return STEPS.find((s) => pathname === s.href || pathname.startsWith(`${s.href}/`));
}

// 모든 관리자 화면 공통 상단 바. 홈에서는 '시작하기', 작성 화면에서는 1~3단계 이동을 보여준다.
export function SiteHeader() {
  const pathname = usePathname();
  const current = stepOf(pathname);
  const isHome = pathname === "/";

  return (
    <header
      className={`sticky top-0 z-20 border-b backdrop-blur print:hidden ${
        isHome ? "border-transparent bg-white/90" : "border-neutral-100 bg-white/85"
      }`}
    >
      <div className={`flex h-16 items-center justify-between gap-4 px-4 sm:px-6 ${isHome ? "mx-auto max-w-6xl" : ""}`}>
        <Link href="/" className="flex shrink-0 items-baseline gap-1.5">
          <span className="text-xl font-extrabold tracking-tight">자버</span>
          <span className="text-base font-semibold text-neutral-400">인사관리</span>
        </Link>

        {current ? (
          <StepNav currentNo={current.no} className="hidden md:flex" />
        ) : isHome && (
          <Link
            href="/upload"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#111] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-neutral-700"
          >
            시작하기 <ArrowUpRight className="size-4" />
          </Link>
        )}
      </div>
      {current && (
        <div className="overflow-x-auto border-t border-neutral-100 md:hidden">
          <StepNav currentNo={current.no} className="flex px-4 py-2" />
        </div>
      )}
    </header>
  );
}

function StepNav({ currentNo, className = "" }: { currentNo: number; className?: string }) {
  return (
    <nav aria-label="단계" className={className}>
      <ol className="flex items-center gap-1">
        {STEPS.map((s) => {
          const active = s.no === currentNo;
          const done = s.no < currentNo;
          return (
            <li key={s.href}>
              <Link
                href={s.href}
                aria-current={active ? "step" : undefined}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                  active ? "bg-neutral-900 text-white" : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                }`}
              >
                <span
                  className={`flex size-5 items-center justify-center rounded-full text-[11px] ${
                    active ? "bg-white text-neutral-900" : done ? "bg-indigo-100 text-indigo-600" : "bg-neutral-100 text-neutral-500"
                  }`}
                >
                  {s.no}
                </span>
                {s.label}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-neutral-100 bg-white py-10 print:hidden">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 text-sm text-neutral-400 sm:px-6">
        <span className="font-bold text-neutral-600">자버 급여명세서 시제품</span>
        <span>화면에 나오는 사업장·직원·금액은 모두 가상 데이터입니다</span>
      </div>
    </footer>
  );
}
