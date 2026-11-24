"use client";
// 직원 한 명의 급여명세서 한 장. 목록 미리보기(/payslips)와 직원용 링크(/p/[id])가 같이 쓴다.
// 휴대폰·컴퓨터 모두에서 보이고, 인쇄·PDF로 저장할 때는 테두리와 그림자를 없앤다.
import type { EmployeePay, PayItem, PayrollBatch } from "@/types/payroll";
import { dateText, identityParts, periodText, won } from "./use-reviewed";
import { headcountOf, incomeTypeOfEmployee, rosterStore, settingsStore, type HrSettings } from "@/lib/hr-store";
import type { JaberEmployee } from "@/lib/jaber-db";
import { calcMethodOf, overtimeRuleText, resolveHeadcount, type StatementContext } from "@/lib/wage-statement";

/**
 * 명세서 기재 기준: 상시근로자 수(기본 관리)는 사업장 단위, 소득 구분(임직원 관리)은 직원 단위로 정한다.
 * forEmployee(e)로 직원 한 명의 기준을 얻는다.
 */
export type BatchStatementContext = {
  headcount: StatementContext["headcount"];
  estimated: boolean;
  count: number;
  forEmployee: (e: EmployeePay) => StatementContext;
};

export function useStatementContext(batch: PayrollBatch): BatchStatementContext {
  return statementContextOf(settingsStore.use(), rosterStore.use(), batch);
}

export function statementContextOf(settings: HrSettings | null, roster: JaberEmployee[] | null, batch: PayrollBatch): BatchStatementContext {
  const isBiz = (e: EmployeePay) => incomeTypeOfEmployee(roster, e) === "사업소득";
  const hc = resolveHeadcount(headcountOf(settings, batch.companyCode), batch, isBiz);
  return { headcount: hc.value, estimated: hc.estimated, count: hc.count, forEmployee: (e) => ({ headcount: hc.value, businessIncome: isBiz(e) }) };
}

function Rows({
  title,
  items,
  total,
  totalLabel,
  methodOf,
}: {
  title: string;
  items: PayItem[];
  total: number;
  totalLabel: string;
  /** 항목별 계산방법 (출근일수·시간에 따라 달라지는 항목만) */
  methodOf?: (it: PayItem) => string | undefined;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="flex flex-col divide-y rounded-lg border">
        {items.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">항목이 없어요</li>}
        {items.map((it, i) => (
          <li key={`${it.label}-${i}`} className="flex flex-col gap-0.5 px-3 py-2 text-sm sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
            <span className="flex flex-col">
              <span className="flex flex-wrap items-center gap-1.5">
                {it.label}
                {it.taxFree && <span className="rounded bg-muted px-1.5 text-[11px] leading-4 text-muted-foreground">비과세</span>}
              </span>
              {methodOf?.(it) && <span className="text-xs text-muted-foreground">{methodOf(it)}</span>}
            </span>
            <span className="tabular-nums sm:text-right">{won(it.amount)}</span>
          </li>
        ))}
        <li className="flex flex-col gap-0.5 bg-muted/50 px-3 py-2 text-sm font-medium sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
          <span>{totalLabel}</span>
          <span className="tabular-nums sm:text-right">{won(total)}</span>
        </li>
      </ul>
    </section>
  );
}

export function PayslipCard({ batch, employee: e }: { batch: PayrollBatch; employee: EmployeePay }) {
  const w = e.workInfo;
  const work = [
    w?.workDays ? `근무 ${w.workDays}일` : null,
    w?.workHours ? `근로 ${w.workHours}시간` : null,
    w?.overtimeHours ? `연장 ${w.overtimeHours}시간` : null,
    w?.hourlyWage ? `시급 ${won(w.hourlyWage)}` : null,
  ].filter(Boolean);

  const idInfo = identityParts(e); // 같은 이름 구분용 (사번·생년월일·입사일)
  // 임직원 관리에서 사업소득으로 정한 직원은 제목을 바꾼다
  const ctx = useStatementContext(batch).forEmployee(e);
  const docTitle = ctx.businessIncome ? "사업소득 지급명세서" : "급여명세서";
  const rule = overtimeRuleText(e, ctx);

  return (
    <article className="mx-auto flex w-full max-w-2xl flex-col gap-5 break-inside-avoid rounded-2xl border bg-background p-5 shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{batch.companyName}</p>
        <h2 className="text-xl font-semibold">{periodText(batch.payPeriod)} {docTitle}</h2>
        <p className="text-sm text-muted-foreground">지급일 {dateText(batch.payDate)}</p>
      </header>

      <div className="flex flex-col gap-0.5 border-t pt-4">
        <p className="text-sm">
          <span className="font-medium">{e.name}</span>
          {[e.department, e.position].filter(Boolean).length > 0 && (
            <span className="text-muted-foreground"> · {[e.department, e.position].filter(Boolean).join(" ")}</span>
          )}
        </p>
        {idInfo.length > 0 && <p className="text-xs text-muted-foreground">{idInfo.join(" · ")}</p>}
        {work.length > 0 && <p className="text-xs text-muted-foreground">{work.join(" · ")}</p>}
      </div>

      <div className="flex flex-col gap-1 rounded-xl bg-muted px-4 py-3">
        <span className="text-xs text-muted-foreground">실지급액</span>
        <span className="text-2xl font-semibold tabular-nums">{won(e.netPay)}</span>
      </div>

      {/* 지급은 왼쪽, 공제는 오른쪽 */}
      <div className="grid grid-cols-2 items-start gap-3 sm:gap-5">
        <Rows title="지급 내역" items={e.earnings} total={e.totalEarnings} totalLabel="지급 합계" methodOf={(it) => calcMethodOf(it, e, ctx)} />
        <Rows title="공제 내역" items={e.deductions} total={e.totalDeductions} totalLabel="공제 합계" />
      </div>

      {rule && <p className="text-xs text-muted-foreground">{rule}</p>}
      <p className="text-xs text-muted-foreground">문의는 급여 담당자에게 해 주세요.</p>
    </article>
  );
}
