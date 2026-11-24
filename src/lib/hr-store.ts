"use client";
// 인건비 관리(기본 관리·임직원 관리)에서 정한 값을 브라우저(localStorage)에 둔다.
// 탭을 닫아도 남는다. 나중에 저장소(Supabase)를 붙이면 이 파일만 바꾸면 된다.
// 이 화면을 쓰는 사람은 자버에 가입한 사업주 본인(사업장 1곳)이다.
//   - 로그인한 사업주: 아직 로그인이 없어서 테스트용으로 사업장 16곳 중 하나를 고른다 (ownerStore)
//   - 기본 관리: 내 사업장 정보와 급여명세서 발행 설정(소득 구분, 엑셀 항목 → 표준 항목 연결)
//   - 임직원 관리: 직원 명부. 처음에는 자버 직원연락처(테스트 데이터)로 채워 둔다. 화면에는 내 사업장 직원만 보인다
import { useSyncExternalStore } from "react";
import type { PayCategory } from "@/types/payroll";
import { jaberCompanies, jaberEmployees, type JaberCompany, type JaberEmployee } from "@/lib/jaber-db";

export type IncomeType = "근로소득" | "사업소득";

/**
 * 급여대장 엑셀의 열 이름을 어떤 표준 항목으로 읽을지. "무시"면 금액으로 읽지 않는다.
 * taxFree: 지급 항목일 때만 쓴다. 비과세는 '어떤 항목인지'와 따로 정하는 속성이라 표준 항목으로 두지 않았다.
 *   (식대는 식대이면서 비과세. 연구활동비·보육수당처럼 사업장마다 다른 비과세 수당을 '기타지급 + 비과세'로 연결한다)
 */
export type ItemLink = { label: string; category: PayCategory | "무시"; taxFree?: boolean };

/** 사업주가 기본 관리에서 고칠 수 있는 사업장 정보 (사업장코드·가입일은 자버가 정해서 못 고친다) */
export type CompanyProfile = Omit<JaberCompany, "code" | "joinedAt">;

/** 사업장 한 곳의 기본 관리 값 */
export type BusinessSettings = {
  /** 자버 가입 정보에서 고친 칸만 담는다 */
  profile: Partial<CompanyProfile>;
  incomeType: IncomeType;
  itemLinks: ItemLink[];
};

/** 사업장코드 → 기본 관리 값. 테스트로 사업주를 바꿔도 사업장마다 따로 남는다 */
export type HrSettings = { byCompany: Record<string, BusinessSettings> };

const DEFAULT_SETTINGS: HrSettings = { byCompany: {} };
const DEFAULT_BUSINESS: BusinessSettings = { profile: {}, incomeType: "근로소득", itemLinks: [] };

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

export const settingsStore = createLocalStore<HrSettings>("jaber.hr.settings.v2", () => structuredClone(DEFAULT_SETTINGS));

/** 로그인한 사업주의 사업장코드 (로그인을 붙이기 전까지 테스트용으로 고른다) */
export const ownerStore = createLocalStore<string>("jaber.hr.owner.v1", () => jaberCompanies[0]?.code ?? "");

/** 임직원 명부. 처음 열면 자버 직원연락처 69명(테스트 데이터)으로 시작한다 */
export const rosterStore = createLocalStore<JaberEmployee[]>("jaber.hr.roster.v1", () => structuredClone(jaberEmployees));

export function businessOf(settings: HrSettings | null, companyCode?: string): BusinessSettings {
  const b = (companyCode && settings?.byCompany[companyCode]) || undefined;
  return { ...DEFAULT_BUSINESS, ...b, profile: { ...b?.profile } };
}

/** 자버 가입 정보에 사업주가 고친 내용을 덮은 사업장 정보 */
export function companyOf(settings: HrSettings | null, companyCode?: string): JaberCompany | undefined {
  const base = jaberCompanies.find((c) => c.code === companyCode);
  return base && { ...base, ...businessOf(settings, companyCode).profile };
}

export function incomeTypeOf(settings: HrSettings | null, companyCode?: string): IncomeType {
  return businessOf(settings, companyCode).incomeType;
}

/** 내 사업장(지금 로그인한 사업주)의 기본 관리 값을 고친다 */
export function updateMyBusiness(fn: (b: BusinessSettings) => BusinessSettings) {
  const code = ownerStore.get();
  settingsStore.set((s) => ({ ...s, byCompany: { ...s.byCompany, [code]: fn(businessOf(s, code)) } }));
}

/** 지금 로그인한 사업주와 그 사업장 설정 (브라우저 값을 읽기 전에는 null) */
export function useOwner(): { code: string; company: JaberCompany; business: BusinessSettings } | null {
  const code = ownerStore.use();
  const settings = settingsStore.use();
  if (code === null || settings === null) return null;
  const company = companyOf(settings, code) ?? companyOf(settings, jaberCompanies[0]?.code);
  if (!company) return null;
  return { code: company.code, company, business: businessOf(settings, company.code) };
}

/** 화면 밖(업로드 처리 등)에서 내 사업장 정보 읽기 */
export function getOwner(): { company: JaberCompany; business: BusinessSettings } | null {
  const settings = settingsStore.get();
  const company = companyOf(settings, ownerStore.get());
  return company ? { company, business: businessOf(settings, company.code) } : null;
}

/** 새 회원번호: 지금 명부에서 가장 큰 번호 + 1 (6자리) */
export function nextMemberId(roster: JaberEmployee[]): string {
  const max = roster.reduce((n, e) => Math.max(n, Number(e.memberId) || 0), 100000);
  return String(Math.min(max + 1, 999999)).padStart(6, "0");
}
