// 열 이름(원본 표기) → 역할 사전.
// 노션 '데이터 스키마'의 표준 항목 표와 원본 급여대장 15개에 실제로 나온 표기를 모았다.
// 여기서 못 찾은 열은 위치(지급/공제 구역)로 추정하고, 나중에 AI가 다시 확인한다.
import type { DeductionCategory, EarningCategory } from "@/types/payroll";

export type ColumnRole =
  | { kind: "name" }
  | { kind: "earning"; category: EarningCategory; taxFree?: boolean }
  | { kind: "deduction"; category: DeductionCategory }
  | { kind: "totalEarnings" }
  | { kind: "totalDeductions" }
  | { kind: "netPay" }
  | { kind: "workDays" }
  | { kind: "workHours" }
  | { kind: "overtimeHours" }
  | { kind: "hourlyWage" }
  | { kind: "employmentType" }
  | { kind: "department" }
  | { kind: "position" }
  | { kind: "payPeriod" }
  | { kind: "payDate" }
  | { kind: "ignore" };

/** 공백·줄바꿈·괄호 설명을 지우고 소문자로. "소득세(3%)" → "소득세", "생년⏎월일" → "생년월일" */
export function normalizeLabel(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/\(.*?\)/g, "")
    .replace(/[\s.:：·_\-]/g, "")
    .toLowerCase();
}

const E = (category: EarningCategory, taxFree?: boolean): ColumnRole => ({ kind: "earning", category, taxFree });
const D = (category: DeductionCategory): ColumnRole => ({ kind: "deduction", category });

const TABLE: [string[], ColumnRole][] = [
  [["성명", "사원명", "이름", "직원명", "name"], { kind: "name" }],

  // 지급 항목
  [["기본급", "기본급여", "본봉", "월급여", "base", "basepay", "시급제급여"], E("기본급")],
  [["연장수당", "연장근로수당", "시간외수당", "otpay", "고정연장"], E("연장근로수당")],
  [["야간수당", "야간근로수당", "nightpay"], E("야간근로수당")],
  [["휴일수당", "휴일근로수당", "휴일근무수당"], E("휴일근로수당")],
  [["주휴수당", "주휴", "wklyholpay"], E("주휴수당")],
  [["식대", "식비", "중식대", "중식비", "meal"], E("식대", true)],
  [["차량유지비", "자가운전", "자가운전보조금"], E("차량유지비", true)],
  [["직책수당", "직무수당"], E("직책수당")],
  [["상여", "상여금", "성과급", "인센티브", "bonus"], E("상여금")],
  [["강사료", "시간강사료"], E("강사료")],

  // 공제 항목
  [["국민연금", "연금", "np"], D("국민연금")],
  [["건강보험", "nhi"], D("건강보험")],
  [["장기요양", "장기요양보험", "장기요양보험료", "요양", "요양보험", "ltci"], D("장기요양보험")],
  [["고용보험", "ei"], D("고용보험")],
  [["소득세", "갑근세", "근로소득세", "inctax"], D("소득세")],
  [["지방소득세", "주민세", "지방세", "localtax"], D("지방소득세")],
  [["가불", "가불금", "건강정산", "요양정산", "기타공제", "학자금", "경조회비", "otherded"], D("기타공제")],

  // 합계
  [["지급액계", "지급합계", "지급총액", "총지급액", "급여총액", "총액", "gross", "지급액"], { kind: "totalEarnings" }],
  [["공제액계", "공제합계", "공제총액", "총공제액", "공제계", "totalded"], { kind: "totalDeductions" }],
  [["차인지급액", "실지급액", "실지급", "차감지급액", "실수령액", "실수령", "입금액", "netpay"], { kind: "netPay" }],

  // 명세서에 넣을 근무 정보
  [["근무일수"], { kind: "workDays" }],
  [["근로시간", "근무시간", "월시간", "총근로시간", "총근무시간", "월근로시간", "reghrs", "강의시간"], { kind: "workHours" }],
  [["연장시간", "연장", "othrs"], { kind: "overtimeHours" }],
  [["시급", "rate", "시간당강사료"], { kind: "hourlyWage" }],
  [["구분", "급여형태", "근무형태", "paytype", "임금형태"], { kind: "employmentType" }],
  [["부서"], { kind: "department" }],
  [["직위", "직무", "직종", "position", "과목"], { kind: "position" }],
  [["payperiod", "귀속월"], { kind: "payPeriod" }],
  [["paydate"], { kind: "payDate" }],

  // 금액이 아닌 열
  [
    [
      "사원코드", "사번", "no", "empno", "생년월일", "dob", "입사일", "입사", "퇴사일", "비고", "메모",
      "근무일자", "일당", "비과세", "과세소득", "주시간", "주근무시간", "주휴시간", "야간시간", "휴일근로시간",
      "휴일", "야간", "nighthrs", "정상", "나하고전송현황", "항목",
    ],
    { kind: "ignore" },
  ],
];

const MAP = new Map<string, ColumnRole>();
for (const [labels, role] of TABLE) for (const l of labels) MAP.set(normalizeLabel(l), role);

export function lookupRole(label: unknown): ColumnRole | undefined {
  const n = normalizeLabel(label);
  if (!n) return undefined;
  return MAP.get(n);
}

/** 여러 열 위에 걸친 묶음 머리글 */
const GROUP_WORDS: Record<string, "earning" | "deduction" | "other"> = {
  지급: "earning",
  지급내역: "earning",
  지급항목: "earning",
  공제: "deduction",
  공제내역: "deduction",
  공제항목: "deduction",
  근태: "other",
  인적사항: "other",
  기본사항: "other",
};

export function groupOf(label: unknown): "earning" | "deduction" | "other" | undefined {
  return GROUP_WORDS[normalizeLabel(label)];
}

export const isAmountRole = (r: ColumnRole | undefined) =>
  !!r && (r.kind === "earning" || r.kind === "deduction" || r.kind === "totalEarnings" || r.kind === "totalDeductions" || r.kind === "netPay");
