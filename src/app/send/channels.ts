// 발송 관리: 직원마다 알림톡(카톡)·메일로 보낼 수 있는지 판단하는 규칙.
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
  if (!m.email) return { ok: false, reason: "메일 주소가 없어요 (임직원 관리에서 추가)" };
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

export type UnsentReason = {
  /** 왜 못 보냈는지 (알림톡·메일 각각) */
  reasons: string[];
  /** 담당자가 할 일 안내. 보낼 수 있는 상태면 비어 있다 */
  guide?: string;
  /** 고치러 가는 화면 */
  fixHref?: string;
};

/** 아직 한 곳도 못 보낸 직원의 미발송 사유와 안내 */
export function unsentReason(e: EmployeePay): UnsentReason {
  const kakao = availability(e, "kakao");
  const mail = availability(e, "mail");
  if (kakao.ok || mail.ok) {
    return { reasons: ["아직 발송하지 않았어요"], guide: "‘발송하기’에서 보낼 곳을 고르고 발송해 주세요.", fixHref: "/send" };
  }
  const problem = matchProblem(e);
  if (problem) {
    return {
      reasons: [problem],
      guide: "임직원 관리에서 이 직원을 등록하거나 이름·생년월일을 확인하면 연락처가 이어져요.",
      fixHref: "/employees",
    };
  }
  const reasons = [`알림톡: ${kakao.ok ? "" : kakao.reason}`, `메일: ${mail.ok ? "" : mail.reason}`];
  const m = e.match!;
  const todo: string[] = [];
  if (!m.phone) todo.push("전화번호");
  if (!m.email) todo.push("메일 주소");
  const guide =
    todo.length > 0
      ? `임직원 관리에서 ${todo.join("·")}를 추가해 주세요.${m.phone && m.kakaoConsent !== true ? " (알림톡은 수신동의도 필요해요)" : ""}`
      : "알림톡 수신동의를 받거나 임직원 관리에서 메일 주소를 추가해 주세요.";
  return { reasons, guide, fixHref: "/employees" };
}

export type SecretNote = {
  /** true면 생년월일·휴대폰 번호가 둘 다 없어 직원이 명세서를 열 수 없다 */
  blocked: boolean;
  message: string;
};

const digitsOf = (s?: string) => (s ?? "").replace(/\D/g, "");

/**
 * 열람 비밀번호로 쓸 정보(생년월일·휴대폰 번호)가 없을 때의 안내. 둘 다 있으면 null.
 * 생년월일은 급여대장 값, 없으면 임직원 명부 값을 쓴다. 보내는 것을 막지는 않고 담당자에게 알려 주기만 한다.
 */
export function secretNote(e: EmployeePay, roster: { memberId: string; birthDate?: string; phone?: string }[] | null): SecretNote | null {
  const reg = roster?.find((r) => r.memberId === e.match?.memberId);
  const hasBirth = digitsOf(e.birthDate).length === 8 || digitsOf(reg?.birthDate).length === 8;
  const hasPhone = digitsOf(e.match?.phone).length >= 4 || digitsOf(reg?.phone).length >= 4;
  if (hasBirth) return null;
  if (!hasPhone) {
    return {
      blocked: true,
      message: "생년월일과 휴대폰 번호가 없어 직원이 명세서를 열 수 없어요. 임직원 관리에서 생년월일을 추가해 주세요.",
    };
  }
  return { blocked: false, message: "생년월일이 등록되어 있지 않아요. 열람 비밀번호로 쓸 수 있게 임직원 관리에서 추가해 주세요." };
}
