"use client";
// 2단계(화면 기준): 급여명세서 확인·수정 화면.
// 업로드에서 '명세서 변환하기'로 정리한 결과(src/lib/store.ts)를 읽어 보여준다. 올린 파일이 없으면 안내만 보여준다.
// 구성: 맨 위 숫자 오류 의심 안내 · 왼쪽 직원 목록 · 가운데 명세서에 들어갈 내용(수정) · 오른쪽 명세서 미리보기(바로 반영)
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useParseResult } from "@/lib/store";
import type { ParseResult } from "@/lib/parser/extract";
import {
  addLog,
  resetReview,
  signatureOf,
  updateReview,
  useReviewState,
  type EditLog,
  type ReviewState,
  type TotalField,
} from "./review-store";
import { checkEmployee } from "@/lib/parser/checks";
import {
  DEDUCTION_CATEGORIES,
  EARNING_CATEGORIES,
  type EmployeePay,
  type Issue,
  type PayCategory,
  type PayItem,
  type PayrollBatch,
} from "@/types/payroll";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PayslipCard } from "@/app/payslips/payslip-card";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

// ---------- 작은 도우미 ----------

const won = (n: number) => n.toLocaleString("ko-KR");
const sum = (xs: PayItem[]) => xs.reduce((a, b) => a + b.amount, 0);
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** "11. 19. 14:32" */
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const fmtValue = (v: EditLog["before"]) => (v === null || v === "" ? "없음" : typeof v === "number" ? `${won(v)}원` : v);

/** 그 칸을 마지막으로 고친 시각 */
function lastEditAt(history: EditLog[], employeeId: string, field: string): string | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h.employeeId === employeeId && h.field === field && h.kind !== "category") return h.at;
  }
  return undefined;
}

type ItemGroup = "earnings" | "deductions";

/** 담당자가 직접 추가한 항목 표시. 스키마를 바꾸지 않으려고 source.text에 표시를 남긴다 */
const ADDED_MARK = "담당자가 추가";
const isAdded = (it: PayItem) => it.source?.text === ADDED_MARK;

/** 검산으로 다시 만드는 issue. 나머지(매칭·수신동의·분류 등)는 그대로 둔다 */
const RECHECK_CODES: Issue["code"][] = ["SUM_MISMATCH", "NET_MISMATCH", "RATE_OUT_OF_RANGE"];
/** 담당자가 그 칸을 직접 고치면 "확인했다"고 보고 지우는 issue */
const CLEARED_BY_EDIT: Issue["code"][] = ["UNKNOWN_ITEM", "LOW_CONFIDENCE"];

function recheck(e: EmployeePay, touchedField?: string): Issue[] {
  const kept = e.issues.filter(
    (i) => !RECHECK_CODES.includes(i.code) && !(touchedField && i.field === touchedField && CLEARED_BY_EDIT.includes(i.code)),
  );
  const fresh = checkEmployee(e, { hasTotalEarnings: true, hasTotalDeductions: true, hasNet: true });
  return [...fresh, ...kept];
}

const LEVEL_ORDER: Issue["level"][] = ["error", "warning", "info"];
const LEVEL_TEXT: Record<Issue["level"], string> = { error: "오류", warning: "확인 필요", info: "참고" };

const LEVEL_STYLE: Record<Issue["level"], { cell: string; box: string; dot: string }> = {
  error: {
    cell: "bg-red-50 ring-1 ring-inset ring-red-300 dark:bg-red-950/40 dark:ring-red-800",
    box: "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
    dot: "bg-red-500",
  },
  warning: {
    cell: "bg-amber-50 ring-1 ring-inset ring-amber-300 dark:bg-amber-950/40 dark:ring-amber-800",
    box: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
    dot: "bg-amber-500",
  },
  info: {
    cell: "bg-sky-50 ring-1 ring-inset ring-sky-200 dark:bg-sky-950/40 dark:ring-sky-800",
    box: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200",
    dot: "bg-sky-500",
  },
};

/** 담당자가 고친 칸: 오류·경고·참고 색과 겹치지 않게 보라색 */
const EDITED_TEXT = "text-violet-700 dark:text-violet-300";

function EditedTag({ children = "수정" }: { children?: React.ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded bg-violet-100 px-1.5 text-[11px] font-medium leading-4 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
      {children}
    </span>
  );
}

function worst(issues: Issue[]): Issue["level"] | null {
  return LEVEL_ORDER.find((l) => issues.some((i) => i.level === l)) ?? null;
}

function issuesAt(issues: Issue[], field: string) {
  return issues.filter((i) => i.field === field || i.field?.startsWith(field + "."));
}

function count(issues: Issue[], level: Issue["level"]) {
  return issues.filter((i) => i.level === level).length;
}

// ---------- 화면 ----------

/** 브라우저에서 화면이 준비됐는지. 저장된 값은 브라우저에만 있어서, 준비되기 전에 "파일 없음"을 보여주면 깜빡인다 */
function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function ReviewClient() {
  const hydrated = useHydrated();
  const result = useParseResult();
  const state = useReviewState();
  const sig = result ? signatureOf(result) : null;

  // 새 파일을 올려 정리 결과가 바뀌면 이 화면의 상태도 새로 시작한다
  useEffect(() => {
    if (result && sig !== null && state?.signature !== sig) resetReview(result);
  }, [result, sig, state?.signature]);

  if (!hydrated) return <p className="text-muted-foreground">불러오는 중…</p>;
  if (!result) return <EmptyState />;
  if (!state || state.signature !== sig) return <p className="text-muted-foreground">불러오는 중…</p>;
  return <ReviewScreen state={state} result={result} />;
}

/** 올린 파일이 없을 때: 아무 데이터도 보여주지 않고 1단계로 안내 */
function EmptyState() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>아직 확인할 파일이 없어요</CardTitle>
        <CardDescription>급여대장을 올리고 &lsquo;명세서 변환하기&rsquo;를 누르면, 여기서 직원별 명세서 내용을 확인하고 고칠 수 있어요.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <Link href="/upload">파일 올리러 가기</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function ReviewScreen({ state, result }: { state: ReviewState; result: ParseResult }) {
  const { batches, history, totalsBefore } = state;
  const batch: PayrollBatch = batches[state.activeBatch] ?? batches[0];
  const confirmed = new Set(state.confirmed);
  const selected = batch?.employees.find((e) => e.id === state.selectedId) ?? batch?.employees[0];
  /** 파일 전체(모든 사업장·귀속월)의 오류. 다음 단계로 가려면 0이어야 한다 */
  const totalErrors = batches.reduce(
    (n, b) => n + count([...b.issues, ...b.employees.flatMap((e) => e.issues)], "error"),
    0,
  );
  const editsOf = (e: EmployeePay) =>
    [...e.earnings, ...e.deductions].filter((i) => i.edited).length + Object.keys(totalsBefore[e.id] ?? {}).length;

  /** 한꺼번에 확인 완료할 수 있는 직원: 오류도 확인 필요도 없는 사람만. 문제가 있는 직원은 직접 보고 확인한다 */
  const clean = (e: EmployeePay) => !e.issues.some((i) => i.level === "error" || i.level === "warning");
  const everyone = batches.flatMap((b) => b.employees);
  const bulkTargets = everyone.filter((e) => !confirmed.has(e.id) && clean(e));
  const confirmedAll = everyone.filter((e) => confirmed.has(e.id)).length;

  function confirmAllClean() {
    const ids = bulkTargets.map((e) => e.id);
    updateReview((s) => ({ ...s, confirmed: [...new Set([...s.confirmed, ...ids])] }));
  }


  function resetAll() {
    if (history.length > 0 && !window.confirm("지금까지 고친 내용과 수정 기록이 모두 지워져요. 계속할까요?")) return;
    resetReview(result);
  }

  /** 왼쪽 목록에서 직원 고르기 (다른 사업장 직원이면 그 사업장으로 바꾼다) */
  function selectEmployee(batchIndex: number, id: string) {
    updateReview((s) => ({ ...s, activeBatch: batchIndex, selectedId: id }));
  }

  /** 직원 한 명을 고치고, 다시 검산하고, 수정 기록을 남긴다 */
  function updateEmployee(
    id: string,
    fn: (e: EmployeePay) => { next: EmployeePay; touched?: string },
    log: Omit<EditLog, "at" | "employeeId" | "employeeName">,
    extra?: (s: ReviewState) => Partial<ReviewState>,
  ) {
    updateReview((s) => {
      const target = s.batches.flatMap((b) => b.employees).find((e) => e.id === id);
      if (!target) return s;
      const nextBatches = s.batches.map((b) => ({
        ...b,
        employees: b.employees.map((e) => {
          if (e.id !== id) return e;
          const { next, touched } = fn(clone(e));
          return { ...next, issues: recheck(next, touched) };
        }),
      }));
      return {
        ...s,
        ...extra?.(s),
        batches: nextBatches,
        // 값을 고치면 "확인 완료"는 다시 풀어 둔다
        confirmed: s.confirmed.filter((c) => c !== id),
        history: addLog(s.history, { ...log, employeeId: id, employeeName: target.name }),
      };
    });
  }

  function setItemAmount(group: ItemGroup, idx: number, amount: number) {
    const item = selected[group][idx];
    updateEmployee(
      selected.id,
      (e) => {
        const it = e[group][idx];
        const original = it.edited ? it.edited.before : it.amount;
        it.amount = amount;
        if (amount === original && !isAdded(it)) delete it.edited;
        else it.edited = { before: original, by: "user" };
        return { next: e, touched: `${group}.${idx}` };
      },
      { field: `${group}.${idx}`, kind: "amount", label: item.label, before: item.amount, after: amount },
    );
  }

  /** 빠진 항목을 직접 추가한다. 항상 맨 끝에 붙여서 원래 항목의 위치(번호)는 그대로 둔다 */
  function addItem(group: ItemGroup, label: string, category: PayCategory, amount: number) {
    const idx = selected[group].length;
    updateEmployee(
      selected.id,
      (e) => {
        e[group].push({ label, category, amount, source: { text: ADDED_MARK }, edited: { before: 0, by: "user" } });
        return { next: e };
      },
      { field: `${group}.${idx}`, kind: "add", label: `${label} 항목 추가`, before: null, after: amount },
    );
  }

  /** 담당자가 추가한 항목만 지울 수 있다 (파일에서 읽은 항목은 지우지 않는다) */
  function removeItem(group: ItemGroup, idx: number) {
    const item = selected[group][idx];
    if (!item || !isAdded(item)) return;
    updateEmployee(
      selected.id,
      (e) => {
        e[group].splice(idx, 1);
        return { next: e };
      },
      { field: `${group}.${idx}`, kind: "remove", label: `${item.label} 항목 삭제`, before: item.amount, after: null },
    );
  }

  function setItemCategory(group: ItemGroup, idx: number, category: PayCategory) {
    const item = selected[group][idx];
    updateEmployee(
      selected.id,
      (e) => {
        e[group][idx].category = category;
        return { next: e, touched: `${group}.${idx}` };
      },
      { field: `${group}.${idx}`, kind: "category", label: `${item.label} 분류`, before: item.category, after: category },
    );
  }

  const TOTAL_LABEL: Record<TotalField, string> = { totalEarnings: "지급합계", totalDeductions: "공제합계", netPay: "실지급액" };

  function setTotal(field: TotalField, value: number) {
    const id = selected.id;
    const original = totalsBefore[id]?.[field] ?? selected[field];
    updateEmployee(
      id,
      (e) => {
        e[field] = value;
        return { next: e, touched: field };
      },
      { field, kind: "total", label: TOTAL_LABEL[field], before: selected[field], after: value },
      (s) => {
        const mine = { ...(s.totalsBefore[id] ?? {}) };
        if (value === original) delete mine[field];
        else mine[field] = original;
        return { totalsBefore: { ...s.totalsBefore, [id]: mine } };
      },
    );
  }

  function setPayDate(v: string) {
    updateReview((s) => {
      const cur = s.batches[s.activeBatch];
      if (!cur) return s;
      const original = result.batches[s.activeBatch]?.issues ?? [];
      const batches = s.batches.map((b, i) =>
        i !== s.activeBatch
          ? b
          : {
              ...b,
              payDate: v || undefined,
              // 지급일을 채우면 "지급일 없음" 경고를 지우고, 비우면 원래 경고를 되살린다
              issues: v ? b.issues.filter((x) => x.code !== "NO_PAY_DATE") : clone(original),
            },
      );
      return {
        ...s,
        batches,
        history: addLog(s.history, {
          employeeName: cur.companyName,
          field: "payDate",
          kind: "payDate",
          label: "지급일",
          before: cur.payDate ?? null,
          after: v || null,
        }),
      };
    });
  }


  function toggleConfirmed(id: string) {
    updateReview((s) => ({
      ...s,
      confirmed: s.confirmed.includes(id) ? s.confirmed.filter((c) => c !== id) : [...s.confirmed, id],
    }));
  }

  if (!batch || !selected) {
    return <p className="text-muted-foreground">직원 데이터가 없어요.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 맨 위: 이번 달 총 인건비 */}
      <TotalCostSummary batches={batches} />

      {/* 숫자 오류 의심 내역 */}
      <SuspectBanner batches={batches} onPick={selectEmployee} />

      <div className="grid items-start gap-5 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[240px_minmax(0,1fr)_420px]">
        {/* 왼쪽: 인식한 임직원 목록 */}
        <aside className="flex flex-col gap-3 lg:sticky lg:top-24">
          <div className="flex items-baseline justify-between px-1">
            <h2 className="font-bold">임직원 {everyone.length}명</h2>
            <span className="text-xs text-muted-foreground">
              확인 {confirmedAll}/{everyone.length}
            </span>
          </div>
          <nav aria-label="직원 목록" className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto rounded-3xl bg-white p-3 shadow-[0_4px_24px_rgba(0,0,0,0.05)] ring-1 ring-neutral-200/70">
            {batches.map((b, bi) => (
              <div key={b.id} className="flex flex-col gap-1">
                <p className="truncate px-2 pt-1 text-xs font-semibold text-muted-foreground" title={b.sourceFile}>
                  {b.companyName} · {b.payPeriod}
                </p>
                {b.employees.map((e) => {
                  const lv = worst(e.issues);
                  const active = e.id === selected.id;
                  return (
                    <button
                      key={e.id}
                      onClick={() => selectEmployee(bi, e.id)}
                      aria-current={active ? "true" : undefined}
                      className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                        active ? "bg-neutral-900 text-white" : "hover:bg-neutral-100"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span aria-hidden className={`size-2 shrink-0 rounded-full ${lv ? LEVEL_STYLE[lv].dot : "bg-transparent"}`} />
                        <span className="truncate font-medium">{e.name}</span>
                        {editsOf(e) > 0 && <EditedTag>수정</EditedTag>}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className={`text-xs tabular-nums ${active ? "text-neutral-300" : "text-muted-foreground"}`}>{won(e.netPay)}</span>
                        {confirmed.has(e.id) && <CheckCircle2 aria-label="확인 완료" className={`size-4 ${active ? "text-white" : "text-indigo-500"}`} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
          <Button variant="outline" size="sm" disabled={bulkTargets.length === 0} onClick={confirmAllClean}>
            문제 없는 직원 모두 확인{bulkTargets.length > 0 ? ` (${bulkTargets.length}명)` : ""}
          </Button>
        </aside>

        {/* 가운데: 명세서에 들어갈 내용 (수정) */}
        <section className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-white px-4 py-3 text-sm ring-1 ring-neutral-200/70">
            <span className="font-semibold">{batch.companyName}</span>
            <span className="text-muted-foreground">귀속 {batch.payPeriod}</span>
            <label className="flex items-center gap-2">
              <span className="text-muted-foreground">지급일</span>
              <input
                type="date"
                value={batch.payDate ?? ""}
                onChange={(e) => setPayDate(e.target.value)}
                className={`rounded-md border px-2 py-1 ${batch.issues.some((i) => i.field === "payDate") ? LEVEL_STYLE.warning.cell : ""}`}
              />
            </label>
            <span className="ml-auto truncate text-xs text-muted-foreground" title={batch.sourceFile}>
              {batch.sourceFile} · 원본 단위 {batch.unit}
            </span>
          </div>
          {batch.issues.length > 0 && <IssueList issues={batch.issues} />}

          <EmployeeDetail
            key={selected.id}
            e={selected}
            sourceFile={batch.sourceFile}
            totalsBefore={totalsBefore[selected.id] ?? {}}
            history={history.filter((h) => h.employeeId === selected.id)}
            isConfirmed={confirmed.has(selected.id)}
            onAmount={setItemAmount}
            onAdd={addItem}
            onRemove={removeItem}
            onCategory={setItemCategory}
            onTotal={setTotal}
            onToggleConfirmed={() => toggleConfirmed(selected.id)}
          />

          <div className="flex flex-wrap items-center gap-3 text-sm">
            {history.length > 0 && (
              <details className="flex-1">
                <summary className={`cursor-pointer ${EDITED_TEXT}`}>수정 기록 전체 보기 ({history.length}건)</summary>
                <div className="mt-2">
                  <HistoryList history={history} showEmployee />
                </div>
              </details>
            )}
            <Button size="sm" variant="ghost" className="ml-auto" disabled={history.length === 0} onClick={resetAll}>
              처음 상태로 되돌리기
            </Button>
          </div>
        </section>

        {/* 오른쪽: 명세서 미리보기 (가운데에서 고치면 바로 바뀐다) */}
        <aside className="flex min-w-0 flex-col gap-3 lg:col-span-2 xl:sticky xl:top-24 xl:col-span-1">
          <div className="flex items-baseline justify-between px-1">
            <h2 className="font-bold">명세서 미리보기</h2>
            <span className="text-xs text-muted-foreground">고치면 바로 바뀌어요</span>
          </div>
          <PayslipCard batch={batch} employee={selected} />
        </aside>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
        <p className="text-sm text-muted-foreground">
          {totalErrors > 0 ? `오류 ${totalErrors}개를 먼저 고쳐 주세요.` : "오류가 없어요. 명세서를 만들 수 있어요."}
        </p>
        {totalErrors > 0 ? (
          <Button disabled>다음: 명세서 만들기</Button>
        ) : (
          <Button asChild>
            <Link href="/payslips">다음: 명세서 만들기</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------- 총 인건비 ----------

/** 사업장·귀속월마다 이번 달 인건비가 얼마나 나가는지. 고친 값이 바로 반영된다 */
function TotalCostSummary({ batches }: { batches: PayrollBatch[] }) {
  const sumOf = (b: PayrollBatch, f: "totalEarnings" | "totalDeductions" | "netPay") => b.employees.reduce((n, e) => n + e[f], 0);
  const grand = batches.reduce((n, b) => n + sumOf(b, "totalEarnings"), 0);
  return (
    <section aria-label="총 인건비" className="rounded-2xl bg-white px-5 py-4 shadow-[0_4px_24px_rgba(0,0,0,0.05)] ring-1 ring-neutral-200/70">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-bold">이번 달 총 인건비</h2>
        {batches.length > 1 && (
          <p className="text-sm text-muted-foreground">
            전체 <b className="text-base text-foreground tabular-nums">{won(grand)}원</b>
          </p>
        )}
      </div>
      <ul className="mt-3 flex flex-col divide-y">
        {batches.map((b) => (
          <li key={b.id} className="grid grid-cols-2 items-baseline gap-x-4 gap-y-1 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_repeat(3,auto)] sm:gap-x-8">
            <span className="col-span-2 truncate font-medium sm:col-span-1">
              {b.companyName} · {b.payPeriod}
              <span className="ml-2 text-xs font-normal text-muted-foreground">{b.employees.length}명</span>
            </span>
            <span className="sm:text-right">
              <span className="block text-xs text-muted-foreground">총 인건비 (지급합계)</span>
              <b className="text-lg tabular-nums">{won(sumOf(b, "totalEarnings"))}원</b>
            </span>
            <span className="sm:text-right">
              <span className="block text-xs text-muted-foreground">공제합계</span>
              <span className="tabular-nums">{won(sumOf(b, "totalDeductions"))}원</span>
            </span>
            <span className="sm:text-right">
              <span className="block text-xs text-muted-foreground">직원 실지급액</span>
              <span className="tabular-nums">{won(sumOf(b, "netPay"))}원</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-muted-foreground">직원에게 지급하는 금액의 합이에요. 회사가 따로 내는 4대보험 사업주 부담분은 포함되지 않아요.</p>
    </section>
  );
}

// ---------- 숫자 오류 의심 안내 ----------

/** 금액이 맞지 않을 때 생기는 issue (매칭·수신동의·분류 안내는 가운데 직원 화면에서 보여준다) */
const NUMBER_CODES: Issue["code"][] = ["SUM_MISMATCH", "NET_MISMATCH", "RATE_OUT_OF_RANGE"];

function SuspectBanner({ batches, onPick }: { batches: PayrollBatch[]; onPick: (batchIndex: number, id: string) => void }) {
  const rows = batches.flatMap((b, bi) =>
    b.employees.flatMap((e) =>
      e.issues
        .filter((i) => NUMBER_CODES.includes(i.code) && i.level !== "info")
        .map((i, n) => ({ key: `${e.id}-${i.code}-${n}`, bi, e, b, i })),
    ),
  );
  if (rows.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-5 py-3 text-sm font-medium text-emerald-800">
        <CheckCircle2 className="size-4 shrink-0" />
        숫자 오류가 의심되는 내역이 없어요. 합계와 실지급액이 모두 맞아요.
      </div>
    );
  }
  return (
    <section aria-label="숫자 오류 의심 내역" className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-900">
      <h2 className="flex items-center gap-2 font-bold">
        <AlertTriangle className="size-4 shrink-0" />
        숫자 오류가 의심되는 내역 {rows.length}건
      </h2>
      <ul className="mt-2 flex flex-col gap-1">
        {rows.map(({ key, bi, e, b, i }) => (
          <li key={key}>
            <button
              type="button"
              onClick={() => onPick(bi, e.id)}
              className="flex w-full flex-wrap items-baseline gap-x-2 rounded-lg px-2 py-1 text-left hover:bg-red-100"
            >
              <span className="font-semibold">{e.name}</span>
              <span className="text-xs text-red-700/80">{b.companyName}</span>
              <span className="flex-1">{i.message}</span>
              <span className="text-xs underline underline-offset-2">확인하기</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------- 직원 상세 ----------

type DetailProps = {
  e: EmployeePay;
  sourceFile: string;
  totalsBefore: Partial<Record<TotalField, number>>;
  /** 이 직원의 수정 기록 */
  history: EditLog[];
  isConfirmed: boolean;
  onAmount: (group: ItemGroup, idx: number, amount: number) => void;
  onAdd: (group: ItemGroup, label: string, category: PayCategory, amount: number) => void;
  onRemove: (group: ItemGroup, idx: number) => void;
  onCategory: (group: ItemGroup, idx: number, category: PayCategory) => void;
  onTotal: (field: TotalField, value: number) => void;
  onToggleConfirmed: () => void;
};

function EmployeeDetail({ e, sourceFile, totalsBefore, history, isConfirmed, onAmount, onAdd, onRemove, onCategory, onTotal, onToggleConfirmed }: DetailProps) {
  const [focusField, setFocusField] = useState<string | null>(null);
  const hasError = e.issues.some((i) => i.level === "error");
  const focused = focusField ? sourceOf(e, focusField) : null;
  const editedAt = (field: string) => lastEditAt(history, e.id, field);

  return (
    <Card>
      <CardHeader>
        <CardDescription>
          {[e.employmentType, e.department, e.position].filter(Boolean).join(" · ") || "직원"}
          {e.workInfo?.workHours ? ` · ${e.workInfo.workHours}시간` : ""}
          {e.workInfo?.hourlyWage ? ` · 시급 ${won(e.workInfo.hourlyWage)}원` : ""}
        </CardDescription>
        <CardTitle className="flex flex-wrap items-center gap-2 text-xl">
          {e.name}
          <MatchBadge e={e} />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {e.issues.length > 0 && <IssueList issues={e.issues} onPick={setFocusField} />}

        <div className="grid gap-5 2xl:grid-cols-2">
          <ItemTable
            title="지급"
            group="earnings"
            items={e.earnings}
            issues={e.issues}
            categories={EARNING_CATEGORIES}
            focusField={focusField}
            onFocus={setFocusField}
            editedAt={editedAt}
            onAmount={onAmount}
            onAdd={onAdd}
            onRemove={onRemove}
            onCategory={onCategory}
          />
          <ItemTable
            title="공제"
            group="deductions"
            items={e.deductions}
            issues={e.issues}
            categories={DEDUCTION_CATEGORIES}
            focusField={focusField}
            onFocus={setFocusField}
            editedAt={editedAt}
            onAmount={onAmount}
            onAdd={onAdd}
            onRemove={onRemove}
            onCategory={onCategory}
          />
        </div>

        <div className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-3">
          <TotalCell label="지급합계" field="totalEarnings" e={e} calc={sum(e.earnings)} before={totalsBefore.totalEarnings} onTotal={onTotal} onFocus={setFocusField} editedAt={editedAt("totalEarnings")} />
          <TotalCell label="공제합계" field="totalDeductions" e={e} calc={sum(e.deductions)} before={totalsBefore.totalDeductions} onTotal={onTotal} onFocus={setFocusField} editedAt={editedAt("totalDeductions")} />
          <TotalCell label="실지급액" field="netPay" e={e} calc={e.totalEarnings - e.totalDeductions} before={totalsBefore.netPay} onTotal={onTotal} onFocus={setFocusField} editedAt={editedAt("netPay")} />
        </div>

        {focused && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm">
            <span className="text-muted-foreground">원본 위치 · </span>
            {sourceFile}
            {focused.sheet ? ` › ${focused.sheet}` : ""}
            {focused.cell ? ` › ${focused.cell} 칸` : ""}
            {focused.page ? ` › ${focused.page}쪽` : ""}
            {focused.text ? ` “${focused.text}”` : ""}
            {!focused.sheet && !focused.cell && !focused.page && " (원본 칸 정보 없음)"}
          </p>
        )}

        {history.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className={`text-sm font-medium ${EDITED_TEXT}`}>수정 기록 ({history.length}건)</h3>
            <HistoryList history={history} />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3">
          {hasError &&<span className="text-sm text-muted-foreground">오류를 고치면 확인 완료할 수 있어요</span>}
          <Button variant={isConfirmed ? "outline" : "default"} disabled={hasError && !isConfirmed} onClick={onToggleConfirmed}>
            {isConfirmed ? "확인 취소" : "이 직원 확인 완료"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function sourceOf(e: EmployeePay, field: string) {
  const [group, idx] = field.split(".");
  if ((group === "earnings" || group === "deductions") && idx !== undefined) {
    return e[group][Number(idx)]?.source ?? {};
  }
  return null; // 합계·매칭 등은 원본 칸 정보가 스키마에 없다
}

// ---------- 지급·공제 표 ----------

type ItemTableProps = {
  title: string;
  group: ItemGroup;
  items: PayItem[];
  issues: Issue[];
  categories: readonly PayCategory[];
  focusField: string | null;
  onFocus: (f: string) => void;
  editedAt: (field: string) => string | undefined;
  onAmount: (group: ItemGroup, idx: number, amount: number) => void;
  onAdd: (group: ItemGroup, label: string, category: PayCategory, amount: number) => void;
  onRemove: (group: ItemGroup, idx: number) => void;
  onCategory: (group: ItemGroup, idx: number, category: PayCategory) => void;
};

function ItemTable({ title, group, items, issues, categories, focusField, onFocus, editedAt, onAmount, onAdd, onRemove, onCategory }: ItemTableProps) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th className="pb-1 font-normal">원본 항목 / 표준 항목</th>
            <th className="pb-1 text-right font-normal">금액(원)</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => {
            const field = `${group}.${idx}`;
            const here = issuesAt(issues, field);
            const lv = worst(here);
            const isFocused = focusField === field;
            return (
              <tr key={field} className={`border-t ${lv ? LEVEL_STYLE[lv].cell : ""} ${isFocused ? "outline-2 outline-foreground" : ""}`}>
                <td className="py-1.5 pr-2 pl-1 align-top">
                  <div className="flex items-center gap-1">
                    <span>{it.label}</span>
                    {it.taxFree && <span className="text-xs text-muted-foreground">비과세</span>}
                    {it.edited && <EditedTag>{isAdded(it) ? "추가" : "수정"}</EditedTag>}
                    {it.source?.cell && (
                      <button
                        type="button"
                        onClick={() => onFocus(field)}
                        className="font-mono text-xs text-muted-foreground underline-offset-2 hover:underline"
                        title="원본 위치 보기"
                      >
                        {it.source.cell}
                      </button>
                    )}
                  </div>
                  <select
                    aria-label={`${it.label} 표준 항목`}
                    value={it.category}
                    onChange={(ev) => onCategory(group, idx, ev.target.value as PayCategory)}
                    className="mt-0.5 max-w-full rounded border-none bg-transparent p-0 text-xs text-muted-foreground"
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-1.5 pr-1 text-right align-top">
                  <AmountInput
                    value={it.amount}
                    label={it.label}
                    onFocus={() => onFocus(field)}
                    onChange={(n) => onAmount(group, idx, n)}
                    className={it.edited ? `font-semibold ${EDITED_TEXT}` : ""}
                  />
                  {it.edited && isAdded(it) ? (
                    <div className={`flex items-center justify-end gap-2 text-xs ${EDITED_TEXT}`}>
                      <span>직접 추가한 항목{editedAt(field) && <> · {fmtTime(editedAt(field)!)}</>}</span>
                      <button type="button" onClick={() => onRemove(group, idx)} className="underline underline-offset-2 hover:text-red-600">
                        삭제
                      </button>
                    </div>
                  ) : (
                    it.edited && (
                      <div className={`text-xs ${EDITED_TEXT}`}>
                        원래 <s>{won(it.edited.before)}</s>
                        {editedAt(field) && <> · {fmtTime(editedAt(field)!)}</>}
                      </div>
                    )
                  )}
                </td>
              </tr>
            );
          })}
          <tr className="border-t text-muted-foreground">
            <td className="py-1.5 pl-1">항목 합</td>
            <td className="py-1.5 pr-1 text-right tabular-nums">{won(sum(items))}</td>
          </tr>
        </tbody>
      </table>
      {adding ? (
        <AddItemForm
          categories={categories}
          onCancel={() => setAdding(false)}
          onSubmit={(label, category, amount) => {
            onAdd(group, label, category, amount);
            setAdding(false);
          }}
        />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="self-start text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground">
          + 빠진 항목 추가
        </button>
      )}
    </div>
  );
}

// ---------- 빠진 항목 추가 ----------

function AddItemForm({
  categories,
  onSubmit,
  onCancel,
}: {
  categories: readonly PayCategory[];
  onSubmit: (label: string, category: PayCategory, amount: number) => void;
  onCancel: () => void;
}) {
  const fallback = categories[categories.length - 1]; // 기타지급 / 기타공제
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<PayCategory>(fallback);
  const [amount, setAmount] = useState(0);
  const ok = label.trim().length > 0 && amount > 0;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-violet-200 bg-violet-50/50 p-2 text-sm dark:border-violet-900 dark:bg-violet-950/20">
      <input
        autoFocus
        aria-label="추가할 항목 이름"
        placeholder="항목 이름 (예: 명절상여)"
        value={label}
        onChange={(ev) => setLabel(ev.target.value)}
        className="rounded border bg-background px-2 py-1"
      />
      <div className="flex items-center gap-2">
        <select aria-label="추가할 항목의 표준 항목" value={category} onChange={(ev) => setCategory(ev.target.value as PayCategory)} className="min-w-0 flex-1 rounded border bg-background px-1 py-1 text-xs">
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div className="w-32">
          <input
            inputMode="numeric"
            aria-label="추가할 항목 금액"
            placeholder="금액(원)"
            value={amount ? won(amount) : ""}
            onChange={(ev) => {
              const digits = ev.target.value.replace(/[^\d]/g, "");
              setAmount(digits ? Number(digits) : 0);
            }}
            className="w-full min-w-0 rounded border bg-background px-2 py-1 text-right tabular-nums"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          취소
        </Button>
        <Button type="button" size="sm" disabled={!ok} onClick={() => onSubmit(label.trim(), category, amount)}>
          추가
        </Button>
      </div>
    </div>
  );
}

// ---------- 합계 칸 ----------

type TotalCellProps = {
  label: string;
  field: TotalField;
  e: EmployeePay;
  calc: number;
  before?: number;
  onTotal: (field: TotalField, value: number) => void;
  onFocus: (f: string) => void;
  editedAt?: string;
};

function TotalCell({ label, field, e, calc, before, onTotal, onFocus, editedAt }: TotalCellProps) {
  const lv = worst(issuesAt(e.issues, field));
  const diff = e[field] - calc;
  return (
    <div className={`flex flex-col gap-0.5 rounded-md p-2 ${lv ? LEVEL_STYLE[lv].cell : ""}`}>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        {label} (원본)
        {before !== undefined && <EditedTag />}
      </span>
      <AmountInput
        value={e[field]}
        label={label}
        onFocus={() => onFocus(field)}
        onChange={(n) => onTotal(field, n)}
        className={`text-base font-semibold ${before !== undefined ? EDITED_TEXT : ""}`}
      />
      {before !== undefined && (
        <span className={`text-right text-xs ${EDITED_TEXT}`}>
          원래 <s>{won(before)}</s>
          {editedAt && <> · {fmtTime(editedAt)}</>}
        </span>
      )}
      <span className="text-right text-xs text-muted-foreground">
        계산값 {won(calc)}
        {diff !== 0 && ` (${diff > 0 ? "+" : ""}${won(diff)})`}
      </span>
    </div>
  );
}

// ---------- 공통 조각 ----------

/** 수정 기록 목록 (최근 것부터) */
function HistoryList({ history, showEmployee = false }: { history: EditLog[]; showEmployee?: boolean }) {
  const rows = [...history].reverse();
  return (
    <ul className="flex flex-col divide-y rounded-md border text-sm">
      {rows.map((h, n) => (
        <li key={`${h.at}-${h.field}-${n}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-1.5">
          <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{fmtTime(h.at)}</span>
          {showEmployee && <span className="font-medium">{h.employeeName ?? "파일"}</span>}
          <span>{h.label}</span>
          <span className="ml-auto tabular-nums">
            <s className="text-muted-foreground">{fmtValue(h.before)}</s>
            {" → "}
            <b className={EDITED_TEXT}>{fmtValue(h.after)}</b>
          </span>
        </li>
      ))}
    </ul>
  );
}

function AmountInput({
  value,
  label,
  onChange,
  onFocus,
  className = "",
}: {
  value: number;
  label: string;
  onChange: (n: number) => void;
  onFocus?: () => void;
  className?: string;
}) {
  return (
    <input
      inputMode="numeric"
      aria-label={`${label} 금액`}
      value={won(value)}
      onFocus={onFocus}
      onChange={(ev) => {
        const digits = ev.target.value.replace(/[^\d]/g, "");
        onChange(digits ? Number(digits) : 0);
      }}
      className={`w-full min-w-0 cursor-text rounded border border-dashed border-neutral-300 bg-neutral-50 px-1.5 py-0.5 text-right tabular-nums hover:border-neutral-500 hover:bg-white focus:border-solid focus:border-ring focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 ${className}`}
    />
  );
}

function IssueList({ issues, onPick }: { issues: Issue[]; onPick?: (field: string) => void }) {
  const sorted = [...issues].sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level));
  return (
    <ul className="flex flex-col gap-1.5">
      {sorted.map((i, n) => (
        <li key={`${i.code}-${i.field}-${n}`} className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${LEVEL_STYLE[i.level].box}`}>
          <span className="shrink-0 font-medium">{LEVEL_TEXT[i.level]}</span>
          <span className="flex-1">{i.message}</span>
          {onPick && i.field && /^(earnings|deductions)\.\d+$|^(totalEarnings|totalDeductions|netPay)$/.test(i.field) && (
            <button type="button" className="shrink-0 text-xs underline underline-offset-2" onClick={() => onPick(i.field!)}>
              칸 보기
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function MatchBadge({ e }: { e: EmployeePay }) {
  const m = e.match;
  if (!m || m.status === "not_found") return <Badge variant="destructive">자버 직원 못 찾음</Badge>;
  if (m.status === "ambiguous") return <Badge variant="outline">후보 {m.candidates?.length ?? 0}명</Badge>;
  return (
    <>
      <Badge variant="secondary">자버 {m.memberId}</Badge>
      {m.kakaoConsent === false && <Badge variant="outline">알림톡 미동의</Badge>}
    </>
  );
}
