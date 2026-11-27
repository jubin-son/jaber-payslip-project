// 확인·수정 화면에서 오류가 났을 때, 세무사·노무사에게 보낼 문의 메일 내용을 만든다.
// 메일 본문에는 직원 이름·항목·금액만 넣는다. 주민번호·생년월일·연락처·계좌 같은 개인정보는 넣지 않는다.
import type { EmployeePay, Issue, PayrollBatch } from "@/types/payroll";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const sum = (xs: { amount: number }[]) => xs.reduce((a, b) => a + b.amount, 0);

/** 문의에 넣을 안내: 오류와 숫자 확인 필요(경고). 참고(info)는 뺀다 */
const NUMBER_CODES: Issue["code"][] = ["SUM_MISMATCH", "NET_MISMATCH", "RATE_OUT_OF_RANGE"];
export const isInquiryIssue = (i: Issue) => i.level === "error" || (i.level === "warning" && NUMBER_CODES.includes(i.code));

export function inquiryEmployees(b: PayrollBatch): { e: EmployeePay; issues: Issue[] }[] {
  return b.employees
    .map((e) => ({ e, issues: e.issues.filter(isInquiryIssue) }))
    .filter((x) => x.issues.length > 0);
}

/** 오류가 난 칸의 이름과 금액 ("earnings.2" → "기본급 1,500,000원") */
function fieldText(e: EmployeePay, field?: string): string | null {
  if (!field) return null;
  const totals = { totalEarnings: "지급합계", totalDeductions: "공제합계", netPay: "실지급액" } as const;
  if (field in totals) {
    const k = field as keyof typeof totals;
    return `${totals[k]} ${won(e[k])}`;
  }
  const m = field.match(/^(earnings|deductions)\.(\d+)$/);
  const it = m && e[m[1] as "earnings" | "deductions"][Number(m[2])];
  return it ? `${it.label} ${won(it.amount)}` : null;
}

export function buildInquiry(b: PayrollBatch, writerLabel: string, ownerName?: string): { subject: string; body: string } {
  const [y, mo] = b.payPeriod.split("-");
  const month = mo ? `${y}년 ${Number(mo)}월` : b.payPeriod;
  const rows = inquiryEmployees(b);
  const lines: string[] = [
    `안녕하세요, ${writerLabel}님.`,
    `${b.companyName}의 ${month} 급여대장(${b.sourceFile})으로 급여명세서를 만들다가, 숫자가 맞지 않는 곳이 있어 문의드려요.`,
    "아래 직원 분의 내용이 맞는지 확인해 주시고, 고쳐야 한다면 알려 주세요.",
    "",
  ];
  rows.forEach(({ e, issues }, n) => {
    lines.push(`${n + 1}. ${e.name}`);
    for (const i of issues) {
      const where = fieldText(e, i.field);
      lines.push(`  - ${i.message}${where ? ` (해당 칸: ${where})` : ""}`);
    }
    lines.push(
      `  · 급여대장에 적힌 값: 지급합계 ${won(e.totalEarnings)} / 공제합계 ${won(e.totalDeductions)} / 실지급액 ${won(e.netPay)}`,
      `  · 항목을 직접 더한 값: 지급 ${won(sum(e.earnings))} / 공제 ${won(sum(e.deductions))} / 실지급 ${won(sum(e.earnings) - sum(e.deductions))}`,
      "",
    );
  });
  lines.push("확인 후 연락 주시면 감사하겠습니다.", ownerName ? `${b.companyName} ${ownerName} 드림` : `${b.companyName} 드림`);
  return { subject: `[${b.companyName}] ${month} 급여대장 확인 요청 (${rows.length}명)`, body: lines.join("\n") };
}

/** 메일 앱을 여는 링크. 한글이 들어가서 인코딩이 필요하다 */
export function mailtoLink(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body).replace(/%0A/g, "%0D%0A")}`;
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
