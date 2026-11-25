// 직원 본인 확인. 명세서 링크를 받은 사람이 직원 본인인지 비밀번호로 확인한다.
// 비밀번호는 생년월일 8자리(예: 19xx.xx.xx → 숫자 8자리) 또는 휴대폰 번호 뒤 4자리 중 아무거나 맞으면 된다. (어느 쪽으로 확정할지는 논의 중)
// 생년월일은 급여대장 파일에 있으면 그 값, 없으면 임직원 관리 명부(자버 직원연락처)의 값을 쓴다. 휴대폰 번호는 매칭된 직원연락처·명부의 값을 쓴다. 여러 개면 어느 쪽이든 맞으면 된다.
// (시연: 확인은 브라우저 안에서 한다. 실제 서비스에서는 서버에서 확인해야 정보가 새지 않는다)

const digits = (s: string) => s.replace(/\D/g, "");

/** 본인 확인에 쓸 수 있는 생년월일(8자리) 목록. 읽을 수 없는 표기나 빈 값은 뺀다 */
export function birthCandidates(...sources: (string | undefined)[]): string[] {
  const list = sources.map((s) => digits(s ?? "")).filter((d) => d.length === 8);
  return [...new Set(list)];
}

/** 입력한 8자리가 생년월일 중 하나와 맞는지. 19xxxxxx · 19xx-xx-xx · 19xx.xx.xx 표기는 같은 값으로 본다 */
export function matchesBirth(candidates: string[], input: string): boolean {
  return candidates.includes(digits(input));
}

/** 본인 확인에 쓸 수 있는 휴대폰 번호 뒤 4자리 목록. 숫자가 4자리 미만인 번호나 빈 값은 뺀다 */
export function phoneTailCandidates(...sources: (string | undefined)[]): string[] {
  const list = sources.map((s) => digits(s ?? "")).filter((d) => d.length >= 4).map((d) => d.slice(-4));
  return [...new Set(list)];
}

/** 입력한 값이 생년월일 8자리이거나 휴대폰 번호 뒤 4자리와 맞는지 */
export function matchesSecret(births: string[], phoneTails: string[], input: string): boolean {
  const d = digits(input);
  if (d.length === 8) return births.includes(d);
  if (d.length === 4) return phoneTails.includes(d);
  return false;
}
