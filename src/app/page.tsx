import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/common/site-header";
import { LandingDropzone } from "./landing-dropzone";
import {
  ArrowRight,
  ArrowDown,
  Check,
  FileSpreadsheet,
  Lock,
  MessageCircle,
  SearchCheck,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";

// 첫 화면 원칙: 처음 온 사장님이 설명 없이 바로 '급여대장 올리기'를 누를 수 있게.
// 버튼은 업로드 하나(+파일이 없을 때 샘플 체험), 나머지는 왜 믿어도 되는지만 짧게 보여준다.

const trust = [
  { icon: FileSpreadsheet, text: "엑셀·CSV·PDF, 어떤 양식이든" },
  { icon: ShieldCheck, text: "4대보험·세금 자동 검산" },
  { icon: Lock, text: "파일은 내 브라우저에서만 읽어요" },
];

const steps = [
  { no: "1", icon: Upload, tone: "bg-[#A1FCCF]", title: "급여대장 올리기", desc: "세무사·노무사에게 받은 파일을 그대로 올려요" },
  { no: "2", icon: SearchCheck, tone: "bg-[#CEADF9]", title: "틀린 곳만 확인", desc: "숫자가 안 맞는 곳만 골라서 보여드려요" },
  { no: "3", icon: Send, tone: "bg-[#96AFF9]", title: "직원에게 발송", desc: "직원은 휴대폰 링크로 명세서를 바로 봐요" },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white text-[#111]">
      <SiteHeader />

      <main>
        {/* 첫 화면 */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[36rem] bg-[radial-gradient(50%_55%_at_50%_0%,rgba(117,251,162,0.22)_0%,rgba(255,255,255,0)_100%)]" />
          <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-12 text-center sm:px-6 sm:pt-20">
            <span className="landing-rise inline-flex items-center gap-1.5 rounded-full bg-[#F4F4F6] px-3 py-1 text-sm font-semibold text-[#111]">
              <Sparkles className="size-4" /> 소상공인 사장님을 위한 급여명세서
            </span>
            <h1 style={{ animationDelay: "80ms" }} className="landing-rise mx-auto mt-6 max-w-3xl text-[2.25rem] font-bold leading-[1.2] tracking-tight sm:text-6xl">
              급여대장 올리면
              <br />
              <span className="bg-[linear-gradient(transparent_58%,#ECFE75_58%,#ECFE75_92%,transparent_92%)] px-1">명세서 발송까지 끝</span>
            </h1>
            <p style={{ animationDelay: "160ms" }} className="landing-rise mx-auto mt-5 max-w-xl text-lg leading-relaxed text-[#4B5563]">
              세무사·노무사가 보낸 파일 그대로 올리세요.
              <br className="hidden sm:block" /> 직원별 명세서 만들고 보내는 건 자버가 할게요.
            </p>

            <div style={{ animationDelay: "240ms" }} className="landing-rise">
              <LandingDropzone />
            </div>

            <ul style={{ animationDelay: "320ms" }} className="landing-rise mx-auto mt-7 flex max-w-2xl flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-[#4B5563]">
              {trust.map(({ icon: Icon, text }) => (
                <li key={text} className="inline-flex items-center gap-1.5">
                  <Icon className="size-4 text-[#1FB866]" /> {text}
                </li>
              ))}
            </ul>

            <BeforeAfter />
          </div>
        </section>

        {/* 3단계 */}
        <section className="bg-[#F7F7F7] py-20">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">세 번만 누르면 돼요</h2>
            <ol className="relative mt-12 grid gap-4 sm:grid-cols-3 sm:gap-6">
              {/* 카드 사이를 잇는 점선 (넓은 화면에서만) */}
              <span aria-hidden className="absolute left-[16%] right-[16%] top-[3.25rem] hidden border-t-2 border-dashed border-neutral-300 sm:block" />
              {steps.map(({ no, icon: Icon, title, desc, tone }) => (
                <li key={no} className="relative rounded-3xl bg-white p-7 shadow-[0_8px_30px_rgba(0,0,0,0.05)]">
                  <div className="flex items-center justify-between">
                    <span className={`flex size-12 items-center justify-center rounded-2xl text-[#111] ${tone}`}>
                      <Icon className="size-6" />
                    </span>
                    <span className="text-sm font-bold text-neutral-400">STEP {no}</span>
                  </div>
                  <p className="mt-5 text-xl font-bold">{title}</p>
                  <p className="mt-2 leading-relaxed text-[#4B5563]">{desc}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 마무리 */}
        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-7 rounded-[2rem] bg-[#111] px-8 py-14 text-center text-white">
            <h2 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              이번 달 급여명세서,
              <br />
              <span className="text-[#75FBA2]">지금 바로 보내 보세요</span>
            </h2>
            <Link
              href="/upload"
              className="inline-flex items-center gap-2 rounded-full bg-[#ECFE75] px-9 py-4 text-lg font-semibold text-[#111] transition-colors hover:bg-[#DFF35A]"
            >
              <Upload className="size-5" /> 급여대장 올리기
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

/** 비포/애프터: 복잡한 급여대장 엑셀 → 직원 휴대폰에 도착한 명세서 */
function BeforeAfter() {
  const head = ["성명", "기본급", "식대", "국민연금", "건강보험", "고용보험", "차인지급액"];
  const body = [
    ["김자버", "2,300,000", "200,000", "109,250", "82,680", "20,700", "2,287,370"],
    ["이하늘", "2,156,880", "200,000", "104,890", "79,370", "22,590", "2,150,030"],
    ["박온유", "1,890,000", "200,000", "89,980", "68,080", "18,810", "1,913,130"],
    ["최다솜", "2,500,000", "200,000", "121,500", "91,940", "25,160", "2,461,400"],
  ];
  const rows = [
    ["기본급", "2,300,000"],
    ["식대", "200,000"],
    ["국민연금", "-109,250"],
    ["건강보험", "-82,680"],
    ["고용보험", "-20,700"],
  ];

  return (
    <div className="relative mx-auto mt-14 max-w-5xl overflow-hidden rounded-[2.5rem] bg-[linear-gradient(135deg,#4FE38E_0%,#75FBA2_45%,#C9FFE0_100%)] px-4 py-10 sm:px-10 sm:py-14">
      <span aria-hidden className="absolute -right-10 -top-10 size-40 rounded-full bg-[#ECFE75] sm:size-56" />
      <span aria-hidden className="absolute -bottom-12 -left-8 size-32 rounded-full bg-[#CEADF9]/70" />
    <div className="relative grid items-center gap-6 text-left lg:grid-cols-[1.25fr_auto_1fr]">
      {/* 비포 */}
      <figure style={{ animationDelay: "420ms" }} className="landing-rise min-w-0 rounded-2xl bg-white p-4 shadow-[0_16px_40px_rgba(0,0,0,0.08)]">
        <figcaption className="mb-3 flex items-center gap-2 text-sm font-semibold text-neutral-500">
          <FileSpreadsheet className="size-4 text-emerald-600" /> 급여대장_2026-11.xlsx
        </figcaption>
        <div className="overflow-x-auto rounded-lg ring-1 ring-neutral-200">
          <table className="w-full whitespace-nowrap text-[11px] tabular-nums sm:text-xs">
            <thead className="bg-neutral-100 text-neutral-500">
              <tr>
                {head.map((h) => (
                  <th key={h} className="border-r border-neutral-200 px-2 py-1.5 text-left font-medium last:border-r-0">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-neutral-600">
              {body.map((r) => (
                <tr key={r[0]} className={`border-t border-neutral-200 ${r[0] === "김자버" ? "bg-[#ECFE75] font-semibold text-[#111]" : ""}`}>
                  {r.map((c, i) => (
                    <td
                      key={i}
                      className={`border-r border-neutral-200 px-2 py-1.5 last:border-r-0 ${i === 0 ? "" : "text-right"} ${
                        r[0] === "김자버" && i === 0 ? "shadow-[inset_3px_0_0_rgb(17_17_17)]" : ""
                      }`}
                    >
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-neutral-400">직원 4명 · 한 줄이 한 사람의 명세서가 돼요</p>
      </figure>

      {/* 화살표 */}
      <div style={{ animationDelay: "620ms" }} className="landing-rise flex items-center justify-center gap-2 text-sm font-semibold text-[#111] lg:flex-col">
        <span className="landing-nudge flex size-12 items-center justify-center rounded-full bg-[#111] text-white shadow-lg shadow-black/20">
          <ArrowRight className="hidden size-6 lg:block" />
          <ArrowDown className="size-6 lg:hidden" />
        </span>
        AI가 정리
      </div>

      {/* 애프터: 직원 휴대폰 */}
      <figure style={{ animationDelay: "780ms" }} className="landing-rise relative mx-auto w-full max-w-[18rem]">
        <div className="rounded-[2.25rem] bg-[#111] p-2.5 shadow-[0_24px_60px_rgba(0,0,0,0.25)]">
          <div className="rounded-[1.8rem] bg-white px-5 pb-6 pt-7">
            <div className="mx-auto -mt-4 mb-4 h-1.5 w-16 rounded-full bg-neutral-200" />
            <p className="text-xs font-semibold text-[#1FB866]">2026년 11월 급여명세서</p>
            <p className="mt-0.5 text-lg font-bold">
              <span className="rounded-md bg-[#ECFE75] px-1 text-[#111]">김자버</span> 님
            </p>
            <dl className="mt-4 flex flex-col gap-2 text-sm">
              {rows.map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <dt className="text-neutral-500">{k}</dt>
                  <dd className={`font-medium tabular-nums ${v.startsWith("-") ? "text-neutral-500" : ""}`}>{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex items-baseline justify-between border-t border-neutral-100 pt-3">
              <span className="text-sm font-semibold">실지급액</span>
              <span className="text-xl font-bold tabular-nums">2,287,370원</span>
            </div>
          </div>
        </div>
        <div style={{ animationDelay: "1150ms" }} className="landing-pop absolute -left-4 -top-4 flex items-center gap-2 rounded-2xl bg-white px-3 py-2 shadow-[0_12px_32px_rgba(0,0,0,0.12)] sm:-left-10">
          <span className="flex size-7 items-center justify-center rounded-lg bg-amber-400 text-neutral-900">
            <MessageCircle className="size-4" strokeWidth={2.5} />
          </span>
          <span className="text-xs font-bold">명세서가 도착했어요</span>
        </div>
        <div style={{ animationDelay: "1350ms" }} className="landing-pop absolute -bottom-5 -right-3 flex items-center gap-2 rounded-2xl bg-white px-3 py-2 shadow-[0_12px_32px_rgba(0,0,0,0.12)] sm:-right-6">
          <span className="flex size-7 items-center justify-center rounded-lg bg-[#4FE38E] text-[#111]">
            <Check className="size-4" strokeWidth={3} />
          </span>
          <span className="text-xs font-bold">검산 완료</span>
        </div>
      </figure>
    </div>
    </div>
  );
}
