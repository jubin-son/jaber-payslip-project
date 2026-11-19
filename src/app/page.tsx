import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/common/site-header";
import {
  AlertCircle,
  ArrowDown,
  ArrowUpRight,
  Check,
  FileSpreadsheet,
  Sparkles,
  UserRoundCheck,
  type LucideIcon,
} from "lucide-react";

type Service = {
  icon: LucideIcon;
  gradient: string;
  title: string;
  lines: string[];
  tags: { label: string; href?: string }[];
  href?: string;
  cta: string;
  soon?: boolean;
};

const payrollServices: Service[] = [
  {
    icon: FileSpreadsheet,
    gradient: "from-indigo-500 to-indigo-300",
    title: "급여명세서 발송",
    lines: [
      "세무사·노무사가 보낸 급여대장을 올리면",
      "AI가 항목과 금액을 정리해요",
      "확인만 하고 직원별 명세서를 바로 보내세요",
    ],
    tags: [
      { label: "급여대장 업로드", href: "/upload" },
      { label: "확인·수정", href: "/review" },
      { label: "명세서 발송", href: "/send" },
    ],
    href: "/upload",
    cta: "시작하기",
  },
  {
    icon: UserRoundCheck,
    gradient: "from-amber-400 to-amber-200",
    title: "직원 연락처 매칭",
    lines: [
      "급여대장의 직원 이름을 자버에 등록된",
      "직원 연락처와 자동으로 이어드려요",
      "수신동의 여부까지 발송 전에 확인하세요",
    ],
    tags: [{ label: "이름 매칭" }, { label: "연락처 확인" }, { label: "수신동의" }],
    cta: "준비 중",
    soon: true,
  },
];

const quick = [
  { label: "급여대장 업로드", href: "/upload" },
  { label: "확인·수정", href: "/review" },
  { label: "직원별 명세서", href: "/payslips" },
  { label: "알림톡 발송", href: "/send" },
];

const flow = [
  { no: "01", when: "파일을 받았을 때", title: "올리고 변환하기", desc: "엑셀, CSV, PDF 어떤 양식이든 올리면 AI가 지급·공제를 정리해요", href: "/upload" },
  { no: "02", when: "확인할 때", title: "틀린 곳만 고치기", desc: "숫자가 의심되는 곳을 먼저 보여주고, 고치면 명세서에 바로 반영돼요", href: "/review" },
  { no: "03", when: "명세서를 만들 때", title: "직원별 급여명세서", desc: "확인한 금액으로 직원마다 명세서를 만들어요", href: "/payslips" },
  { no: "04", when: "보낼 때", title: "알림톡으로 발송", desc: "직원은 휴대폰 링크로 명세서를 확인해요", href: "/send" },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <SiteHeader />

      <main>
        {/* 첫 화면 */}
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-24">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-600">
              <Sparkles className="size-4" /> AI 급여대장 정리
            </span>
            <h1 className="mt-5 text-[2.5rem] font-bold leading-[1.2] tracking-tight sm:text-6xl">
              급여대장 파일 하나로
              <br />
              명세서 발송까지
            </h1>
            <p className="mt-6 text-lg leading-relaxed text-neutral-600">
              양식 따로, 계산 따로, 발송 따로?
              <br />
              매달 반복되는 급여명세서 업무를 한 곳에서 끝내세요
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <a
                href="#services"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-neutral-900 px-8 py-4 font-semibold text-white transition-colors hover:bg-neutral-700"
              >
                급여 서비스 살펴보기 <ArrowDown className="size-4" />
              </a>
              <Link
                href="/upload"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-neutral-300 px-8 py-4 font-semibold transition-colors hover:border-neutral-900"
              >
                바로 시작하기 <ArrowUpRight className="size-4" />
              </Link>
            </div>
          </div>
          <HeroVisual />
        </section>

        {/* 바로 찾기 */}
        <section className="border-y border-neutral-100 bg-white">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:px-6">
            <p className="shrink-0 font-bold">필요한 업무 바로 찾기</p>
            <ul className="flex flex-wrap gap-2">
              {quick.map((q) => (
                <li key={q.href}>
                  <Link
                    href={q.href}
                    className="inline-block rounded-full bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-900 hover:text-white"
                  >
                    {q.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 서비스 카드 */}
        <section id="services" className="scroll-mt-16 bg-neutral-50 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              급여 담당자에게 필요한 것
              <br />
              여기 다 있어요
            </h2>
            <h3 className="mt-14 text-2xl font-bold">급여 업무</h3>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              {payrollServices.map((s) => (
                <ServiceCard key={s.title} service={s} />
              ))}
            </div>
          </div>
        </section>

        {/* 흐름 */}
        <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <h2 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            흩어져 있던 급여 업무를
            <br />
            하나의 흐름으로
          </h2>
          <p className="mt-4 text-lg text-neutral-600">
            급여대장을 받은 순간부터 직원이 명세서를 확인할 때까지 단계별로 이어져요
          </p>
          <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {flow.map((f) => (
              <li key={f.no}>
                <Link
                  href={f.href}
                  className="group flex h-full flex-col gap-2 rounded-3xl border border-neutral-200 bg-white p-7 transition-all hover:-translate-y-1 hover:border-neutral-900 hover:shadow-[0_12px_32px_rgba(0,0,0,0.06)]"
                >
                  <span className="text-sm font-semibold text-indigo-600">
                    {f.no} <span className="text-neutral-300">/</span> {f.when}
                  </span>
                  <span className="mt-1 text-xl font-bold">{f.title}</span>
                  <span className="leading-relaxed text-neutral-600">{f.desc}</span>
                  <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold">
                    살펴보기
                    <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        {/* 마무리 */}
        <section className="px-4 pb-24 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 rounded-[2rem] bg-neutral-900 px-8 py-14 text-white sm:px-14 md:flex-row md:items-center md:justify-between">
            <h2 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              반복되는 급여 업무는 줄이고
              <br />
              <span className="text-indigo-300">사람에게 더 집중하세요</span>
            </h2>
            <Link
              href="/upload"
              className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-8 py-4 font-semibold text-neutral-900 transition-colors hover:bg-neutral-200"
            >
              지금 시작하기 <ArrowUpRight className="size-5" />
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function HeroVisual() {
  const rows = [
    ["기본급", "2,300,000"],
    ["식대", "200,000"],
    ["국민연금", "-109,250"],
    ["건강보험", "-82,680"],
    ["고용보험", "-20,700"],
  ];
  return (
    <div className="relative mx-auto w-full max-w-md pb-14 pt-6 lg:max-w-none">
      <div aria-hidden className="absolute -right-4 top-0 size-56 rounded-full bg-indigo-300/70 sm:size-72" />
      <div aria-hidden className="absolute -left-2 bottom-10 size-28 rotate-12 rounded-[2rem] bg-amber-300/80" />

      <div className="relative mx-auto w-[85%] rounded-[1.75rem] border border-neutral-100 bg-white p-6 shadow-[0_24px_60px_rgba(30,30,60,0.15)]">
        <p className="text-xs font-semibold text-indigo-600">2026년 11월 급여명세서</p>
        <p className="mt-1 text-lg font-bold">김자버 님</p>
        <dl className="mt-5 flex flex-col gap-2.5 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <dt className="text-neutral-500">{k}</dt>
              <dd className={`font-medium tabular-nums ${v.startsWith("-") ? "text-neutral-500" : ""}`}>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 flex items-baseline justify-between border-t border-neutral-100 pt-4">
          <span className="text-sm font-semibold">실지급액</span>
          <span className="text-2xl font-bold tabular-nums">2,287,370원</span>
        </div>
      </div>

      <div className="absolute -right-1 top-2 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_12px_32px_rgba(0,0,0,0.12)] sm:right-0">
        <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-500 text-white">
          <Check className="size-5" strokeWidth={3} />
        </span>
        <span className="flex flex-col">
          <span className="text-sm font-bold">명세서 발송 완료</span>
          <span className="text-xs text-neutral-500">직원 4명 · 방금 전</span>
        </span>
      </div>

      <div className="absolute bottom-0 left-0 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_12px_32px_rgba(0,0,0,0.12)]">
        <span className="flex size-8 items-center justify-center rounded-lg bg-amber-400 text-white">
          <AlertCircle className="size-5" strokeWidth={2.5} />
        </span>
        <span className="flex flex-col">
          <span className="text-sm font-bold">검산 확인 필요</span>
          <span className="text-xs text-neutral-500">공제합계 14,020원 차이</span>
        </span>
      </div>
    </div>
  );
}

function ServiceCard({ service: s }: { service: Service }) {
  const Icon = s.icon;
  return (
    <article className="flex flex-col rounded-[2rem] bg-white p-8 shadow-[0_8px_40px_rgba(0,0,0,0.06)] transition-shadow hover:shadow-[0_16px_48px_rgba(0,0,0,0.1)] sm:p-10">
      <div className="flex items-start justify-between">
        <div className={`flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br ${s.gradient} text-white`}>
          <Icon className="size-8" strokeWidth={1.75} />
        </div>
        {s.soon && (
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-500">준비 중</span>
        )}
      </div>
      <h4 className="mt-8 text-2xl font-bold sm:text-3xl">{s.title}</h4>
      <p className="mt-5 text-lg leading-relaxed text-neutral-600">
        {s.lines.map((l) => (
          <span key={l} className="block">
            {l}
          </span>
        ))}
      </p>
      <ul className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-base font-semibold text-indigo-600 sm:gap-x-0">
        {s.tags.map((t, i) => (
          <li key={t.label} className="flex items-center">
            {i > 0 && <span className="mx-3 hidden h-4 w-px bg-neutral-300 sm:block" aria-hidden />}
            {t.href ? (
              <Link href={t.href} className="hover:underline">
                {t.label}
              </Link>
            ) : (
              <span className={s.soon ? "text-neutral-400" : ""}>{t.label}</span>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-auto flex justify-end pt-10">
        {s.href ? (
          <Link
            href={s.href}
            className="inline-flex items-center gap-2 rounded-full bg-neutral-100 px-7 py-4 font-semibold transition-colors hover:bg-neutral-900 hover:text-white"
          >
            {s.cta} <ArrowUpRight className="size-5" />
          </Link>
        ) : (
          <span className="inline-flex cursor-not-allowed items-center gap-2 rounded-full bg-neutral-100 px-7 py-4 font-semibold text-neutral-400">
            {s.cta}
          </span>
        )}
      </div>
    </article>
  );
}
