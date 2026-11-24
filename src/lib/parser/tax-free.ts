// 비과세 한도 확인.
// 왜 넣었나: 급여대장은 열 이름만 보고 '식대 = 비과세'로 읽기 때문에, 한도를 넘는 금액이나
// 식사를 현물로 주는 사업장의 식대까지 통째로 비과세로 표시됐다. 세금은 세무사·노무사가 이미 계산해서 주므로
// 금액은 바꾸지 않고, 담당자가 작성자에게 한 번 확인해 볼 수 있게 '확인 필요'만 띄운다(소득세 역산은 하지 않는다).
//
// 근거 조문 (Korean Law MCP로 2026-11-24 현행본 확인)
//   - 소득세법 제12조제3호러목 (2026.7.1. 시행본): 식사를 제공받지 않는 근로자가 받는 월 20만원 이하의 식사대
//   - 소득세법 제12조제3호머목2): 6세 이하 자녀 보육 관련 급여, 자녀 1명당 월 20만원 이내
//   - 소득세법 시행령 제12조제3호 (2026.10.1. 시행본): 자가운전보조금 중 월 20만원 이내
//   - 소득세법 시행령 제12조제12호: 연구보조비·연구활동비 중 월 20만원 이내 (교원, 정부출연연구기관, 중소·벤처기업 부설연구소 등)
// 한도가 바뀌면 아래 표와 CHECKED_AT만 고친다.
import type { EmployeePay, Issue, PayItem } from "@/types/payroll";

export const TAX_FREE_RULES_CHECKED_AT = "2026-11-24";

type Rule = {
  id: "meal" | "car" | "research" | "childcare";
  name: string;
  monthlyLimit: number;
  /** 자녀 1명당 한도라서, 파일만으로는 넘었는지 알 수 없다 */
  perChild?: boolean;
  basis: string;
  match: (it: PayItem) => boolean;
};

const has = (it: PayItem, words: string[]) => words.some((w) => it.label.replace(/\s/g, "").includes(w));

export const TAX_FREE_RULES: Rule[] = [
  { id: "meal", name: "식대", monthlyLimit: 200_000, basis: "소득세법 제12조제3호러목", match: (it) => it.category === "식대" },
  { id: "car", name: "자가운전보조금", monthlyLimit: 200_000, basis: "소득세법 시행령 제12조제3호", match: (it) => it.category === "차량유지비" },
  { id: "research", name: "연구활동비", monthlyLimit: 200_000, basis: "소득세법 시행령 제12조제12호", match: (it) => has(it, ["연구활동비", "연구보조비"]) },
  { id: "childcare", name: "보육수당", monthlyLimit: 200_000, perChild: true, basis: "소득세법 제12조제3호머목", match: (it) => has(it, ["보육"]) },
];

export type TaxFreeOptions = {
  /** 기본 관리에서 '식사 제공'으로 표시한 사업장이면 true. 이때 식대는 전액 과세 */
  mealProvided?: boolean;
};

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;

/** 비과세로 표시된 항목을 규칙별로 묶는다 (식대·중식대처럼 열이 둘이어도 한도는 합쳐서 본다) */
function groupByRule(e: EmployeePay) {
  const groups = new Map<Rule, { total: number; firstIndex: number }>();
  e.earnings.forEach((it, i) => {
    if (!it.taxFree) return;
    const rule = TAX_FREE_RULES.find((r) => r.match(it));
    if (!rule) return;
    const g = groups.get(rule);
    if (g) g.total += it.amount;
    else groups.set(rule, { total: it.amount, firstIndex: i });
  });
  return groups;
}

/** 검산용 과세 지급액: 비과세가 아닌 항목 + 한도를 넘은 비과세 금액 (식사 제공 사업장이면 식대 전액) */
export function taxableEarnings(e: EmployeePay, opts: TaxFreeOptions = {}): number {
  let taxable = e.earnings.filter((it) => !it.taxFree).reduce((a, b) => a + b.amount, 0);
  for (const [rule, g] of groupByRule(e)) {
    if (rule.id === "meal" && opts.mealProvided) taxable += g.total;
    else if (!rule.perChild) taxable += Math.max(0, g.total - rule.monthlyLimit);
  }
  return taxable;
}

/** 비과세 한도·식사 제공 확인. 금액은 바꾸지 않고 issue만 만든다 */
export function checkTaxFree(e: EmployeePay, opts: TaxFreeOptions = {}): Issue[] {
  // 일용직·강사는 비과세 구조가 달라 건너뛴다
  if (e.employmentType === "일용" || e.employmentType === "강사") return [];
  const issues: Issue[] = [];
  for (const [rule, g] of groupByRule(e)) {
    const field = `earnings.${g.firstIndex}`;
    if (rule.id === "meal" && opts.mealProvided) {
      issues.push({
        level: "warning",
        code: "TAX_FREE_LIMIT",
        message: `식사를 제공하는 사업장으로 설정돼 있어요. 이 경우 식대 ${won(g.total)}은 비과세가 아니라 과세 대상이에요(${rule.basis}). 과세로 처리됐는지 작성한 사무소에 확인해 주세요.`,
        field,
      });
      continue;
    }
    const over = g.total - rule.monthlyLimit;
    if (over <= 0) continue;
    if (rule.perChild) {
      issues.push({
        level: "info",
        code: "TAX_FREE_LIMIT",
        message: `${rule.name} ${won(g.total)}이 월 ${won(rule.monthlyLimit)}을 넘어요. 비과세 한도는 6세 이하 자녀 1명당이라 자녀가 여럿이면 정상일 수 있어요(${rule.basis}).`,
        field,
      });
    } else {
      issues.push({
        level: "warning",
        code: "TAX_FREE_LIMIT",
        message: `${rule.name} ${won(g.total)} 중 월 ${won(rule.monthlyLimit)}까지만 비과세예요. 넘는 ${won(over)}은 과세 대상이니, 과세로 처리됐는지 작성한 사무소에 확인해 주세요(${rule.basis}).`,
        field,
      });
    }
  }
  return issues;
}
