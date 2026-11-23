// 직원 본인 확인. 명세서 링크를 받은 사람이 직원 본인인지 생년월일 8자리(비밀번호)로 확인한다. 예: 19xx.xx.xx → 숫자 8자리
// 생년월일은 급여대장 파일에 있으면 그 값, 없으면 임직원 관리 명부(자버 직원연락처)의 값을 쓴다. 둘 다 있으면 어느 쪽이든 맞으면 된다.
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
