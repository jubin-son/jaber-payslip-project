"use client";
// 인건비 관리(기본 관리·임직원 관리)에서 정한 값을 브라우저(localStorage)에 둔다.
// 탭을 닫아도 남는다. 나중에 저장소(Supabase)를 붙이면 이 파일만 바꾸면 된다.
// 이 화면을 쓰는 사람은 자버에 가입한 사업주 본인이다. 사업장을 여러 곳 가질 수 있다.
//   - 로그인한 사업주: 아직 로그인이 없어서 테스트용으로 사업장 16곳 중 하나를 고른다 (ownerStore = 가입한 사업장코드)
//   - 내 사업장 목록: 가입한 사업장 + 기본 관리에서 추가한 사업장 (accountStore). 그중 한 곳을 골라 관리한다
//     기본 관리·임직원 관리 값은 지금 관리 중인 사업장 것이 보이고 고쳐진다
//   - 기본 관리: 내 사업장 정보와 급여명세서 발행 설정(상시근로자 수, 엑셀 항목 → 표준 항목 연결)
//   - 임직원 관리: 직원 명부(소득 구분 포함). 처음에는 자버 직원연락처(테스트 데이터)로 채워 둔다. 화면에는 내 사업장 직원만 보인다
import { useSyncExternalStore } from "react";
import type { EmployeePay, PayCategory } from "@/types/payroll";
import { jaberCompanies, jaberEmployees, type IncomeType, type JaberCompany, type JaberEmployee } from "@/lib/jaber-db";
import type { HeadcountSetting } from "@/lib/wage-statement";
import { matchJaber } from "@/lib/jaber-match";
import { getParseResult, saveParseResult } from "@/lib/store";
import { updateReview } from "@/app/review/review-store";

export type { IncomeType };

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
  itemLinks: ItemLink[];
  /** 상시근로자 수 5명 이상/미만. 가산율·연차 같은 임금명세서 기재가 달라진다. "자동"이면 급여대장 인원으로 추정 */
  headcount?: HeadcountSetting;
};

/** 사업장코드 → 기본 관리 값. 테스트로 사업주를 바꿔도 사업장마다 따로 남는다 */
export type HrSettings = { byCompany: Record<string, BusinessSettings> };

const DEFAULT_SETTINGS: HrSettings = { byCompany: {} };
const DEFAULT_BUSINESS: BusinessSettings = { profile: {}, itemLinks: [], headcount: "자동" };

function createLocalStore<T>(key: string, initial: () => T, onWrite?: (next: T) => void) {
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
    onWrite?.(next);
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

/** 로그인한 사업주가 자버에 가입한 사업장코드 (로그인을 붙이기 전까지 테스트용으로 고른다) */
export const ownerStore = createLocalStore<string>("jaber.hr.owner.v1", () => jaberCompanies[0]?.code ?? "");

/**
 * 사업주 한 명의 사업장 목록. 로그인 사업장코드 → 계정.
 * workplaces: 가입한 사업장을 뺀, 기본 관리에서 추가한 사업장코드 (가입한 사업장은 늘 맨 앞에 있다)
 * current: 지금 관리 중인 사업장코드
 */
export type OwnerAccount = { workplaces: string[]; current?: string };
export const accountStore = createLocalStore<Record<string, OwnerAccount>>("jaber.hr.accounts.v1", () => ({}));

/** 자버에 없는 사업장을 사업주가 새로 등록한 것. 사업장코드는 이 화면에서 만든다(JB-9001부터) */
export const newCompanyStore = createLocalStore<JaberCompany[]>("jaber.hr.newCompanies.v1", () => []);

/** 사업장코드로 사업장 원본(사업주가 고치기 전) 찾기: 자버 가입 사업장 → 새로 등록한 사업장 */
export function baseCompany(code?: string): JaberCompany | undefined {
  if (!code) return undefined;
  return jaberCompanies.find((c) => c.code === code) ?? newCompanyStore.get().find((c) => c.code === code);
}

/** 자버 가입 사업장인지 (아니면 기본 관리에서 새로 등록한 사업장) */
export function isJaberCompany(code: string): boolean {
  return jaberCompanies.some((c) => c.code === code);
}

/** 로그인한 사업주의 사업장코드 목록 (가입한 사업장이 맨 앞) */
function workplaceCodes(login: string, accounts: Record<string, OwnerAccount> | null): string[] {
  const added = accounts?.[login]?.workplaces ?? [];
  return [login, ...added.filter((c) => c !== login && baseCompany(c))];
}

/** 지금 관리 중인 사업장코드 (목록에 없으면 가입한 사업장) */
function currentCode(login: string, accounts: Record<string, OwnerAccount> | null): string {
  const cur = accounts?.[login]?.current;
  return cur && workplaceCodes(login, accounts).includes(cur) ? cur : login;
}

/** 관리할 사업장 바꾸기 */
export function selectWorkplace(code: string) {
  const login = ownerStore.get();
  accountStore.set((a) => ({ ...a, [login]: { workplaces: a[login]?.workplaces ?? [], current: code } }));
}

/** 내 사업장에 추가하고 바로 그 사업장을 관리한다. 자버 가입 사업장이면 code만, 새 사업장이면 정보를 받아 코드를 만든다 */
export function addWorkplace(input: { code: string } | { company: Omit<JaberCompany, "code" | "joinedAt"> }): string {
  let code: string;
  if ("code" in input) {
    code = input.code;
  } else {
    const list = newCompanyStore.get();
    const max = list.reduce((n, c) => Math.max(n, Number(c.code.replace(/\D/g, "")) || 0), 9000);
    code = `JB-${max + 1}`;
    const today = new Date().toISOString().slice(0, 10);
    newCompanyStore.set((l) => [...l, { ...input.company, code, joinedAt: today }]);
  }
  const login = ownerStore.get();
  accountStore.set((a) => {
    const prev = a[login]?.workplaces ?? [];
    return { ...a, [login]: { workplaces: prev.includes(code) || code === login ? prev : [...prev, code], current: code } };
  });
  return code;
}

/** 내 사업장에서 빼기. 가입한 사업장은 뺄 수 없다. 그 사업장의 설정·직원 명부는 지우지 않는다(다시 추가하면 그대로 돌아온다) */
export function removeWorkplace(code: string) {
  const login = ownerStore.get();
  if (code === login) return;
  accountStore.set((a) => {
    const prev = a[login];
    if (!prev) return a;
    return { ...a, [login]: { workplaces: prev.workplaces.filter((c) => c !== code), current: prev.current === code ? login : prev.current } };
  });
}

/** 임직원 명부. 처음 열면 자버 직원연락처 69명(테스트 데이터)으로 시작한다 */
// 명부를 고치면 이미 올려 둔 급여대장도 새 명부로 다시 매칭한다 (급여대장을 먼저 올리고 직원을 나중에 등록해도 명세서에 반영되게)
export const rosterStore = createLocalStore<JaberEmployee[]>("jaber.hr.roster.v1", () => structuredClone(jaberEmployees), rematchSavedPayroll);

/**
 * 탭에 저장된 급여대장(2단계 정리 결과, 3단계 확인·수정 사본)을 지금 명부로 다시 매칭한다.
 * 매칭 결과(match)와 매칭 안내(issue)만 바뀌고, 금액·고친 내용·수정 기록은 그대로 둔다.
 */
function rematchSavedPayroll(roster: JaberEmployee[]) {
  const owner = getOwner();
  const own = owner ? matchOrder(owner) : undefined;
  const parsed = getParseResult();
  if (parsed) {
    const next = structuredClone(parsed);
    matchJaber(next.batches, roster, own);
    saveParseResult(next);
  }
  updateReview((s) => {
    const batches = structuredClone(s.batches);
    matchJaber(batches, roster, own);
    return { ...s, batches };
  });
}

export function businessOf(settings: HrSettings | null, companyCode?: string): BusinessSettings {
  const b = (companyCode && settings?.byCompany[companyCode]) || undefined;
  return { ...DEFAULT_BUSINESS, ...b, profile: { ...b?.profile } };
}

/** 자버 가입 정보에 사업주가 고친 내용을 덮은 사업장 정보 */
export function companyOf(settings: HrSettings | null, companyCode?: string): JaberCompany | undefined {
  const base = baseCompany(companyCode);
  return base && { ...base, ...businessOf(settings, companyCode).profile };
}

export function headcountOf(settings: HrSettings | null, companyCode?: string): HeadcountSetting {
  return businessOf(settings, companyCode).headcount ?? "자동";
}

/** 급여대장 직원의 소득 구분: 임직원 관리 명부에서 매칭된 직원의 값 (매칭이 안 됐거나 비어 있으면 근로소득) */
export function incomeTypeOfEmployee(roster: JaberEmployee[] | null, e: Pick<EmployeePay, "match">): IncomeType {
  const id = e.match?.memberId;
  return (id && roster?.find((r) => r.memberId === id)?.incomeType) || "근로소득";
}

/** 지금 관리 중인 사업장의 기본 관리 값을 고친다 */
export function updateMyBusiness(fn: (b: BusinessSettings) => BusinessSettings) {
  const code = currentCode(ownerStore.get(), accountStore.get());
  settingsStore.set((s) => ({ ...s, byCompany: { ...s.byCompany, [code]: fn(businessOf(s, code)) } }));
}

export type Owner = {
  /** 로그인한 사업주가 자버에 가입한 사업장코드 */
  login: string;
  /** 지금 관리 중인 사업장코드 */
  code: string;
  /** 지금 관리 중인 사업장 (사업주가 고친 정보까지 반영) */
  company: JaberCompany;
  business: BusinessSettings;
  /** 내 사업장 전체 (가입한 사업장이 맨 앞) */
  workplaces: JaberCompany[];
};

function ownerOf(login: string, accounts: Record<string, OwnerAccount> | null, settings: HrSettings | null): Owner | null {
  const loginCode = baseCompany(login) ? login : jaberCompanies[0]?.code;
  if (!loginCode) return null;
  const code = currentCode(loginCode, accounts);
  const company = companyOf(settings, code);
  if (!company) return null;
  const workplaces = workplaceCodes(loginCode, accounts)
    .map((c) => companyOf(settings, c))
    .filter((c): c is JaberCompany => !!c);
  return { login: loginCode, code, company, business: businessOf(settings, code), workplaces };
}

/** 지금 로그인한 사업주와 관리 중인 사업장 (브라우저 값을 읽기 전에는 null) */
export function useOwner(): Owner | null {
  const login = ownerStore.use();
  const accounts = accountStore.use();
  const settings = settingsStore.use();
  // 새로 등록한 사업장이 바뀌면 다시 그린다
  const added = newCompanyStore.use();
  if (login === null || accounts === null || settings === null || added === null) return null;
  return ownerOf(login, accounts, settings);
}

/** 급여대장 매칭용 내 사업장 목록: 지금 관리 중인 사업장을 맨 앞에 둔다(어느 사업장인지 못 고르면 이 사업장으로 본다) */
export function matchOrder(owner: Owner): JaberCompany[] {
  return [owner.company, ...owner.workplaces.filter((c) => c.code !== owner.code)];
}

/** 화면 밖(업로드 처리 등)에서 내 사업장 정보 읽기 */
export function getOwner(): Owner | null {
  return ownerOf(ownerStore.get(), accountStore.get(), settingsStore.get());
}

/** 새 회원번호: 지금 명부에서 가장 큰 번호 + 1 (6자리) */
export function nextMemberId(roster: JaberEmployee[]): string {
  const max = roster.reduce((n, e) => Math.max(n, Number(e.memberId) || 0), 100000);
  return String(Math.min(max + 1, 999999)).padStart(6, "0");
}
