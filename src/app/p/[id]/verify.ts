// 직원 본인 확인. 명세서 링크를 받은 사람이 직원 본인인지 생년월일 8자리(비밀번호)로 확인한다. 예: 1990년 3월 12일 → 19900312
// (시연: 확인은 브라우저 안에서 한다. 실제 서비스에서는 서버에서 확인해야 정보가 새지 않는다)
import type { EmployeePay } from "@/types/payroll";

const digits = (s: string) => s.replace(/\D/g, "");

/** 본인 확인에 쓸 생년월일(8자리)이 있는지. 읽을 수 없는 표기였거나 비어 있으면 열 수 없다 */
export function canVerify(e: Pick<EmployeePay, "birthDate">): boolean {
  return digits(e.birthDate ?? "").length === 8;
}

/** 입력한 8자리가 생년월일과 맞는지. 19900312 · 1990-03-12 · 1990.03.12 모두 같은 값으로 본다 */
export function matchesIdentity(e: Pick<EmployeePay, "birthDate">, input: string): boolean {
  return canVerify(e) && digits(input) === digits(e.birthDate ?? "");
}
