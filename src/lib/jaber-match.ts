// 2단계 정리 결과의 사업장·직원을 자버 등록 정보(사업장목록·직원연락처)와 맞춘다.
// 결과는 PayrollBatch.companyCode, EmployeePay.match와 매칭 관련 issue로 남긴다.
//
// 사업장 찾는 순서
//   1) 상호가 같다 (띄어쓰기·(주)·주식회사 무시)
//   2) 한쪽 상호가 다른 쪽을 품는다 ("말랑솔분식" ↔ "말랑솔분식 노량진점"). 후보가 하나일 때만
//   3) 상호로 못 찾으면(파일에 상호가 없어 파일 이름이 들어간 경우 등) 직원 이름이 절반 넘게 겹치는 사업장
// 직원 찾는 순서 (찾은 사업장 안에서만)
//   이름이 같다 (띄어쓰기·대소문자 무시) → 같은 이름이 여럿이면 생년월일로 가른다
//   생년월일이 양쪽에 다 있는데 다르면 다른 사람일 수 있으니 자동으로 붙이지 않는다
import type { EmployeePay, Issue, PayrollBatch } from "@/types/payroll";
import { jaberCompanies, jaberEmployees, type JaberCompany, type JaberEmployee } from "@/lib/jaber-db";

const MATCH_CODES: Issue["code"][] = ["MATCH_NOT_FOUND", "MATCH_AMBIGUOUS", "NO_CONSENT"];

/** 상호 비교용: 띄어쓰기·법인 표기·괄호 기호를 지운다 */
function normCompany(s: string): string {
  return s
    .replace(/\(주\)|㈜|주식회사|\(유\)|유한회사/g, "")
    .replace(/[\s()·.,_-]/g, "")
    .toLowerCase();
}

/** 이름 비교용: "임 상재" = "임상재", "NGUYEN THI HOA" = "Nguyen Thi Hoa" */
function normName(s: string): string {
  return s.replace(/\s+/g, "").toUpperCase();
}

/** 생년월일 표기를 "yyyy-mm-dd"로. "98.10.25", "03/05/1986"(미국식 월/일/년), "1974-03-13" */
export function normBirth(s?: string): string | undefined {
  if (!s) return undefined;
  const t = s.trim();
  let y: number, m: number, d: number;
  let r: RegExpMatchArray | null;
  if ((r = t.match(/^(\d{4})[-./ ]\s*(\d{1,2})[-./ ]\s*(\d{1,2})\.?$/))) [y, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) [y, m, d] = [+r[3], +r[1], +r[2]];
  else if ((r = t.match(/^(\d{2})[-./](\d{1,2})[-./](\d{1,2})\.?$/))) {
    // 두 자리 연도: 올해(26) 이하면 2000년대, 넘으면 1900년대
    y = +r[1] <= 26 ? 2000 + +r[1] : 1900 + +r[1];
    [m, d] = [+r[2], +r[3]];
  } else if ((r = t.match(/^(\d{2})(\d{2})(\d{2})$/))) {
    y = +r[1] <= 26 ? 2000 + +r[1] : 1900 + +r[1];
    [m, d] = [+r[2], +r[3]];
  } else return undefined;
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 글자 하나만 다른 이름 (오타 후보 안내용. 자동으로 붙이지는 않는다) */
function oneCharOff(a: string, b: string): boolean {
  if (a.length !== b.length || a === b) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++diff > 1) return false;
  return true;
}

function findCompany(b: PayrollBatch): { company?: JaberCompany; how?: "name" | "employees" } {
  const key = normCompany(b.companyName);
  if (key) {
    const exact = jaberCompanies.filter((c) => normCompany(c.name) === key);
    if (exact.length === 1) return { company: exact[0], how: "name" };
    const partial = jaberCompanies.filter((c) => {
      const k = normCompany(c.name);
      return k.includes(key) || key.includes(k);
    });
    if (partial.length === 1) return { company: partial[0], how: "name" };
  }
  // 상호로 못 찾으면 직원 이름이 가장 많이 겹치는 사업장 (절반 넘게 겹쳐야 인정)
  const names = new Set(b.employees.map((e) => normName(e.name)));
  if (names.size === 0) return {};
  let best: { c: JaberCompany; n: number } | undefined;
  let tie = false;
  for (const c of jaberCompanies) {
    const n = jaberEmployees.filter((e) => e.companyCode === c.code && names.has(normName(e.name))).length;
    if (!best || n > best.n) [best, tie] = [{ c, n }, false];
    else if (n === best.n) tie = true;
  }
  if (best && !tie && best.n * 2 > names.size) return { company: best.c, how: "employees" };
  return {};
}

function matchEmployee(e: EmployeePay, staff: JaberEmployee[]): { match: EmployeePay["match"]; issues: Issue[] } {
  const name = normName(e.name);
  const birth = normBirth(e.birthDate);
  const same = staff.filter((s) => normName(s.name) === name);
  // 생년월일이 양쪽에 다 있는데 다르면 같은 사람으로 보지 않는다
  const plausible = same.filter((s) => !birth || !s.birthDate || s.birthDate === birth);
  const byBirth = birth ? plausible.filter((s) => s.birthDate === birth) : [];
  const pick = plausible.length === 1 ? plausible[0] : byBirth.length === 1 ? byBirth[0] : undefined;

  if (pick) {
    const issues: Issue[] = [];
    if (!pick.kakaoConsent) {
      issues.push({ level: "info", code: "NO_CONSENT", message: "알림톡 수신에 동의하지 않은 직원이에요. 메일로 보내거나 따로 전달해 주세요." });
    }
    return {
      match: { status: "matched", memberId: pick.memberId, phone: pick.phone, email: pick.email, kakaoConsent: pick.kakaoConsent },
      issues,
    };
  }
  if (plausible.length > 1) {
    return {
      match: { status: "ambiguous", candidates: plausible.map((s) => s.memberId) },
      issues: [
        {
          level: "warning",
          code: "MATCH_AMBIGUOUS",
          message: `자버에 같은 이름(${e.name})이 ${plausible.length}명 있어요(회원번호 ${plausible.map((s) => s.memberId).join(", ")}). 생년월일로도 가를 수 없어 누구인지 확인이 필요해요.`,
        },
      ],
    };
  }
  let why = "자버 직원연락처에 이 이름이 없어요. 사업장에 직원 등록을 요청해 주세요.";
  if (same.length > 0) {
    why = `자버에 같은 이름이 있지만 생년월일이 달라요(파일 ${birth}, 자버 ${same.map((s) => s.birthDate).join(", ")}). 같은 사람인지 확인해 주세요.`;
  } else {
    const near = staff.filter((s) => oneCharOff(normName(s.name), name));
    if (near.length > 0) {
      why = `자버 직원연락처에 이 이름이 없어요. 비슷한 이름 ${near.map((s) => `${s.name}(${s.memberId})`).join(", ")}이 있어요. 오타인지 확인해 주세요.`;
    }
  }
  return { match: { status: "not_found" }, issues: [{ level: "warning", code: "MATCH_NOT_FOUND", message: why }] };
}

/** 배치마다 자버 사업장을 찾고, 직원마다 자버 직원을 찾아 match와 issue를 채운다 (배치를 직접 고친다) */
export function matchJaber(batches: PayrollBatch[]): void {
  for (const b of batches) {
    const { company, how } = findCompany(b);
    b.issues = b.issues.filter((i) => !MATCH_CODES.includes(i.code));
    if (!company) {
      b.companyCode = undefined;
      b.issues.push({
        level: "warning",
        code: "MATCH_NOT_FOUND",
        message: `자버에 가입한 사업장 중 '${b.companyName}'을(를) 찾지 못했어요. 직원 연락처를 가져올 수 없어요.`,
      });
      for (const e of b.employees) {
        e.issues = e.issues.filter((i) => !MATCH_CODES.includes(i.code));
        e.match = { status: "not_found" };
      }
      continue;
    }
    b.companyCode = company.code;
    // 파일에 상호가 없어서(파일 이름 등) 직원으로 찾은 경우에는 자버에 등록된 상호를 쓴다
    if (how === "employees") b.companyName = company.name;
    const staff = jaberEmployees.filter((s) => s.companyCode === company.code);
    for (const e of b.employees) {
      const { match, issues } = matchEmployee(e, staff);
      e.match = match;
      e.issues = [...e.issues.filter((i) => !MATCH_CODES.includes(i.code)), ...issues];
    }
  }
}
