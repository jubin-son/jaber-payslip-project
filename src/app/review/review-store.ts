"use client";
// 3단계 확인·수정 화면의 상태 저장소.
// 브라우저 탭 안(sessionStorage)에 두어서, 다른 페이지에 갔다 오거나 새로고침해도 고친 내용과 수정 기록이 남는다.
// 탭을 닫으면 사라진다. (4단계 명세서 화면도 여기서 고친 값을 읽어 갈 수 있다)
import { useSyncExternalStore } from "react";
import { samples, type SampleName } from "@/lib/samples";
import type { PayrollBatch } from "@/types/payroll";

export type TotalField = "totalEarnings" | "totalDeductions" | "netPay";

/** 수정 기록 한 줄. 스키마(payroll.ts)는 바꾸지 않고 화면 쪽에서만 따로 남긴다 */
export type EditLog = {
  /** 고친 시각 (ISO) */
  at: string;
  /** 없으면 파일 단위 수정 (지급일) */
  employeeId?: string;
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
  sampleName: SampleName;
  batch: PayrollBatch;
  selectedId: string;
  confirmed: string[];
  /** 합계 칸을 고친 경우 원래 값 (스키마의 edited는 항목에만 있어서 여기 둔다) */
  totalsBefore: Record<string, Partial<Record<TotalField, number>>>;
  history: EditLog[];
};

const KEY = "jaber.review.v1";
let cache: ReviewState | undefined;
const listeners = new Set<() => void>();

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export function initialReviewState(name: SampleName): ReviewState {
  const batch = clone(samples[name]);
  return { sampleName: name, batch, selectedId: batch.employees[0]?.id ?? "", confirmed: [], totalsBefore: {}, history: [] };
}

function read(): ReviewState {
  if (cache) return cache;
  try {
    const raw = sessionStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as ReviewState) : initialReviewState("withIssues");
  } catch {
    cache = initialReviewState("withIssues");
  }
  return cache;
}

export function updateReview(fn: (s: ReviewState) => ReviewState) {
  cache = fn(read());
  try {
    sessionStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // 저장이 안 돼도 이 페이지 안에서는 cache로 동작한다
  }
  listeners.forEach((l) => l());
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
  if (last && last.employeeId === entry.employeeId && last.field === entry.field && last.kind === entry.kind) {
    const merged: EditLog = { ...last, after: entry.after, at };
    const rest = history.slice(0, -1);
    return merged.after === merged.before ? rest : [...rest, merged];
  }
  if (entry.before === entry.after) return history;
  return [...history, { ...entry, at }];
}
