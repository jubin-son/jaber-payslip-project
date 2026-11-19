"use client";
// 3단계 확인·수정 화면의 상태 저장소.
// 2단계(정리 결과, src/lib/store.ts)를 복사해 와서 고치고, 고친 내용과 수정 기록을 브라우저 탭(sessionStorage)에 둔다.
// 다른 페이지에 갔다 오거나 새로고침해도 남고, 탭을 닫으면 사라진다. (4단계 명세서 화면도 여기서 고친 값을 읽어 갈 수 있다)
// 새 파일을 올려 정리 결과가 바뀌면(signature가 달라지면) 새로 시작한다.
import { useSyncExternalStore } from "react";
import type { ParseResult } from "@/lib/parser/extract";
import type { PayrollBatch } from "@/types/payroll";

export type TotalField = "totalEarnings" | "totalDeductions" | "netPay";

/** 수정 기록 한 줄. 스키마(payroll.ts)는 바꾸지 않고 화면 쪽에서만 따로 남긴다 */
export type EditLog = {
  /** 고친 시각 (ISO) */
  at: string;
  /** 없으면 파일(사업장) 단위 수정 (지급일) */
  employeeId?: string;
  /** 직원 이름. 파일 단위 수정이면 사업장 이름 */
  employeeName?: string;
  /** "earnings.0", "netPay", "payDate" */
  field: string;
  kind: "amount" | "category" | "total" | "payDate";
  /** 화면에 보여줄 이름 "기본급", "지급합계" */
  label: string;
  before: string | number | null;
  after: string | number | null;
};

export type ReviewState = {
  /** 이 상태가 어떤 정리 결과에서 나왔는지 (다른 파일을 올리면 달라진다) */
  signature: string;
  /** 고치는 중인 사본. 2단계 정리 결과 원본은 건드리지 않는다 */
  batches: PayrollBatch[];
  activeBatch: number;
  selectedId: string;
  /** 확인 완료한 직원 id (직원 id는 batch마다 겹치지 않는다) */
  confirmed: string[];
  /** 합계 칸을 고친 경우 원래 값 (스키마의 edited는 항목에만 있어서 여기 둔다) */
  totalsBefore: Record<string, Partial<Record<TotalField, number>>>;
  history: EditLog[];
};

const KEY = "jaber.review.v2";
let cache: ReviewState | null | undefined;
const listeners = new Set<() => void>();

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** 정리 결과가 같은지 알아보는 표식 */
export function signatureOf(r: ParseResult): string {
  return r.batches
    .map((b) => `${b.id}|${b.sourceFile}|${b.companyName}|${b.payPeriod}|${b.employees.length}|${b.employees.reduce((n, e) => n + e.netPay, 0)}`)
    .join("//");
}

export function initialReviewState(r: ParseResult): ReviewState {
  const batches = clone(r.batches);
  return {
    signature: signatureOf(r),
    batches,
    activeBatch: 0,
    selectedId: batches[0]?.employees[0]?.id ?? "",
    confirmed: [],
    totalsBefore: {},
    history: [],
  };
}

function read(): ReviewState | null {
  if (cache !== undefined) return cache;
  try {
    const raw = sessionStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as ReviewState) : null;
  } catch {
    cache = null;
  }
  return cache;
}

function commit(next: ReviewState | null) {
  cache = next;
  try {
    if (next) sessionStorage.setItem(KEY, JSON.stringify(next));
    else sessionStorage.removeItem(KEY);
  } catch {
    // 저장이 안 돼도 이 페이지 안에서는 cache로 동작한다
  }
  listeners.forEach((l) => l());
}

/** 정리 결과로 처음부터 다시 시작 (새 파일을 올렸을 때, '처음 상태로 되돌리기') */
export function resetReview(r: ParseResult) {
  commit(initialReviewState(r));
}

export function updateReview(fn: (s: ReviewState) => ReviewState) {
  const cur = read();
  if (cur) commit(fn(cur));
}

/** 서버에서 그릴 때는 null (저장된 값은 브라우저에만 있으므로) */
export function useReviewState(): ReviewState | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => null,
  );
}

/**
 * 수정 기록 추가. 같은 칸을 이어서 고치면(숫자를 한 글자씩 입력하는 경우 등) 한 줄로 합친다.
 * 원래 값으로 되돌리면 그 줄은 지운다.
 */
export function addLog(history: EditLog[], entry: Omit<EditLog, "at">): EditLog[] {
  const at = new Date().toISOString();
  const last = history[history.length - 1];
  if (
    last &&
    last.employeeId === entry.employeeId &&
    last.employeeName === entry.employeeName &&
    last.field === entry.field &&
    last.kind === entry.kind
  ) {
    const merged: EditLog = { ...last, after: entry.after, at };
    const rest = history.slice(0, -1);
    return merged.after === merged.before ? rest : [...rest, merged];
  }
  if (entry.before === entry.after) return history;
  return [...history, { ...entry, at }];
}
