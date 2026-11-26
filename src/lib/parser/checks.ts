// 검산 규칙 (노션 '데이터 스키마' > 검산 규칙)
import type { EmployeePay, Issue } from "@/types/payroll";
import { checkTaxFree, taxableEarnings } from "./tax-free";

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const sum = (xs: { amount: number }[]) => xs.reduce((a, b) => a + b.amount, 0);

/** 반올림 차이로 보는 범위 */
const ROUNDING = 10;

export function checkEmployee(
  e: EmployeePay,
  opts: { hasTotalEarnings: boolean; hasTotalDeductions: boolean; hasNet: boolean },
): Issue[] {
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
    // 비과세 한도를 넘은 금액은 과세로 센다
    const taxable = taxableEarnings(e);
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
    issues.push(...checkInsuranceLinks(e));
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
  // 비과세 한도 초과 (경고만, 발송을 막지 않는다)
  issues.push(...checkTaxFree(e));
  return issues;
}

// ---------- 4대보험끼리 비율 검사 ----------
// 건강보험·고용보험은 이번 달 지급액이 아니라 신고한 보수월액으로 매긴다. 그래서 상여 달에는 지급액 대비 비율이 크게 흔들린다
// (원본 바로늘편의점 10월: 건강보험이 지급액의 2.45%). 대신 국민연금·건강보험·고용보험은 같은 보수월액에서 나오므로
// 서로의 비율은 상여 달에도 거의 같다. 그래서 지급액이 아니라 보험료끼리 비교한다.
// 요율은 원본 급여대장 15개에서 확인한 2026년 값이다 (근로자 부담분). 요율이 바뀌면 아래 숫자만 고친다.
//   국민연금 4.75%, 건강보험 3.595%, 장기요양 = 건강보험 × 13.14%, 고용보험 0.9%
export const INSURANCE_RATES = { pension: 0.0475, health: 0.03595, longTermCareOfHealth: 0.1314, employment: 0.009 } as const;

/** 보험료는 10원 미만을 버려서, 계산값과 이만큼은 달라도 맞는 것으로 본다 */
const INSURANCE_ROUNDING = 20;
/** 국민연금은 기준소득월액 상한이 있어서 고소득자는 비율이 달라진다. 이 금액 이상이면 연금과 비교하지 않는다 */
const PENSION_NEAR_CAP = 290_000;

function checkInsuranceLinks(e: EmployeePay): Issue[] {
  const issues: Issue[] = [];
  const find = (cat: string) => {
    const i = e.deductions.findIndex((d) => d.category === cat);
    return i >= 0 ? { i, amount: e.deductions[i].amount } : null;
  };
  const pension = find("국민연금");
  const health = find("건강보험");
  const ltc = find("장기요양보험");
  const emp = find("고용보험");
  const r = INSURANCE_RATES;

  // 비교 결과를 먼저 모은다. 건강보험 하나가 틀리면 장기요양·고용보험 비교까지 같이 틀어지므로, 그때는 건강보험만 알린다
  const warn = (field: number, message: string): Issue => ({ level: "warning", code: "RATE_OUT_OF_RANGE", message, field: `deductions.${field}` });
  const off = (actual: number, expected: number, loose: boolean) =>
    Math.abs(actual - expected) > (loose ? Math.max(INSURANCE_ROUNDING * 2, expected * 0.03) : INSURANCE_ROUNDING);

  const hasHealth = Boolean(health && health.amount > 0);
  // 장기요양보험은 건강보험료에 비율을 곱해 매긴다. 건강보험이 있으면 항상 같이 있어야 한다
  const ltcMissing = hasHealth && (!ltc || ltc.amount === 0);
  const ltcExpected = hasHealth ? health!.amount * r.longTermCareOfHealth : 0;
  const ltcBad = hasHealth && !ltcMissing && off(ltc!.amount, ltcExpected, false);
  // 건강보험 ↔ 국민연금: 같은 보수월액이면 건강보험 = 국민연금 × (3.595 / 4.75)
  const pensionOk = Boolean(pension && pension.amount > 0 && pension.amount < PENSION_NEAR_CAP);
  const healthFromPension = pensionOk ? (pension!.amount * r.health) / r.pension : 0;
  const healthBad = hasHealth && pensionOk && off(health!.amount, healthFromPension, true);
  // 고용보험 ↔ 건강보험: 같은 보수월액이면 고용보험 = 건강보험 × (0.9 / 3.595)
  const hasEmp = Boolean(emp && emp.amount > 0);
  const empExpected = hasHealth ? (health!.amount * r.employment) / r.health : 0;
  const empBad = hasHealth && hasEmp && off(emp!.amount, empExpected, true);

  if (healthBad && (ltcBad || empBad)) {
    const others = [`국민연금(${won(pension!.amount)})`, ltcBad ? `장기요양보험(${won(ltc!.amount)})` : "", empBad ? `고용보험(${won(emp!.amount)})` : ""]
      .filter(Boolean)
      .join("·");
    issues.push(
      warn(
        health!.i,
        `건강보험(${won(health!.amount)})만 다른 보험료와 맞지 않아요. ${others}로 보면 건강보험은 약 ${won(healthFromPension)}이어야 해요. 다른 칸을 읽었거나 잘못 적혔는지 확인해 주세요.`,
      ),
    );
    if (ltcMissing) issues.push(warn(health!.i, `장기요양보험이 없어요. 건강보험과 같이 빠져야 해요.`));
    return issues;
  }
  if (ltcMissing) {
    issues.push(
      warn(
        health!.i,
        `건강보험(${won(health!.amount)})은 있는데 장기요양보험이 없어요. 보통 건강보험의 13.14%인 약 ${won(ltcExpected)}이 같이 빠져요. 열을 못 읽었거나 빠뜨렸는지 확인해 주세요.`,
      ),
    );
  }
  if (ltcBad) issues.push(warn(ltc!.i, `장기요양보험(${won(ltc!.amount)})이 건강보험(${won(health!.amount)})의 13.14%인 약 ${won(ltcExpected)}과 맞지 않아요.`));
  if (healthBad) {
    // 고용보험·장기요양은 건강보험과 맞는데 국민연금만 어긋나면, 틀린 쪽은 국민연금이다
    if (hasEmp && !empBad && !ltcBad && !ltcMissing) {
      const pensionExpected = (health!.amount * r.pension) / r.health;
      issues.push(
        warn(
          pension!.i,
          `국민연금(${won(pension!.amount)})만 다른 보험료와 맞지 않아요. 건강보험(${won(health!.amount)})·고용보험(${won(emp!.amount)})으로 보면 국민연금은 약 ${won(pensionExpected)}이어야 해요. 다른 칸을 읽었거나 잘못 적혔는지 확인해 주세요.`,
        ),
      );
    } else {
      issues.push(
        warn(
          health!.i,
          `건강보험(${won(health!.amount)})과 국민연금(${won(pension!.amount)})의 비율이 맞지 않아요. 보통 둘은 같은 보수월액으로 매겨서 건강보험이 국민연금의 약 76%예요(지금 기준 약 ${won(healthFromPension)}).`,
        ),
      );
    }
  }
  if (empBad) {
    issues.push(
      warn(
        emp!.i,
        `고용보험(${won(emp!.amount)})이 건강보험(${won(health!.amount)})으로 계산한 약 ${won(empExpected)}과 많이 달라요. 보통 둘은 같은 보수월액으로 매겨서 비율이 일정해요.`,
      ),
    );
  }
  return issues;
}
