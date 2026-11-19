"use client";
// 3단계: 담당자 확인·수정 화면.
// 지금은 샘플 데이터(samples.withIssues 등)로 동작한다. 파서 연결 단계에서 store의 결과로 바꾼다.
import Link from "next/link";
import { useState } from "react";
import { samples, type SampleName } from "@/lib/samples";
import {
  addLog,
  initialReviewState,
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
} from "@/types/payroll";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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

const SAMPLE_LABELS: Record<SampleName, string> = {
  withIssues: "카페소라결 (오류 포함)",
  normal: "새하얀결세탁소 (정상)",
  large: "책여울스터디카페 (12명)",
};

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

export function ReviewClient() {
  const state = useReviewState();
  if (!state) {
    return <p className="text-muted-foreground">불러오는 중…</p>;
  }
  return <ReviewScreen state={state} />;
}

function ReviewScreen({ state }: { state: ReviewState }) {
  const { sampleName, batch, history, totalsBefore } = state;
  const confirmed = new Set(state.confirmed);
  const selected = batch.employees.find((e) => e.id === state.selectedId) ?? batch.employees[0];
  const all = [...batch.issues, ...batch.employees.flatMap((e) => e.issues)];
  const errorCount = count(all, "error");
  const editsOf = (e: EmployeePay) =>
    [...e.earnings, ...e.deductions].filter((i) => i.edited).length + Object.keys(totalsBefore[e.id] ?? {}).length;
  const editedCount = batch.employees.reduce((n, e) => n + editsOf(e), 0);

  function loadSample(name: SampleName) {
    if (history.length > 0 && !window.confirm("지금까지 고친 내용과 수정 기록이 모두 지워져요. 계속할까요?")) return;
    updateReview(() => initialReviewState(name));
  }

  /** 직원 한 명을 고치고, 다시 검산하고, 수정 기록을 남긴다 */
  function updateEmployee(
    id: string,
    fn: (e: EmployeePay) => { next: EmployeePay; touched?: string },
    log: Omit<EditLog, "at" | "employeeId" | "employeeName">,
    extra?: (s: ReviewState) => Partial<ReviewState>,
  ) {
    updateReview((s) => {
      const target = s.batch.employees.find((e) => e.id === id);
      if (!target) return s;
      const employees = s.batch.employees.map((e) => {
        if (e.id !== id) return e;
        const { next, touched } = fn(clone(e));
        return { ...next, issues: recheck(next, touched) };
      });
      return {
        ...s,
        ...extra?.(s),
        batch: { ...s.batch, employees },
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
        if (amount === original) delete it.edited;
        else it.edited = { before: original, by: "user" };
        return { next: e, touched: `${group}.${idx}` };
      },
      { field: `${group}.${idx}`, kind: "amount", label: item.label, before: item.amount, after: amount },
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
    updateReview((s) => ({
      ...s,
      batch: {
        ...s.batch,
        payDate: v || undefined,
        issues: v ? s.batch.issues.filter((i) => i.code !== "NO_PAY_DATE") : clone(samples[s.sampleName]).issues,
      },
      history: addLog(s.history, { field: "payDate", kind: "payDate", label: "지급일", before: s.batch.payDate ?? null, after: v || null }),
    }));
  }

  function setSelectedId(id: string) {
    updateReview((s) => ({ ...s, selectedId: id }));
  }

  function toggleConfirmed(id: string) {
    updateReview((s) => ({
      ...s,
      confirmed: s.confirmed.includes(id) ? s.confirmed.filter((c) => c !== id) : [...s.confirmed, id],
    }));
  }

  if (!selected) {
    return <p className="text-muted-foreground">직원 데이터가 없어요.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 샘플 고르기 */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">샘플 데이터</span>
        {(Object.keys(samples) as SampleName[]).map((n) => (
          <Button key={n} size="sm" variant={n === sampleName ? "default" : "outline"} onClick={() => loadSample(n)}>
            {SAMPLE_LABELS[n]}
          </Button>
        ))}
        {history.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => loadSample(sampleName)}>
            처음 상태로 되돌리기
          </Button>
        )}
      </div>

      {/* 파일 요약 */}
      <Card>
        <CardHeader>
          <CardDescription>
            {batch.sourceFile} · 귀속 {batch.payPeriod} · 원본 단위 {batch.unit}
          </CardDescription>
          <CardTitle className="text-xl">{batch.companyName}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <span>
              직원 <b>{batch.employees.length}</b>명
            </span>
            <span>
              확인 완료 <b>{confirmed.size}</b>/{batch.employees.length}
            </span>
            <span className="text-red-600 dark:text-red-400">
              오류 <b>{errorCount}</b>
            </span>
            <span className="text-amber-600 dark:text-amber-400">
              확인 필요 <b>{count(all, "warning")}</b>
            </span>
            <span className={EDITED_TEXT}>
              고친 칸 <b>{editedCount}</b>
            </span>
          </div>
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="w-14 text-muted-foreground">지급일</span>
            <input
              type="date"
              value={batch.payDate ?? ""}
              onChange={(e) => setPayDate(e.target.value)}
              className={`rounded-md border px-2 py-1 ${batch.issues.some((i) => i.field === "payDate") ? LEVEL_STYLE.warning.cell : ""}`}
            />
          </label>
          {batch.issues.length > 0 && <IssueList issues={batch.issues} />}
          {history.length > 0 && (
            <details className="text-sm">
              <summary className={`cursor-pointer ${EDITED_TEXT}`}>수정 기록 전체 보기 ({history.length}건)</summary>
              <div className="mt-2">
                <HistoryList history={history} showEmployee />
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* 직원 목록 */}
        <nav aria-label="직원 목록" className="flex flex-col gap-1">
          {batch.employees.map((e) => {
            const lv = worst(e.issues);
            const active = e.id === selected.id;
            return (
              <button
                key={e.id}
                onClick={() => setSelectedId(e.id)}
                className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  active ? "border-foreground bg-muted" : "hover:bg-muted"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className={`size-2 shrink-0 rounded-full ${lv ? LEVEL_STYLE[lv].dot : "bg-transparent"}`}
                  />
                  <span className="truncate font-medium">{e.name}</span>
                  {e.employmentType && <span className="text-xs text-muted-foreground">{e.employmentType}</span>}
                  {editsOf(e) > 0 && <EditedTag>수정 {editsOf(e)}</EditedTag>}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums text-muted-foreground">{won(e.netPay)}</span>
                  {confirmed.has(e.id) && <span aria-label="확인 완료">✓</span>}
                </span>
              </button>
            );
          })}
        </nav>

        {/* 선택한 직원 */}
        <EmployeeDetail
          key={selected.id}
          e={selected}
          sourceFile={batch.sourceFile}
          totalsBefore={totalsBefore[selected.id] ?? {}}
          history={history.filter((h) => h.employeeId === selected.id)}
          isConfirmed={confirmed.has(selected.id)}
          onAmount={setItemAmount}
          onCategory={setItemCategory}
          onTotal={setTotal}
          onToggleConfirmed={() => toggleConfirmed(selected.id)}
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
        <p className="text-sm text-muted-foreground">
          {errorCount > 0 ? `오류 ${errorCount}개를 먼저 고쳐 주세요.` : "오류가 없어요. 명세서를 만들 수 있어요."}
        </p>
        {errorCount > 0 ? (
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

// ---------- 직원 상세 ----------

type DetailProps = {
  e: EmployeePay;
  sourceFile: string;
  totalsBefore: Partial<Record<TotalField, number>>;
  /** 이 직원의 수정 기록 */
  history: EditLog[];
  isConfirmed: boolean;
  onAmount: (group: ItemGroup, idx: number, amount: number) => void;
  onCategory: (group: ItemGroup, idx: number, category: PayCategory) => void;
  onTotal: (field: TotalField, value: number) => void;
  onToggleConfirmed: () => void;
};

function EmployeeDetail({ e, sourceFile, totalsBefore, history, isConfirmed, onAmount, onCategory, onTotal, onToggleConfirmed }: DetailProps) {
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

        <div className="grid gap-5 md:grid-cols-2">
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
  onCategory: (group: ItemGroup, idx: number, category: PayCategory) => void;
};

function ItemTable({ title, group, items, issues, categories, focusField, onFocus, editedAt, onAmount, onCategory }: ItemTableProps) {
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
                    {it.edited && <EditedTag />}
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
                  {it.edited && (
                    <div className={`text-xs ${EDITED_TEXT}`}>
                      원래 <s>{won(it.edited.before)}</s>
                      {editedAt(field) && <> · {fmtTime(editedAt(field)!)}</>}
                    </div>
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
      className={`w-full min-w-0 rounded border border-transparent bg-transparent px-1 text-right tabular-nums hover:border-border focus:border-ring focus:outline-none ${className}`}
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
