// 자버에 등록된 사업장·직원 정보(앱 안 데이터 파일).
// 원본: 자버 관리자 화면에서 내려받은 엑셀(2026-11-30 기준). 다시 만들려면
//   npx tsx scripts/import-jaber-registry.ts <사업장목록.xlsx> <직원연락처.xlsx>
// 나중에 저장소(Supabase)를 붙이면 이 파일의 함수만 바꾸면 된다.
import companiesJson from "@/data/jaber/companies.json";
import employeesJson from "@/data/jaber/employees.json";

/** 자버에 가입한 사업장 (사업장목록 1행) */
export type JaberCompany = {
  code: string; // 사업장코드 "JB-1037"
  name: string; // 자버에 등록한 상호. 급여대장 안의 표기와 다를 수 있다
  owner: string; // 대표자
  bizRegNo: string; // 사업자등록번호 "000-00-00000"
  industry?: string; // 업종
  address?: string; // 사업장 주소(번지 일부 가림)
  ownerPhone?: string; // 대표자 휴대전화
  payrollWriter: "세무사" | "노무사" | "사장"; // 급여대장을 만드는 주체
  payrollOffice?: string; // 급여대장 작성 사무소(사장이 직접 만들면 없음)
  joinedAt: string; // 자버 가입일 "yyyy-mm-dd"
};

/** 직원에게 주는 돈의 소득 구분. 근로소득은 4대보험·근로소득세, 사업소득은 3.3% 원천징수(프리랜서·강사) */
export type IncomeType = "근로소득" | "사업소득";
export const INCOME_TYPES: IncomeType[] = ["근로소득", "사업소득"];

/** 사업장이 자버에 등록한 직원 (직원연락처 1행) */
export type JaberEmployee = {
  memberId: string; // 회원번호
  companyCode: string; // 사업장코드
  companyName: string; // 사업장명(=사업장목록의 상호)
  name: string; // 직원명. 담당자가 입력한 표기 그대로
  birthDate?: string; // 생년월일(선택 입력)
  phone?: string; // 휴대전화. 담당자가 입력한 형식 그대로
  email?: string; // 이메일(선택 입력)
  address?: string; // 주소(임직원 관리에서 입력. 자버 직원연락처 원본에는 없음)
  kakaoConsent: boolean; // 알림톡 수신동의 Y → true
  incomeType?: IncomeType; // 소득 구분(임직원 관리에서 입력). 없으면 근로소득
  registeredAt: string; // 등록일
};

export const jaberCompanies = companiesJson as JaberCompany[];
export const jaberEmployees = employeesJson as JaberEmployee[];

export function findCompany(code: string): JaberCompany | undefined {
  return jaberCompanies.find((c) => c.code === code);
}

export function employeesOf(companyCode: string): JaberEmployee[] {
  return jaberEmployees.filter((e) => e.companyCode === companyCode);
}
