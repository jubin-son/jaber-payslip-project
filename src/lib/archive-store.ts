"use client";
// 급여명세서 관리: 명세서로 변환한 결과를 사업장·귀속월별로 모아 두는 저장소. 브라우저(localStorage)에 둔다.
// 탭을 닫아도 남는다. 나중에 저장소(Supabase)를 붙이면 이 파일만 바꾸면 된다.
// 같은 사업장·귀속월을 다시 변환하면 최신 내용으로 덮어쓴다 (명세서 변환 화면을 열 때마다 저장).
import { useSyncExternalStore } from "react";
import type { PayrollBatch } from "@/types/payroll";

export type ArchivedPayslips = {
  /** 사업장(코드 또는 이름) + 귀속월 */
  key: string;
  /** 처음 저장한 시각 */
  createdAt: string;
  /** 마지막으로 내용이 바뀐 시각 */
  savedAt: string;
  /** 명세서를 만들 수 있는(오류 없는) 직원만 담은 사본 */
  batch: PayrollBatch;
};

const KEY = "jaber.archive.v1";
let cache: ArchivedPayslips[] | undefined;
const listeners = new Set<() => void>();

function read(): ArchivedPayslips[] {
  if (cache !== undefined) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as ArchivedPayslips[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: ArchivedPayslips[]) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 저장이 안 돼도 이 탭 안에서는 cache로 동작한다
  }
  listeners.forEach((l) => l());
}

export const archiveKeyOf = (b: Pick<PayrollBatch, "companyCode" | "companyName" | "payPeriod">) =>
  `${b.companyCode ?? b.companyName}|${b.payPeriod}`;

/** 변환된 명세서를 월별 기록에 저장한다. 내용이 그대로면 아무것도 바꾸지 않는다 */
export function archiveBatches(batches: PayrollBatch[], issuable: Set<string>) {
  const cur = read();
  let next = cur;
  for (const b of batches) {
    const employees = b.employees.filter((e) => issuable.has(e.id));
    if (employees.length === 0) continue;
    const batch: PayrollBatch = { ...b, employees };
    const key = archiveKeyOf(b);
    const old = next.find((a) => a.key === key);
    if (old && JSON.stringify(old.batch) === JSON.stringify(batch)) continue;
    const now = new Date().toISOString();
    const entry: ArchivedPayslips = { key, createdAt: old?.createdAt ?? now, savedAt: now, batch };
    next = old ? next.map((a) => (a.key === key ? entry : a)) : [...next, entry];
  }
  if (next !== cur) write(next);
}

export function removeArchived(key: string) {
  write(read().filter((a) => a.key !== key));
}

/** 서버에서 그릴 때는 null (저장된 값은 브라우저에만 있으므로) */
export function useArchive(): ArchivedPayslips[] | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => null,
  );
}
