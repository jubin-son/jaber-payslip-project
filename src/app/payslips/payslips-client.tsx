"use client";
// 3단계: 명세서 변환 결과(직원별 목록 + 미리보기). 변환된 명세서는 급여명세서 관리(월별 기록)에 저장한다.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PayslipCard, statementContextOf, useStatementContext } from "./payslip-card";
import { rosterStore, settingsStore } from "@/lib/hr-store";
import { statementNotes, type StatementContext } from "@/lib/wage-statement";
import type { EmployeePay, PayrollBatch } from "@/types/payroll";
import { identityParts, periodText, useReviewed, won } from "./use-reviewed";
import { archiveBatches } from "@/lib/archive-store";

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

/** 사업장 규모 표시: 기본 관리 설정값인지, 급여대장 인원으로 추정했는지 */
function HeadcountInfo({ batch }: { batch: PayrollBatch }) {
  const ctx = useStatementContext(batch);
  return (
    <span>
      상시근로자 <b>{ctx.headcount === "5이상" ? "5명 이상" : "5명 미만"}</b>{" "}
      <span className="text-muted-foreground">
        {ctx.estimated ? `(급여대장 ${ctx.count}명으로 추정 · ` : "(기본 관리 설정 · "}
        <Link href="/settings" className="underline underline-offset-2">
          바꾸기
        </Link>
        )
      </span>
    </span>
  );
}

/** 발송 전에 담당자만 보는 임금명세서 기재 확인 메모. 직원 명세서에는 나가지 않는다 */
function StatementNotes({ employee, ctx }: { employee: EmployeePay; ctx: StatementContext }) {
  const notes = statementNotes(employee, ctx);
  if (notes.length === 0) return null;
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
      <h3 className="font-semibold">명세서 기재 확인 {notes.length}건</h3>
      <ul className="flex flex-col gap-1.5">
        {notes.map((n, i) => (
          <li key={i} className="flex gap-2">
            <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.level === "warning" ? "bg-amber-500" : "bg-sky-500"}`} />
            <span>
              <span className="font-medium">{n.level === "warning" ? "확인 필요" : "참고"} · </span>
              {n.message}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs opacity-80">근로형태·사업장 규모에 따라 임금명세서에 적을 내용을 점검한 메모예요. 금액은 바꾸지 않고, 발송도 막지 않아요.</p>
    </section>
  );
}

export function PayslipsClient() {
  const reviewed = useReviewed();
  // 변환된 명세서를 월별 기록에 저장한다 (같은 사업장·귀속월이면 최신 내용으로 덮어쓴다)
  const readyBatches = reviewed.status === "ready" ? reviewed.batches : null;
  const readyIssuable = reviewed.status === "ready" ? reviewed.issuable : null;
  useEffect(() => {
    if (readyBatches && readyIssuable) archiveBatches(readyBatches, readyIssuable);
  }, [readyBatches, readyIssuable]);
  const [batchIdx, setBatchIdx] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const settings = settingsStore.use();
  const roster = rosterStore.use();

  if (reviewed.status === "loading") return <p className="text-muted-foreground">불러오는 중…</p>;
  if (reviewed.status === "no-file") {
    return (
      <Guide
        title="아직 명세서를 만들 파일이 없어요"
        text="급여대장을 올려 명세서로 변환한 뒤 확인·수정 화면에서 확인하면 여기서 명세서가 만들어져요."
        href="/upload"
        button="파일 올리러 가기"
      />
    );
  }
  const { batches, issuable, errorCount } = reviewed;
  const batch = batches[batchIdx] ?? batches[0];
  if (!batch || batch.employees.length === 0) return <p className="text-muted-foreground">명세서를 만들 직원이 없어요.</p>;

  // 명세서는 오류가 없는 직원이면 따로 확인하지 않아도 만들어진다. 확인·수정 화면에서 고친 값은 그대로 반영된다
  const ready = batch.employees.filter((e) => issuable.has(e.id));
  const blocked = batch.employees.length - ready.length;
  const total = ready.reduce((n, e) => n + e.netPay, 0);

  const selected = ready.find((e) => e.id === selectedId) ?? ready[0] ?? null;
  const ctx = statementContextOf(settings, roster, batch);

  return (
    <div className="flex flex-col gap-6">
      {batches.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">사업장·귀속월</span>
          {batches.map((b, i) => (
            <Button key={b.id} size="sm" variant={b === batch ? "default" : "outline"} onClick={() => { setBatchIdx(i); setSelectedId(null); }}>
              {b.companyName} · {b.payPeriod}
            </Button>
          ))}
        </div>
      )}

      {ready.length === 0 && (
        <Guide
          title="명세서를 만들 수 있는 직원이 없어요"
          text={`${batch.companyName}의 직원 ${batch.employees.length}명 모두 오류가 남아 있어요. 확인·수정 화면에서 오류를 고치면 명세서가 만들어져요.`}
          href="/review"
          button="담당자 확인·수정으로 가기"
        />
      )}
      {ready.length > 0 && blocked > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {errorCount > 0 ? `확인·수정 화면에 아직 오류가 ${errorCount}개 남아 있어요. ` : ""}
          오류가 남은 직원 {blocked}명은 명세서가 만들어지지 않았어요. 
          <Link href="/review" className="font-medium underline underline-offset-2">
            확인·수정 화면으로 돌아가기
          </Link>
        </div>
      )}

      {selected && (
        <>
      <Card>
        <CardHeader>
          <CardDescription>{periodText(batch.payPeriod)} 급여명세서</CardDescription>
          <CardTitle className="text-xl">{batch.companyName}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span>
            명세서 <b>{ready.length}</b>장 <span className="text-muted-foreground">(직원 {batch.employees.length}명 중)</span>
          </span>
          <span>
            실지급액 합계 <b>{won(total)}</b>
          </span>
          <HeadcountInfo batch={batch} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <ul className="flex flex-col gap-2">
          {batch.employees.map((e) => {
            const active = e.id === selected.id;
            const ok = issuable.has(e.id);
            const hasError = e.issues.some((i) => i.level === "error");
            const noteCount = statementNotes(e, ctx.forEmployee(e)).filter((n) => n.level === "warning").length;
            return (
              <li key={e.id} className={`flex flex-col gap-2 rounded-lg border p-3 ${active ? "border-foreground bg-muted" : ""}`}>
                <button type="button" disabled={!ok} onClick={() => setSelectedId(e.id)} className="flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{e.name}</span>
                    {hasError && <Badge variant="destructive">오류</Badge>}
                    {noteCount > 0 && <Badge variant="outline" className="border-amber-300 text-amber-800">기재 확인 {noteCount}</Badge>}
                  </span>
                  <span className="shrink-0 tabular-nums">{won(e.netPay)}</span>
                </button>
                {identityParts(e).length > 0 && <p className="text-xs text-muted-foreground">{identityParts(e).join(" · ")}</p>}
                {ok ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/p/${e.id}?preview=1`}>
                        명세서 열기
                      </Link>
                    </Button>
                    {/* 새 탭에서 명세서를 열고 PDF 저장 창을 바로 띄운다 */}
                    <Button size="sm" variant="ghost" asChild>
                      <a href={`/p/${e.id}?preview=1&print=1`} target="_blank" rel="noreferrer">
                        PDF 저장
                      </a>
                    </Button>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">오류를 고치면 명세서가 만들어져요.</p>
                )}
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col gap-2">
          <SelectedPreview batch={batch} employee={selected} />
        </div>
      </div>

        </>
      )}

      <p className="text-xs text-muted-foreground">
        지금은 이 브라우저 탭 안에서만 링크가 열려요. 다른 기기에서도 열리게 하려면 저장소(Supabase) 연결이 필요해요.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <Button variant="outline" asChild>
          <Link href="/review">← 담당자 확인·수정</Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/records">급여명세서 관리</Link>
          </Button>
          <Button asChild>
            <Link href="/send">발송 관리로 →</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function SelectedPreview({ batch, employee }: { batch: PayrollBatch; employee: EmployeePay }) {
  const ctx = useStatementContext(batch);
  return (
    <>
      <StatementNotes employee={employee} ctx={ctx.forEmployee(employee)} />
      <p className="text-sm text-muted-foreground">미리보기 · 직원이 링크로 열면 이렇게 보여요</p>
      <PayslipCard batch={batch} employee={employee} />
    </>
  );
}
