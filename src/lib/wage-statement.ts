// 임금명세서 기재 규칙: 사업장 규모(상시 5명 이상/미만)와 근로형태(월급·시급·일용·강사)에 따라 달라지는 부분.
// 근거: 01. 실습/세법리서치_사업장근로형태별임금명세서_20261124.md (회계사·노무사 검토 전 초안)
//   - 근로기준법 시행령 제27조의2 제5호: 구성항목별 금액이 출근일수·시간 등에 따라 달라지면 계산방법을 적는다
//     (연장·야간·휴일근로는 그 시간 수를 포함). 매월 같은 고정급은 금액만 적어도 된다
//   - 근로기준법 제11조·시행령 별표 1: 상시 5명 미만은 제56조(가산 50%)·제60조(연차)·제55조제2항(공휴일 유급) 미적용, 주휴는 적용
//   - 기간제법 제6조: 단시간근로자 소정근로 초과분 50% 가산, 상시 4명 이하 미적용
//   - 소득세법 제47조제2항·제59조제3항·제86조: 일용근로소득세 = (일급 − 15만원) × 6% × 45%, 1천원 미만 소액부징수
//   - 소득세법 제129조제1항제3호, 시행령 제149조의3: 인적용역 사업소득 3%(+지방소득세 0.3%), 소액부징수 없음
//
// 세금·보험료 금액은 세무사·노무사가 계산한 값을 그대로 쓴다. 여기서는 금액을 바꾸지 않고
// ① 명세서에 적을 계산방법 문구를 만들고 ② 담당자가 한 번 볼 만한 '기재 확인' 메모만 만든다.
// 메모는 스키마(Issue)에 넣지 않는다(IssueCode를 늘리려면 스키마 PR이 필요해서). 발송을 막지 않는다.
import type { EmployeePay, PayItem, PayrollBatch } from "@/types/payroll";

export const WAGE_STATEMENT_RULES_CHECKED_AT = "2026-11-24";

/** 기본 관리에서 고르는 상시근로자 수. "자동"이면 이번 급여대장 인원으로 추정한다 */
export type HeadcountSetting = "자동" | "5이상" | "5미만";
export type Headcount = "5이상" | "5미만";

export type StatementContext = {
  headcount: Headcount;
  /** 이 직원이 임직원 관리에서 사업소득(3.3%)으로 정해졌는지 */
  businessIncome: boolean;
};

export type StatementNote = {
  level: "warning" | "info";
  message: string;
  /** 하이라이트할 항목 "earnings.0" */
  field?: string;
};

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const num = (n: number) => (Number.isInteger(n) ? n.toLocaleString("ko-KR") : n.toLocaleString("ko-KR", { maximumFractionDigits: 2 }));
const sum = (xs: { amount: number }[]) => xs.reduce((a, b) => a + b.amount, 0);

/**
 * 상시근로자 수 판단.
 * 법은 '사유 발생일 전 1개월 연인원 ÷ 가동일수'로 세지만(시행령 제7조의2), 급여대장만으로는 알 수 없어서
 * "자동"일 때는 이번 급여대장 인원(일용·단시간 포함)으로 추정한다. 강사·사업소득자(3.3%)는 근로자가 아니라 빼고 센다.
 */
export function resolveHeadcount(
  setting: HeadcountSetting | undefined,
  batch: Pick<PayrollBatch, "employees">,
  isBusinessIncome: (e: EmployeePay) => boolean = () => false,
): { value: Headcount; estimated: boolean; count: number } {
  const count = batch.employees.filter((e) => e.employmentType !== "강사" && !isBusinessIncome(e)).length;
  if (setting === "5이상" || setting === "5미만") return { value: setting, estimated: false, count };
  return { value: count >= 5 ? "5이상" : "5미만", estimated: true, count };
}

/** 근로형태 정리. 원본에 없으면 시급·근로시간으로 짐작한다 */
function kindOf(e: EmployeePay): "정규" | "시급" | "일용" | "강사" | "기타" {
  if (e.employmentType) return e.employmentType;
  if (e.workInfo?.hourlyWage) return "시급";
  return "정규";
}

/** 근로기준법상 근로자로 보는지 (3.3% 사업소득이면 임금명세서 대상이 아니다) */
export function isBusinessIncome(e: EmployeePay, ctx: StatementContext): boolean {
  return ctx.businessIncome || kindOf(e) === "강사";
}

/**
 * 지급 항목 하나의 계산방법 문구. 고정급처럼 계산방법이 필요 없거나, 급여대장에 시간·일수가 없어 만들 수 없으면 undefined.
 * 명세서 카드에서 항목 이름 아래에 작게 보여 준다.
 */
export function calcMethodOf(item: PayItem, e: EmployeePay, ctx: StatementContext): string | undefined {
  const w = e.workInfo ?? {};
  const kind = kindOf(e);
  const rate = w.hourlyWage;
  const mult = ctx.headcount === "5이상" ? 1.5 : 1;
  const multText = mult === 1.5 ? " × 1.5" : "";

  switch (item.category) {
    case "기본급":
      if (kind === "시급" && w.workHours && rate) return `${num(w.workHours)}시간 × 시급 ${won(rate)}`;
      if (kind === "시급" && w.workHours) return `${num(w.workHours)}시간 × 시급 ${won(item.amount / w.workHours)}`;
      if (kind === "일용" && w.workDays) return `${num(w.workDays)}일 × 일급 ${won(item.amount / w.workDays)}`;
      return undefined; // 월급제 고정급: 금액만 적는다
    case "강사료":
      if (w.workHours && rate) return `${num(w.workHours)}시간 × ${won(rate)}`;
      if (w.workHours) return `${num(w.workHours)}시간 × ${won(item.amount / w.workHours)}`;
      return undefined;
    case "연장근로수당":
      if (w.overtimeHours && rate) return `연장 ${num(w.overtimeHours)}시간 × 시급 ${won(rate)}${multText}`;
      if (w.overtimeHours) return `연장 ${num(w.overtimeHours)}시간 × 통상시급${multText}`;
      return undefined;
    default:
      return undefined;
  }
}

/** 일용근로소득 원천징수 소득세 (지급 1건 기준). 근무일수가 없으면 하루분으로 본다 */
export function dailyWorkerTax(taxablePay: number, days = 1): { incomeTax: number; localTax: number } {
  const base = Math.max(0, taxablePay - 150_000 * days);
  // 산출세액 × (1 − 55%) = 과세분 × 2.7%. 국고금 끝수(10원 미만 버림)
  let tax = Math.floor((base * 0.06 * 0.45) / 10) * 10;
  if (tax < 1000) tax = 0; // 소액부징수 (소득세법 제86조)
  return { incomeTax: tax, localTax: Math.floor(tax * 0.1 / 10) * 10 };
}

const INSURANCE = ["국민연금", "건강보험", "장기요양보험", "고용보험"] as const;
const TIME_PAY = ["연장근로수당", "야간근로수당", "휴일근로수당"] as const;

/** 담당자가 발송 전에 볼 '명세서 기재 확인' 메모 */
export function statementNotes(e: EmployeePay, ctx: StatementContext): StatementNote[] {
  const notes: StatementNote[] = [];
  const w = e.workInfo ?? {};
  const kind = kindOf(e);
  const field = (cat: string) => {
    const i = e.earnings.findIndex((it) => it.category === cat);
    return i >= 0 ? `earnings.${i}` : undefined;
  };
  const ded = (cat: string) => e.deductions.find((d) => d.category === cat)?.amount ?? 0;

  // ---- 3.3% 사업소득자 ----
  if (isBusinessIncome(e, ctx)) {
    const pay = sum(e.earnings);
    const tax = ded("소득세");
    const expected = Math.floor((pay * 0.03) / 10) * 10;
    if (tax > 0 && Math.abs(tax - expected) > 10) {
      notes.push({ level: "warning", message: `사업소득 원천징수 소득세는 지급액의 3%(${won(expected)})인데 ${won(tax)}이 공제됐어요. 작성한 사무소에 확인해 주세요(소득세법 제129조).` });
    }
    const ins = INSURANCE.filter((c) => ded(c) > 0);
    if (ins.length > 0) {
      notes.push({
        level: "info",
        message: `사업소득자인데 ${ins.join("·")}가 공제됐어요. 노무제공자 고용·산재보험이면 정상이지만, 그 외에는 실제로 근로자처럼 일하는지(사용종속관계) 다시 봐 주세요. 근로자라면 임금명세서·4대보험 의무가 생겨요.`,
      });
    }
    return notes; // 아래는 근로자에게만 해당
  }

  // ---- 연장·야간·휴일: 시간 수를 적어야 한다 ----
  for (const cat of TIME_PAY) {
    const f = field(cat);
    if (!f) continue;
    // 야간·휴일 시간은 스키마(workInfo)에 칸이 없어 아직 급여대장에서 읽지 않는다
    if (cat !== "연장근로수당") {
      notes.push({
        level: "info",
        field: f,
        message: `${cat}은 임금명세서 계산방법에 그 달의 시간 수를 넣어야 해요(시행령 제27조의2 제5호). 지금은 급여대장의 야간·휴일 시간 열을 읽지 않으니, 원본에 시간이 있는지 확인해 주세요.`,
      });
      continue;
    }
    if (!w.overtimeHours) {
      const fixed = e.earnings.some((it) => it.category === cat && /고정|정액|포괄/.test(it.label));
      notes.push({
        level: fixed ? "info" : "warning",
        field: f,
        message: fixed
          ? `${cat}이 고정(정액)으로 보여요. 해당 시간 수를 적는 게 바람직하고, 취업규칙·근로계약에 시간이 적혀 있으면 생략할 수 있어요. 실제 시간이 약정보다 많아 차액을 줬다면 그 시간은 꼭 적어 주세요(근로기준정책과-818).`
          : `${cat}이 있는데 급여대장에 그 달의 시간 수가 없어요. 임금명세서 계산방법에 시간 수를 넣어야 해요(시행령 제27조의2 제5호).`,
      });
    }
  }

  // ---- 5명 미만: 가산·연차·공휴일 유급이 법정 항목이 아니다 ----
  if (ctx.headcount === "5미만") {
    const extra = e.earnings.filter((it) => TIME_PAY.includes(it.category as (typeof TIME_PAY)[number]) || /연차/.test(it.label));
    if (extra.length > 0) {
      notes.push({
        level: "info",
        message: `상시 5명 미만 사업장이라 ${extra.map((it) => it.label).join("·")}의 50% 가산·연차수당은 법정 의무가 아니에요. 약정으로 주는 거라면 지금처럼 금액과 계산방법을 적으면 돼요(근로기준법 제11조, 시행령 별표 1).`,
      });
    }
  }

  // ---- 시급제: 기본급 계산방법(시간 × 시급) ----
  if (kind === "시급") {
    const f = field("기본급");
    if (f && !w.workHours) {
      notes.push({ level: "warning", field: f, message: "시급제인데 급여대장에 근로시간이 없어 기본급 계산방법(시간 × 시급)을 만들지 못했어요. 시간을 확인해 주세요." });
    }
  }

  // ---- 월급제: 일할계산·결근공제 달은 계산방법이 필요하다 ----
  if (kind === "정규") {
    const prorated = e.earnings.find((it) => it.category === "기본급" && /일할|결근|중도/.test(it.label));
    const absence = e.deductions.find((it) => /결근|지각|조퇴/.test(it.label));
    if (prorated || absence) {
      notes.push({
        level: "warning",
        message: "이번 달은 일할계산·결근공제가 있어 기본급이 출근일수에 따라 달라졌어요. 이런 달은 계산방법(일수 등)을 명세서에 적어야 해요.",
      });
    }
  }

  // ---- 단시간: 월 60시간 미만이면 4대보험 원칙적 제외 ----
  const monthlyHours = w.workHours;
  if (kind !== "일용" && monthlyHours && monthlyHours < 60) {
    const ins = (["국민연금", "건강보험"] as const).filter((c) => ded(c) > 0);
    if (ins.length > 0) {
      notes.push({
        level: "info",
        message: `월 근로시간이 ${num(monthlyHours)}시간(60시간 미만)인데 ${ins.join("·")}가 공제됐어요. 3개월 이상 근로·본인 희망·소득 기준 등 예외일 수 있으니 맞는지만 확인해 주세요.`,
      });
    }
  }

  // ---- 일용근로자: 일용근로소득세 검산, 지급할 때마다 교부 ----
  if (kind === "일용") {
    const taxable = e.earnings.filter((it) => !it.taxFree).reduce((a, b) => a + b.amount, 0);
    const days = w.workDays ?? 1;
    const { incomeTax } = dailyWorkerTax(taxable, days);
    const tax = ded("소득세");
    if (Math.abs(tax - incomeTax) > 10) {
      notes.push({
        level: "warning",
        message: `일용근로소득세를 다시 계산하면 ${won(incomeTax)}인데 급여대장은 ${won(tax)}이에요(${w.workDays ? `${num(days)}일` : "하루분으로 가정"}, (일급 − 15만원) × 2.7%, 1천원 미만 소액부징수). 작성한 사무소에 확인해 주세요.`,
      });
    }
    for (const c of ["국민연금", "건강보험", "장기요양보험"] as const) {
      if (ded(c) > 0) {
        notes.push({ level: "info", message: `일용근로자에게 ${c}가 공제됐어요. 1개월 이상 계속 일했다면 정상일 수 있어요. 1개월 미만이면 보통 제외돼요.` });
        break;
      }
    }
    notes.push({ level: "info", message: "일용근로자는 임금을 줄 때마다 명세서를 줘야 해요. 매일 주면 매일, 주 단위로 주면 그때마다예요(근로기준법 제48조 제2항)." });
  }

  return notes;
}

/** 명세서 하단에 붙이는 한 줄 안내 (사업장 규모에 따른 가산율 표시) */
export function overtimeRuleText(e: EmployeePay, ctx: StatementContext): string | undefined {
  if (isBusinessIncome(e, ctx)) return undefined;
  const hasTimePay = e.earnings.some((it) => TIME_PAY.includes(it.category as (typeof TIME_PAY)[number]));
  if (!hasTimePay) return undefined;
  // 5명 이상은 가산율을 적어야 하고, 5명 미만은 법정 가산이 없어 적지 않는다
  return ctx.headcount === "5이상" ? "연장·야간·휴일근로 가산율: 통상임금의 50%" : undefined;
}
