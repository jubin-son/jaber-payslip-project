// 데이터 스키마: 1~2단계(파서)와 3~5단계(화면)를 잇는 약속.
// 노션 '데이터 스키마' 페이지와 항상 같아야 한다.
// 바꿀 때는 PR로 상대 승인을 받고, 노션 페이지 '변경 기록'에 한 줄 추가한다.
//
// 구조
// PayrollBatch (급여대장 파일 1개 × 사업장 1곳 × 귀속월 1개)
//  └─ employees: EmployeePay[] (직원 1명)
//      ├─ earnings: PayItem[]   지급 항목
//      ├─ deductions: PayItem[] 공제 항목
//      └─ issues: Issue[]       검산 오류·확인 필요
//
// 파일 하나에 사업장 여러 곳(여울담 묶음 파일)이나 여러 달(바로늘, 손맛여울,
// payroll_export)이 있으면 PayrollBatch를 여러 개로 나눈다.

export type PayrollBatch = {
  id: string;
  companyName: string; // 파일 안 표기 그대로
  companyCode?: string; // 자버 사업장코드 (매칭 결과)
  payPeriod: string; // 귀속월 "2026-11"
  payDate?: string; // 지급일 "2026-11-25"
  sourceFile: string; // 원본 파일명
  sourceSheet?: string; // 원본 시트명
  unit: "원" | "천원"; // 원본 단위 (금액은 항상 원으로 변환해서 저장)
  employees: EmployeePay[];
  issues: Issue[]; // 파일 단위 문제 (지급일 없음 등)
};

export type EmployeePay = {
  id: string;
  name: string; // 원본 표기 그대로
  employmentType?: "정규" | "시급" | "일용" | "강사" | "기타";
  department?: string;
  position?: string;
  employeeNo?: string; // 사번 (원본 표기 그대로, 같은 이름 구분용)
  birthDate?: string; // 생년월일 "1990-03-12" (읽을 수 없는 표기는 원본 그대로)
  hireDate?: string; // 입사일 "2023-04-01" (읽을 수 없는 표기는 원본 그대로)
  match?: EmployeeMatch; // 자버 직원연락처 매칭 결과
  earnings: PayItem[];
  deductions: PayItem[];
  totalEarnings: number; // 원본에 적힌 지급합계 (없으면 계산값)
  totalDeductions: number; // 원본에 적힌 공제합계 (없으면 계산값)
  netPay: number; // 원본에 적힌 실지급액 (없으면 계산값)
  workInfo?: {
    // 명세서에 넣을 근무 정보 (있으면)
    workDays?: number;
    workHours?: number;
    overtimeHours?: number;
    hourlyWage?: number;
  };
  issues: Issue[];
};

export type PayItem = {
  label: string; // 원본 표기 "기본급여", "국민연금(근로자)"
  category: PayCategory; // 표준 항목 (아래 목록)
  amount: number; // 원 단위
  taxFree?: boolean; // 비과세 여부 (식대 등)
  source?: SourceRef;
  edited?: { before: number; by: "user" }; // 담당자가 3단계 화면에서 고친 경우
};

export type SourceRef = {
  sheet?: string;
  cell?: string; // "E7" (엑셀·CSV)
  page?: number; // PDF 쪽
  text?: string; // PDF에서 읽은 원문
};

export type EmployeeMatch = {
  memberId?: string; // 자버 회원번호
  phone?: string;
  email?: string;
  kakaoConsent?: boolean; // 알림톡 수신동의 Y/N
  status: "matched" | "ambiguous" | "not_found";
  candidates?: string[]; // ambiguous일 때 후보 회원번호
};

export type Issue = {
  level: "error" | "warning" | "info";
  code: IssueCode;
  message: string; // 담당자에게 보여줄 문장
  field?: string; // 하이라이트할 위치 "earnings.0", "netPay"
};

export type IssueCode =
  | "SUM_MISMATCH" // 지급합계 ≠ 항목 합
  | "NET_MISMATCH" // 실지급 ≠ 지급 - 공제
  | "RATE_OUT_OF_RANGE" // 4대보험 요율이 이상함
  | "UNKNOWN_ITEM" // 표준 항목으로 분류 못 함
  | "LOW_CONFIDENCE" // AI가 확신이 낮음
  | "MATCH_NOT_FOUND" // 자버 직원 못 찾음
  | "MATCH_AMBIGUOUS" // 후보가 여러 명
  | "NO_CONSENT" // 알림톡 수신동의 N
  | "NO_PAY_DATE"; // 지급일 없음

// 표준 항목 (category)
// 원본 항목명은 사무소마다 달라도 이 값 중 하나로 분류한다.
// 분류가 안 되면 "기타지급"/"기타공제" + UNKNOWN_ITEM issue.

export const EARNING_CATEGORIES = [
  "기본급", // 기본급, 기본급여, 월급, Base Pay
  "연장근로수당", // 연장수당, 시간외수당, OT
  "야간근로수당", // 야간수당
  "휴일근로수당", // 휴일수당, 휴일근무수당
  "주휴수당", // 주휴수당
  "식대", // 식대, 식비, 중식대 (비과세)
  "차량유지비", // 자가운전보조금, 차량유지비 (비과세)
  "직책수당", // 직책수당, 직무수당
  "상여금", // 상여, 성과급, 인센티브
  "강사료", // 강사료, 시간강사료
  "기타지급", // 그 외
] as const;

export const DEDUCTION_CATEGORIES = [
  "국민연금", // 국민연금, 연금
  "건강보험", // 건강보험
  "장기요양보험", // 장기요양, 요양보험
  "고용보험", // 고용보험
  "소득세", // 소득세, 갑근세, 근로소득세
  "지방소득세", // 지방소득세, 주민세
  "기타공제", // 가불금, 경조회비 등
] as const;

export type EarningCategory = (typeof EARNING_CATEGORIES)[number];
export type DeductionCategory = (typeof DEDUCTION_CATEGORIES)[number];
export type PayCategory = EarningCategory | DeductionCategory;
