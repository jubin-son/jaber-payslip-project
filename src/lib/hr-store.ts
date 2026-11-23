"use client";
// 인건비 관리(기본 관리·임직원 관리)에서 정한 값을 브라우저(localStorage)에 둔다.
// 탭을 닫아도 남는다. 나중에 저장소(Supabase)를 붙이면 이 파일만 바꾸면 된다.
//   - 기본 관리: 사업장별 소득 구분, 엑셀 항목 → 표준 항목 연결
//   - 임직원 관리: 직원 명부. 처음에는 자버 직원연락처(테스트 데이터)로 채워 둔다
import { useSyncExternalStore } from "react";
import type { PayCategory } from "@/types/payroll";
import { jaberEmployees, type JaberEmployee } from "@/lib/jaber-db";

export type IncomeType = "근로소득" | "사업소득";

/** 급여대장 엑셀의 열 이름을 어떤 표준 항목으로 읽을지. "무시"면 금액으로 읽지 않는다 */
export type ItemLink = { label: string; category: PayCategory | "무시" };

export type HrSettings = {
  /** 사업장코드 → 소득 구분. 없으면 근로소득 */
  incomeType: Record<string, IncomeType>;
  itemLinks: ItemLink[];
};

const DEFAULT_SETTINGS: HrSettings = { incomeType: {}, itemLinks: [] };

function createLocalStore<T>(key: string, initial: () => T) {
  let cache: T | undefined;
  const listeners = new Set<() => void>();
  function read(): T {
    if (cache !== undefined) return cache;
    try {
      const raw = localStorage.getItem(key);
      cache = raw ? (JSON.parse(raw) as T) : initial();
    } catch {
      cache = initial();
    }
    return cache;
  }
  function write(next: T) {
    cache = next;
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // 저장이 안 돼도 이 탭 안에서는 cache로 동작한다
    }
    listeners.forEach((l) => l());
  }
  function subscribe(l: () => void) {
    listeners.add(l);
    // 다른 탭에서 바꾼 값도 따라간다
    const onStorage = (ev: StorageEvent) => {
      if (ev.key !== key) return;
      cache = undefined;
      l();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(l);
      window.removeEventListener("storage", onStorage);
    };
  }
  return {
    get: read,
    set: (fn: (prev: T) => T) => write(fn(read())),
    reset: () => write(initial()),
    /** 서버 렌더링 중에는 null (브라우저 값은 화면이 뜬 뒤에 읽는다) */
    use: () => useSyncExternalStore(subscribe, read, () => null),
  };
}

export const settingsStore = createLocalStore<HrSettings>("jaber.hr.settings.v1", () => structuredClone(DEFAULT_SETTINGS));

/** 임직원 명부. 처음 열면 자버 직원연락처 69명(테스트 데이터)으로 시작한다 */
export const rosterStore = createLocalStore<JaberEmployee[]>("jaber.hr.roster.v1", () => structuredClone(jaberEmployees));

export function incomeTypeOf(settings: HrSettings | null, companyCode?: string): IncomeType {
  return (companyCode && settings?.incomeType[companyCode]) || "근로소득";
}

/** 새 회원번호: 지금 명부에서 가장 큰 번호 + 1 (6자리) */
export function nextMemberId(roster: JaberEmployee[]): string {
  const max = roster.reduce((n, e) => Math.max(n, Number(e.memberId) || 0), 100000);
  return String(Math.min(max + 1, 999999)).padStart(6, "0");
}
