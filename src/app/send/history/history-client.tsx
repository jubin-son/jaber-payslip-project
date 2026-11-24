"use client";
// 발송 관리: 발송(시연) 기록과 열람 기록을 사업장·귀속월별로 모아 본다. 보내는 일은 급여명세서 > 4. 발송에서 한다.
// 기록은 send-store(sessionStorage)에 있어서 지금은 같은 브라우저 탭 안에서만 남는다.
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { periodText, useReviewed } from "@/app/payslips/use-reviewed";
import type { EmployeePay, PayrollBatch } from "@/types/payroll";
import { CHANNEL_LABEL, maskEmail, maskPhone, type Channel } from "../channels";
import { useSendState } from "../send-store";

const CHANNELS: Channel[] = ["kakao", "mail"];

/** "11. 19. 14:32" */
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

type Filter = "all" | "unopened" | "unsent";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "unopened", label: "미열람" },
  { value: "unsent", label: "아직 안 보냄" },
];

type Row = {
  batch: PayrollBatch;
  e: EmployeePay;
  sent: Partial<Record<Channel, string>>;
  firstSent?: string;
  opened?: string;
};

function Guide({ title, text, href, button }: { title: string; text: string; href: string; button: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{text}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <Link href={href}>{button}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function HistoryClient() {
  const reviewed = useReviewed();
  const sendState = useSendState();
  const [filter, setFilter] = useState<Filter>("all");

  if (reviewed.status === "loading") return <p className="text-muted-foreground">불러오는 중…</p>;
  if (reviewed.status !== "ready") {
    return (
      <Guide
        title="아직 보낸 명세서가 없어요"
        text="급여명세서에서 급여대장을 올리고 확인한 뒤 발송하면, 여기서 받은 사람과 열람 여부를 볼 수 있어요."
        href="/upload"
        button="급여명세서 만들러 가기"
      />
    );
  }

  const { batches, confirmed, signature } = reviewed;
  const same = sendState && sendState.signature === signature;
  const records = same ? sendState.records : {};
  const opens = same ? (sendState.opens ?? {}) : {};

  // 발송 대상(확인 완료한 직원)만 센다
  const rows: Row[] = batches.flatMap((batch) =>
    batch.employees
      .filter((e) => confirmed.has(e.id))
      .map((e) => {
        const sent: Row["sent"] = {};
        for (const c of CHANNELS) {
          const at = records[e.id]?.[c]?.at;
          if (at) sent[c] = at;
        }
        const times = Object.values(sent).sort();
        return { batch, e, sent, firstSent: times[0], opened: opens[e.id]?.at };
      }),
  );
  const sentRows = rows.filter((r) => r.firstSent);
  const openedRows = sentRows.filter((r) => r.opened);
  const shown = rows.filter((r) => (filter === "unopened" ? r.firstSent && !r.opened : filter === "unsent" ? !r.firstSent : true));
  const countOf = (f: Filter) => (f === "unopened" ? sentRows.length - openedRows.length : f === "unsent" ? rows.length - sentRows.length : rows.length);
  const rate = sentRows.length ? Math.round((openedRows.length / sentRows.length) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="발송 대상" value={`${rows.length}명`} sub={`${batches.length}개 사업장·귀속월`} />
        <Stat label="발송 완료" value={`${sentRows.length}명`} sub={`대상 중 ${rows.length - sentRows.length}명 남음`} />
        <Stat label="열람" value={`${openedRows.length}명`} sub={sentRows.length ? `열람률 ${rate}%` : "발송 후 표시돼요"} />
        <Stat label="미열람" value={`${sentRows.length - openedRows.length}명`} warn={sentRows.length - openedRows.length > 0} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">직원별 현황</CardTitle>
          <CardDescription>열람 시각은 직원이 명세서 링크를 처음 연 때예요. 담당자가 미리보기로 연 것은 세지 않아요.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div role="tablist" aria-label="현황 거르기" className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <Button key={f.value} role="tab" aria-selected={filter === f.value} size="sm" variant={filter === f.value ? "default" : "outline"} onClick={() => setFilter(f.value)}>
                {f.label} {countOf(f.value)}
              </Button>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-neutral-50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">사업장 · 귀속월</th>
                  <th className="px-3 py-2 font-medium">이름</th>
                  <th className="px-3 py-2 font-medium">받는 곳</th>
                  {CHANNELS.map((c) => (
                    <th key={c} className="px-3 py-2 font-medium">
                      {CHANNEL_LABEL[c]} 발송
                    </th>
                  ))}
                  <th className="px-3 py-2 font-medium">열람</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ batch, e, sent, firstSent, opened }) => (
                  <tr key={e.id} className="border-t">
                    <td className="px-3 py-2 text-muted-foreground">
                      {batch.companyName} · {periodText(batch.payPeriod)}
                    </td>
                    <td className="px-3 py-2 font-medium">{e.name}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {e.match?.status === "matched" ? `${maskPhone(e.match.phone)} · ${maskEmail(e.match.email)}` : "연락처 없음"}
                    </td>
                    {CHANNELS.map((c) => (
                      <td key={c} className="px-3 py-2 tabular-nums">
                        {sent[c] ? fmtTime(sent[c]!) : <span className="text-muted-foreground">-</span>}
                      </td>
                    ))}
                    <td className="px-3 py-2 whitespace-nowrap">
                      {opened ? (
                        <span className="text-emerald-700">✓ {fmtTime(opened)}</span>
                      ) : firstSent ? (
                        <span className="text-amber-700">미열람</span>
                      ) : (
                        <span className="text-muted-foreground">미발송</span>
                      )}
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                      해당하는 직원이 없어요.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-xs text-muted-foreground">시연이라 기록은 이 브라우저 탭 안에서만 남아요. 다른 기기의 열람까지 보려면 저장소(Supabase) 연결이 필요해요.</p>
        <Button asChild>
          <Link href="/send">급여명세서 발송하러 가기 →</Link>
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border bg-white px-4 py-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xl font-semibold tabular-nums ${warn ? "text-amber-700" : ""}`}>{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}
