// 열 이름(원본 표기) → 역할 사전.
// 노션 '데이터 스키마'의 표준 항목 표와 원본 급여대장 15개에 실제로 나온 표기를 모았다.
// 여기서 못 찾은 열은 위치(지급/공제 구역)로 추정하고, 나중에 AI가 다시 확인한다.
import { EARNING_CATEGORIES, type DeductionCategory, type EarningCategory, type PayCategory } from "@/types/payroll";

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
  | { kind: "position"; fallback?: boolean } // fallback: 다른 직위 열이 비어 있을 때만 쓴다
  | { kind: "employeeNo" }
  | { kind: "birthDate" }
  | { kind: "hireDate" }
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
  // 연구활동비는 일부러 넣지 않았다: 중소·벤처기업 부설연구소 연구원 등 요건을 갖춘 경우만 비과세라
  // 열 이름만으로 비과세로 읽으면 틀릴 수 있다. '분류 못 함' 경고를 보고 해당 사업장만 기본 관리에서
  // '기타지급 + 비과세'로 연결한다 (연결하면 tax-free.ts의 월 20만원 한도 확인도 적용된다).

  // 공제 항목
  [["국민연금", "연금", "np"], D("국민연금")],
  [["건강보험", "nhi"], D("건강보험")],
  [["장기요양", "장기요양보험", "장기요양보험료", "요양", "요양보험", "ltci"], D("장기요양보험")],
  [["고용보험", "ei"], D("고용보험")],
  [["소득세", "갑근세", "근로소득세", "inctax"], D("소득세")],
  [["지방소득세", "주민세", "지방세", "localtax"], D("지방소득세")],
  // 연말정산 정산분: 소득세·지방소득세 항목으로 읽는다(환급이면 음수). 이름은 원본 그대로 남아 명세서에 따로 보인다
  [["연말정산소득세", "정산소득세", "연말정산갑근세", "연말정산", "연말정산분소득세"], D("소득세")],
  [["연말정산지방소득세", "정산지방소득세", "연말정산주민세", "연말정산지방세"], D("지방소득세")],
  [["가불", "가불금", "건강정산", "요양정산", "기타공제", "학자금", "경조회비", "otherded"], D("기타공제")],

  // 합계
  [["지급액계", "지급계", "지급합계", "지급총액", "총지급액", "급여총액", "임금총액", "총액", "gross", "지급액"], { kind: "totalEarnings" }],
  [["공제액계", "공제합계", "공제총액", "총공제액", "공제계", "totalded"], { kind: "totalDeductions" }],
  [["차인지급액", "실지급액", "실지급", "차감지급액", "실수령액", "실수령", "입금액", "netpay"], { kind: "netPay" }],

  // 명세서에 넣을 근무 정보
  [["근무일수", "근로일수", "출근일수"], { kind: "workDays" }],
  [["근로시간", "근무시간", "월시간", "총근로시간", "총근무시간", "월근로시간", "reghrs", "강의시간"], { kind: "workHours" }],
  [["연장시간", "연장", "othrs"], { kind: "overtimeHours" }],
  [["시급", "rate", "시간당강사료"], { kind: "hourlyWage" }],
  [["구분", "급여형태", "근무형태", "paytype", "임금형태"], { kind: "employmentType" }],
  [["부서"], { kind: "department" }],
  [["직위", "직무", "직종", "position", "과목"], { kind: "position" }],
  // 직급: 법인 급여대장은 '직위' 대신 '직급'(대표이사·팀장·사원 등)을 쓰는 경우가 많다.
  // 직위와 둘 다 있으면 직급은 등급(3급, P2 등)일 수 있어서 직위를 먼저 쓴다 (열 순서와 상관없이)
  [["직급"], { kind: "position", fallback: true }],
  [["사원코드", "사번", "empno", "사원번호"], { kind: "employeeNo" }],
  [["생년월일", "dob", "생일"], { kind: "birthDate" }],
  [["입사일", "입사일자", "입사"], { kind: "hireDate" }],
  [["payperiod", "귀속월"], { kind: "payPeriod" }],
  [["paydate"], { kind: "payDate" }],

  // 금액이 아닌 열
  [
    [
      "no", "퇴사일", "비고", "메모",
      "근무일자", "일당", "비과세", "과세소득", "주시간", "주근무시간", "주휴시간", "야간시간", "휴일시간", "휴일근로시간",
      "휴일", "야간", "nighthrs", "정상", "나하고전송현황", "항목",
    ],
    { kind: "ignore" },
  ],
];

const MAP = new Map<string, ColumnRole>();
for (const [labels, role] of TABLE) for (const l of labels) MAP.set(normalizeLabel(l), role);

/** 기본 관리에서 담당자가 직접 연결한 항목. 기본 사전보다 먼저 본다 */
const CUSTOM = new Map<string, ColumnRole>();

/** 기본 관리의 '엑셀 항목 연결'을 사전에 반영한다. 정리(extractFiles) 전에 부른다 */
export function setCustomLinks(links: { label: string; category: PayCategory | "무시"; taxFree?: boolean }[]) {
  CUSTOM.clear();
  for (const l of links) {
    const n = normalizeLabel(l.label);
    if (!n) continue;
    if (l.category === "무시") CUSTOM.set(n, { kind: "ignore" });
    // 비과세 표시는 지급 항목에만 붙인다 (검산에서 과세 금액을 셀 때 빠진다)
    else if ((EARNING_CATEGORIES as readonly string[]).includes(l.category)) CUSTOM.set(n, E(l.category as EarningCategory, l.taxFree || undefined));
    else CUSTOM.set(n, D(l.category as DeductionCategory));
  }
}

export function lookupRole(label: unknown): ColumnRole | undefined {
  const n = normalizeLabel(label);
  if (!n) return undefined;
  return CUSTOM.get(n) ?? MAP.get(n);
}

/** 기본 사전이 이 표준 항목으로 읽는 원본 표기들 (기본 관리 화면 안내용) */
export function builtinLabelsOf(category: PayCategory): string[] {
  return TABLE.filter(([, r]) => (r.kind === "earning" || r.kind === "deduction") && r.category === category).flatMap(([ls]) => ls);
}

/** 기본 사전에서 이 표기를 무엇으로 읽는지 (없으면 undefined) */
export function builtinRoleOf(label: string): ColumnRole | undefined {
  return MAP.get(normalizeLabel(label));
}

export type GroupKind = "earning" | "deduction" | "employer" | "other";

/** 여러 열 위에 걸친 묶음 머리글 */
const GROUP_WORDS: Record<string, GroupKind> = {
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

export function groupOf(label: unknown): GroupKind | undefined {
  const n = normalizeLabel(label);
  if (!n) return undefined;
  if (GROUP_WORDS[n]) return GROUP_WORDS[n];
  if (lookupRole(label)) return undefined; // '지급합계'처럼 그 자체가 열 이름이면 묶음이 아니다
  // 노무사 임금대장: "사업주 부담분", "회사부담 4대보험" 아래 열은 직원 공제가 아니다
  if (/(사업주|회사|사용자|기관|법인)부담/.test(n)) return "employer";
  // "근로자 공제내역", "지급 내역(과세)" 같은 변형
  if (/공제(내역|항목)$/.test(n)) return "deduction";
  if (/지급(내역|항목)$/.test(n)) return "earning";
  return undefined;
}

export const isAmountRole = (r: ColumnRole | undefined) =>
  !!r && (r.kind === "earning" || r.kind === "deduction" || r.kind === "totalEarnings" || r.kind === "totalDeductions" || r.kind === "netPay");
