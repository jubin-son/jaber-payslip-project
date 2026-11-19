// 5단계 발송: 직원마다 알림톡(카톡)·메일로 보낼 수 있는지 판단하는 규칙.
// 직원 매칭 결과(EmployeePay.match)만 보고 판단한다. 스키마에 있는 칸만 쓴다.
import type { EmployeePay } from "@/types/payroll";

export type Channel = "kakao" | "mail";

export const CHANNEL_LABEL: Record<Channel, string> = { kakao: "알림톡", mail: "메일" };

export type Availability = { ok: true } | { ok: false; reason: string };

/** 자버 직원을 찾았는지. 찾지 못하면 연락처가 없어서 어느 쪽으로도 보낼 수 없다 */
function matchProblem(e: EmployeePay): string | null {
  const m = e.match;
  if (!m || m.status === "not_found") return "자버 직원을 찾지 못했어요";
  if (m.status === "ambiguous") return "같은 이름 후보가 여러 명이에요";
  return null;
}

export function availability(e: EmployeePay, channel: Channel): Availability {
  const problem = matchProblem(e);
  if (problem) return { ok: false, reason: problem };
  const m = e.match!;
  if (channel === "kakao") {
    if (!m.phone) return { ok: false, reason: "전화번호가 없어요" };
    if (m.kakaoConsent === false) return { ok: false, reason: "알림톡 수신에 동의하지 않았어요" };
    if (m.kakaoConsent === undefined) return { ok: false, reason: "알림톡 수신동의 정보가 없어요" };
    return { ok: true };
  }
  if (!m.email) return { ok: false, reason: "메일 주소가 없어요" };
  return { ok: true };
}

export type Pick = Record<Channel, boolean>;

/** 기본 선택: 알림톡이 되면 알림톡, 안 되면 메일, 둘 다 안 되면 보내지 않는다 */
export function defaultPick(e: EmployeePay): Pick {
  const kakao = availability(e, "kakao").ok;
  return { kakao, mail: !kakao && availability(e, "mail").ok };
}

/** 받는 곳 표시용. 전화번호·메일은 일부만 보여준다 */
export function maskPhone(p?: string): string {
  if (!p) return "-";
  const d = p.replace(/\D/g, "");
  return d.length >= 8 ? `${d.slice(0, 3)}-****-${d.slice(-4)}` : p;
}

export function maskEmail(m?: string): string {
  if (!m) return "-";
  const [id, host] = m.split("@");
  if (!host) return m;
  return `${id.slice(0, 2)}${"*".repeat(Math.max(id.length - 2, 1))}@${host}`;
}
