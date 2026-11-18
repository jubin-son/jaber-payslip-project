// 검산 규칙 (노션 '데이터 스키마' > 검산 규칙)
import type { EmployeePay, Issue } from "@/types/payroll";

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const sum = (xs: { amount: number }[]) => xs.reduce((a, b) => a + b.amount, 0);

/** 반올림 차이로 보는 범위 */
const ROUNDING = 10;

export function checkEmployee(e: EmployeePay, opts: { hasTotalEarnings: boolean; hasTotalDeductions: boolean; hasNet: boolean }): Issue[] {
  const issues: Issue[] = [];
  const se = sum(e.earnings);
  const sd = sum(e.deductions);

  if (opts.hasTotalEarnings) {
    const diff = e.totalEarnings - se;
    if (Math.abs(diff) > ROUNDING) {
      issues.push({
        level: "error",
        code: "SUM_MISMATCH",
        message: `지급 항목을 더하면 ${won(se)}인데 원본 지급합계는 ${won(e.totalEarnings)}이에요(${won(Math.abs(diff))} ${diff > 0 ? "부족" : "초과"}). 빠진 항목이 있는지 확인해 주세요.`,
        field: "totalEarnings",
      });
    } else if (diff !== 0) {
      issues.push({ level: "info", code: "SUM_MISMATCH", message: `지급합계와 항목 합이 ${won(Math.abs(diff))} 달라요(반올림 차이로 보여요).`, field: "totalEarnings" });
    }
  }
  if (opts.hasTotalDeductions) {
    const diff = e.totalDeductions - sd;
    if (Math.abs(diff) > ROUNDING) {
      issues.push({
        level: "error",
        code: "SUM_MISMATCH",
        message: `공제 항목을 더하면 ${won(sd)}인데 원본 공제합계는 ${won(e.totalDeductions)}이에요(${won(Math.abs(diff))} 차이).`,
        field: "totalDeductions",
      });
    } else if (diff !== 0) {
      issues.push({ level: "info", code: "SUM_MISMATCH", message: `공제합계와 항목 합이 ${won(Math.abs(diff))} 달라요(반올림 차이로 보여요).`, field: "totalDeductions" });
    }
  }
  if (opts.hasNet) {
    const expected = e.totalEarnings - e.totalDeductions;
    const diff = e.netPay - expected;
    if (Math.abs(diff) > ROUNDING) {
      issues.push({
        level: "error",
        code: "NET_MISMATCH",
        message: `지급합계 − 공제합계 = ${won(expected)}인데 원본 실지급액은 ${won(e.netPay)}이에요(${won(Math.abs(diff))} 차이).`,
        field: "netPay",
      });
    } else if (diff !== 0) {
      issues.push({ level: "info", code: "NET_MISMATCH", message: `실지급액이 계산값과 ${won(Math.abs(diff))} 달라요(반올림 차이로 보여요).`, field: "netPay" });
    }
  }

  // 요율: 일용직·강사는 4대보험 구조가 달라 건너뛴다
  if (e.employmentType !== "일용" && e.employmentType !== "강사") {
    const taxable = e.earnings.filter((i) => !i.taxFree).reduce((a, b) => a + b.amount, 0);
    const idx = e.deductions.findIndex((d) => d.category === "국민연금");
    const pension = idx >= 0 ? e.deductions[idx].amount : 0;
    // 국민연금은 기준소득월액으로 매기므로 상여 달 등은 4.75%와 다를 수 있다. 크게 벗어날 때만 경고
    if (pension > 0 && taxable > 0) {
      const rate = pension / taxable;
      if (rate < 0.03 || rate > 0.065) {
        issues.push({
          level: "warning",
          code: "RATE_OUT_OF_RANGE",
          message: `국민연금이 과세 지급액의 ${(rate * 100).toFixed(2)}%예요. 보통 4.75% 근처라서 다른 칸을 읽었을 수 있어요.`,
          field: `deductions.${idx}`,
        });
      }
    }
  }
  const taxIdx = e.deductions.findIndex((d) => d.category === "소득세");
  const localIdx = e.deductions.findIndex((d) => d.category === "지방소득세");
  if (taxIdx >= 0 && localIdx >= 0) {
    const tax = e.deductions[taxIdx].amount;
    const local = e.deductions[localIdx].amount;
    if (Math.abs(local - tax * 0.1) > ROUNDING) {
      issues.push({
        level: "warning",
        code: "RATE_OUT_OF_RANGE",
        message: `지방소득세(${won(local)})가 소득세(${won(tax)})의 10%와 맞지 않아요.`,
        field: `deductions.${localIdx}`,
      });
    }
  }
  return issues;
}
