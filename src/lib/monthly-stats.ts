// 월별 급여 집계: 쌓여 있는 명세서 기록(archive-store)을 귀속월 단위로 합산하고, 두 달을 비교한다.
// 화면 없이 계산만 하는 파일이라 서버·클라이언트 어디서든 쓸 수 있다.
import type { ArchivedPayslips } from "@/lib/archive-store";
import type { EmployeePay } from "@/types/payroll";

export type CategoryTotals = Record<string, number>;

export type MonthStat = {
  /** 귀속월 "2026-11" */
  period: string;
  headcount: number;
  totalEarnings: number;
  totalDeductions: number;
  netPay: number;
  /** 1인 평균 실지급액 */
  avgNet: number;
  /** 지급 항목(기본급·식대…)별 합계 */
  earnings: CategoryTotals;
  /** 공제 항목(국민연금·소득세…)별 합계 */
  deductions: CategoryTotals;
  /** 사업장별 실지급액 합계 */
  byCompany: Record<string, { headcount: number; netPay: number }>;
  /** 직원 이름 → 실지급액 (같은 이름이 여러 사업장이면 합산하지 않고 "이름@사업장"으로 구분) */
  byEmployee: Record<string, number>;
};

const add = (t: CategoryTotals, k: string, n: number) => {
  t[k] = (t[k] ?? 0) + n;
};

/** 직원을 달마다 같은 사람으로 이어 붙이는 키: 사번 > 이름, 사업장 안에서만 같은 사람으로 본다 */
export const employeeKeyOf = (company: string, e: Pick<EmployeePay, "name" | "employeeNo">) =>
  `${e.name}${e.employeeNo ? `#${e.employeeNo}` : ""}@${company}`;

/** 기록 전체를 귀속월별로 합산한다. 결과는 오래된 달부터 */
export function summarizeMonths(archive: ArchivedPayslips[], company?: string): MonthStat[] {
  const map = new Map<string, MonthStat>();
  for (const a of archive) {
    const b = a.batch;
    if (company && b.companyName !== company) continue;
    let m = map.get(b.payPeriod);
    if (!m) {
      m = {
        period: b.payPeriod,
        headcount: 0,
        totalEarnings: 0,
        totalDeductions: 0,
        netPay: 0,
        avgNet: 0,
        earnings: {},
        deductions: {},
        byCompany: {},
        byEmployee: {},
      };
      map.set(b.payPeriod, m);
    }
    const c = (m.byCompany[b.companyName] ??= { headcount: 0, netPay: 0 });
    for (const e of b.employees) {
      m.headcount += 1;
      m.totalEarnings += e.totalEarnings;
      m.totalDeductions += e.totalDeductions;
      m.netPay += e.netPay;
      c.headcount += 1;
      c.netPay += e.netPay;
      for (const it of e.earnings) add(m.earnings, it.category, it.amount);
      for (const it of e.deductions) add(m.deductions, it.category, it.amount);
      const k = employeeKeyOf(b.companyName, e);
      m.byEmployee[k] = (m.byEmployee[k] ?? 0) + e.netPay;
    }
  }
  const list = [...map.values()].sort((x, y) => x.period.localeCompare(y.period));
  for (const m of list) m.avgNet = m.headcount ? m.netPay / m.headcount : 0;
  return list;
}

export type Delta = { cur: number; prev: number; diff: number; /** 전월 0이면 null */ pct: number | null };

export const delta = (cur: number, prev: number): Delta => ({
  cur,
  prev,
  diff: cur - prev,
  pct: prev === 0 ? null : ((cur - prev) / prev) * 100,
});

export type CategoryRow = Delta & { category: string };

/** 항목별 전월 대비 (변동 큰 순) */
export function compareCategories(cur: CategoryTotals, prev: CategoryTotals): CategoryRow[] {
  const keys = new Set([...Object.keys(cur), ...Object.keys(prev)]);
  return [...keys]
    .map((category) => ({ category, ...delta(cur[category] ?? 0, prev[category] ?? 0) }))
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}

export type EmployeeChange = {
  key: string;
  name: string;
  company: string;
  kind: "new" | "left" | "changed";
} & Delta;

const splitKey = (k: string) => {
  const at = k.lastIndexOf("@");
  return { name: k.slice(0, at).replace(/#.*$/, ""), company: k.slice(at + 1) };
};

/** 직원별 실지급액 변동: 새로 생긴 사람·빠진 사람·금액이 바뀐 사람 */
export function compareEmployees(cur: MonthStat, prev: MonthStat): EmployeeChange[] {
  const keys = new Set([...Object.keys(cur.byEmployee), ...Object.keys(prev.byEmployee)]);
  const out: EmployeeChange[] = [];
  for (const key of keys) {
    const c = cur.byEmployee[key];
    const p = prev.byEmployee[key];
    const kind: EmployeeChange["kind"] = p === undefined ? "new" : c === undefined ? "left" : "changed";
    if (kind === "changed" && c === p) continue;
    out.push({ key, ...splitKey(key), kind, ...delta(c ?? 0, p ?? 0) });
  }
  return out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}

/** 사업장 이름 목록 (필터용) */
export const companiesOf = (archive: ArchivedPayslips[]) => [...new Set(archive.map((a) => a.batch.companyName))].sort();

/** "+120,000원" / "-30,000원" / "변동 없음" */
export const signedWon = (n: number) =>
  n === 0 ? "변동 없음" : `${n > 0 ? "+" : "-"}${Math.abs(Math.round(n)).toLocaleString("ko-KR")}원`;

export const pctText = (p: number | null) => (p === null ? "신규" : `${p > 0 ? "+" : ""}${p.toFixed(1)}%`);
