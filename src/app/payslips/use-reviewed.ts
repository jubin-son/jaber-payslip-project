"use client";
// 4단계 화면(/payslips, /p/[id])이 쓰는 데이터 읽기.
// 3단계에서 담당자가 확인·수정한 결과(src/app/review/review-store.ts)를 읽는다.
// 지금은 같은 브라우저 탭(sessionStorage) 안에서만 읽을 수 있다. 다른 기기에서 열리게 하려면 저장소(Supabase)가 필요하다.
import { useSyncExternalStore } from "react";
import { useParseResult } from "@/lib/store";
import { signatureOf, useReviewState } from "@/app/review/review-store";
import type { PayrollBatch } from "@/types/payroll";

/** 브라우저에서 화면이 준비됐는지. 저장된 값은 브라우저에만 있어서, 준비되기 전에 "데이터 없음"을 보여주면 깜빡인다 */
export function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export type Reviewed =
  | { status: "loading" }
  /** 1~2단계에서 올린 파일이 없다 */
  | { status: "no-file" }
  /** 파일은 있는데 3단계 확인 화면을 아직 열지 않았다 */
  | { status: "not-reviewed" }
  | {
      status: "ready";
      /** 담당자가 고친 값이 반영된 사업장·귀속월별 데이터 */
      batches: PayrollBatch[];
      /** 3단계에서 확인 완료한 직원 id */
      confirmed: Set<string>;
      /** 아직 남아 있는 오류 개수 (모든 사업장 합계) */
      errorCount: number;
    };

export function useReviewed(): Reviewed {
  const hydrated = useHydrated();
  const result = useParseResult();
  const state = useReviewState();

  if (!hydrated) return { status: "loading" };
  if (!result) return { status: "no-file" };
  if (!state || state.signature !== signatureOf(result)) return { status: "not-reviewed" };

  const errorCount = state.batches.reduce(
    (n, b) => n + [...b.issues, ...b.employees.flatMap((e) => e.issues)].filter((i) => i.level === "error").length,
    0,
  );
  return { status: "ready", batches: state.batches, confirmed: new Set(state.confirmed), errorCount };
}

// ---------- 표시용 도우미 ----------

export const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

/** "2026-11" → "2026년 11월" */
export function periodText(p: string): string {
  const m = /^(\d{4})-(\d{1,2})$/.exec(p);
  return m ? `${m[1]}년 ${Number(m[2])}월` : p;
}

/** "2026-11-25" → "2026년 11월 25일" */
export function dateText(d?: string): string {
  const m = d ? /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(d) : null;
  return m ? `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일` : "미정";
}
