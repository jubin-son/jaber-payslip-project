// 숫자가 안 맞을 때 원인 추정.
// 검산(checks.ts)은 "안 맞는다"까지만 알려 준다. 여기서는 그 차액이 어디서 왔을지 단서를 찾아
// 담당자가 원본을 덜 뒤져도 되게 한다. 금액을 자동으로 고치지는 않고, 담당자가 고르면 화면에서 반영한다.
//
// 쓰는 단서
//   1. 실지급액 교차 확인: 실지급액이 원본 합계 기준으로 맞는지, 항목 합 기준으로 맞는지 → 항목이 빠졌나 / 합계를 잘못 적었나
//   2. 같은 직원의 다른 달: 그달엔 있던 항목이 이번 달에 없고 금액이 차액과 같다
//   3. 같은 사업장 다른 직원: 다른 직원은 받는 항목이 이 직원만 없고 금액이 차액과 같다
//   4. 4대보험 기준액 역산: 국민연금(4.75%)·고용보험(0.9%)으로 보수액을 거꾸로 구해, 빠진 금액이 보험료가 붙는 돈인지 본다
//      (보험료가 항목 합 기준이면 빠진 돈은 비과세 → 월 20만원 이하면 식대일 가능성이 크다)
//   5. 빠진 공제 항목 추정: 지방소득세 = 소득세 10%, 장기요양 = 건강보험 13.14% 등
//   6. 입력 실수: 한 자리만 다르다 / 이웃한 두 자리가 바뀌었다 / 천원 단위로 적었다 / 다른 쪽(지급↔공제) 항목과 금액이 같다
// 요율은 2026년 근로자 부담분 기준이다. 바뀌면 RATES만 고친다.
import type { EmployeePay, PayCategory, PayItem } from "@/types/payroll";

export type HintGroup = "earnings" | "deductions";
export type MismatchField = "totalEarnings" | "totalDeductions" | "netPay";

export type HintFix =
  | {
      kind: "add";
      group: HintGroup;
      label: string;
      category: PayCategory;
      amount: number;
    }
  | { kind: "amount"; group: HintGroup; index: number; amount: number }
  | { kind: "total"; field: MismatchField; amount: number };

export type MismatchHint = {
  confidence: "높음" | "보통" | "낮음";
  /** 무엇이 원인으로 보이는지 한 문장 */
  text: string;
  /** 왜 그렇게 보는지 (근거) */
  why: string;
  fix?: HintFix;
  /** 고치기 버튼 문구 */
  fixLabel?: string;
};

export type MismatchCase = {
  field: MismatchField;
  title: string;
  /** 원본 값 − 계산 값 */
  gap: number;
  hints: MismatchHint[];
};

export type HintContext = {
  /** 같은 사업장·같은 달 다른 직원 */
  peers: EmployeePay[];
  /** 같은 직원의 다른 달 */
  past: { period: string; e: EmployeePay }[];
};

const RATES = {
  국민연금: 0.0475,
  건강보험: 0.03595,
  고용보험: 0.009,
  장기요양_건강보험대비: 0.1314,
  지방소득세_소득세대비: 0.1,
};
const ROUNDING = 10;
const ORDER = { 높음: 0, 보통: 1, 낮음: 2 } as const;

const won = (n: number) => `${Math.round(n).toLocaleString("ko-KR")}원`;
const sum = (xs: PayItem[]) => xs.reduce((a, b) => a + b.amount, 0);
const near = (a: number, b: number, tol = ROUNDING) => Math.abs(a - b) <= tol;
const nearRate = (a: number, b: number, rate: number) =>
  b > 0 && Math.abs(a - b) / b <= rate;
/** 받침에 맞는 조사: josa("소득세", "이", "가") → "소득세가" */
function josa(word: string, withBatchim: string, without: string) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const batchim =
    code >= 0 && code <= 11171 ? code % 28 !== 0 : /[013678]$/.test(word);
  return word + (batchim ? withBatchim : without);
}
const iga = (w: string) => josa(w, "이", "가");
const eulreul = (w: string) => josa(w, "을", "를");

const GROUP_TEXT: Record<HintGroup, string> = {
  earnings: "지급",
  deductions: "공제",
};
const FIELD_TEXT: Record<MismatchField, string> = {
  totalEarnings: "지급합계",
  totalDeductions: "공제합계",
  netPay: "실지급액",
};

/** 같은 자릿수에서 한 자리만 다르다 (2,560,000 ↔ 2,760,000) */
export function oneDigitOff(a: number, b: number) {
  const s = String(Math.round(a));
  const t = String(Math.round(b));
  if (s.length !== t.length || s === t) return false;
  let d = 0;
  for (let i = 0; i < s.length; i++) if (s[i] !== t[i]) d++;
  return d === 1;
}

/** 이웃한 두 자리가 서로 바뀌었다 (1,250,000 ↔ 1,520,000) */
export function transposed(a: number, b: number) {
  const s = String(Math.round(a));
  const t = String(Math.round(b));
  if (s.length !== t.length || s === t) return false;
  const idx = [...s].map((c, i) => (c !== t[i] ? i : -1)).filter((i) => i >= 0);
  return (
    idx.length === 2 &&
    idx[1] === idx[0] + 1 &&
    s[idx[0]] === t[idx[1]] &&
    s[idx[1]] === t[idx[0]]
  );
}

function typoKind(a: number, b: number): string | null {
  if (oneDigitOff(a, b)) return "한 자리 숫자만 달라요";
  if (transposed(a, b)) return "이웃한 두 숫자가 서로 바뀐 모양이에요";
  return null;
}

/** 4대보험으로 거꾸로 구한 보수액 (국민연금·고용보험 중 있는 것) */
function insuranceBase(e: EmployeePay): { base: number; from: string } | null {
  const pension =
    e.deductions.find((d) => d.category === "국민연금")?.amount ?? 0;
  if (pension > 0)
    return { base: pension / RATES.국민연금, from: "국민연금(4.75%)" };
  const emp = e.deductions.find((d) => d.category === "고용보험")?.amount ?? 0;
  if (emp > 0) return { base: emp / RATES.고용보험, from: "고용보험(0.9%)" };
  return null;
}

const has = (items: PayItem[], c: PayCategory) =>
  items.some((i) => i.category === c);

/** 같은 직원의 다른 달·같은 사업장 다른 직원에게는 있는데 이 직원에겐 없는 항목 중 금액이 차액과 같은 것 */
function fromOthers(
  e: EmployeePay,
  group: HintGroup,
  missing: number,
  ctx: HintContext,
): MismatchHint[] {
  const out: MismatchHint[] = [];
  const seen = new Set<string>();
  for (const { period, e: p } of ctx.past) {
    for (const it of p[group]) {
      if (
        has(e[group], it.category) ||
        !near(it.amount, missing) ||
        seen.has(it.category)
      )
        continue;
      seen.add(it.category);
      out.push({
        confidence: "높음",
        text: `${it.label} ${won(it.amount)}이 이번 달에 빠졌을 수 있어요.`,
        why: `같은 직원의 ${period} 명세서에는 ${it.label} ${won(it.amount)}이 있었고, 차액과 금액이 같아요.`,
        fix: {
          kind: "add",
          group,
          label: it.label,
          category: it.category,
          amount: it.amount,
        },
        fixLabel: `${it.label} ${won(it.amount)} 추가`,
      });
    }
  }
  const byCat = new Map<PayCategory, { label: string; n: number }>();
  for (const p of ctx.peers) {
    for (const it of p[group]) {
      if (has(e[group], it.category) || !near(it.amount, missing)) continue;
      const cur = byCat.get(it.category);
      byCat.set(it.category, {
        label: cur?.label ?? it.label,
        n: (cur?.n ?? 0) + 1,
      });
    }
  }
  for (const [category, { label, n }] of byCat) {
    if (seen.has(category)) continue;
    seen.add(category);
    out.push({
      confidence: n >= 2 ? "높음" : "보통",
      text: `${label} ${won(missing)}이 빠졌을 수 있어요.`,
      why: `같은 사업장 직원 ${n}명이 ${label} ${won(missing)}을 받는데 이 직원에게는 ${label} 항목이 없어요.`,
      fix: { kind: "add", group, label, category, amount: missing },
      fixLabel: `${label} ${won(missing)} 추가`,
    });
  }
  return out;
}

/** 입력 실수: 항목 하나·원본 합계·단위 */
/** totalTrusted: 실지급액·보험료로 보아 원본 합계가 맞는 쪽이면 합계 오타는 빼고, 항목 오타도 가능성을 낮춘다 */
function typos(
  e: EmployeePay,
  group: HintGroup,
  field: MismatchField,
  original: number,
  calc: number,
  totalTrusted = false,
  itemsTrusted = false,
): MismatchHint[] {
  const out: MismatchHint[] = [];
  const gap = original - calc;
  if (
    calc > 0 &&
    (near(original, calc * 1000, 1000) || near(original * 1000, calc, 1000))
  ) {
    out.push({
      confidence: "높음",
      text: "원/천원 단위가 섞여 있어요.",
      why: `${FIELD_TEXT[field]}(${won(original)})와 항목 합(${won(calc)})이 1,000배 차이 나요. 한쪽만 천원 단위로 적혀 있을 수 있어요.`,
    });
    return out;
  }
  // 보험료가 항목 합 기준으로 맞으면 항목 금액은 맞는 것이라 항목 오타는 보지 않는다
  if (!itemsTrusted)
    e[group].forEach((it, index) => {
      const fixed = it.amount + gap;
      if (fixed <= 0) return;
      const kind = typoKind(it.amount, fixed);
      if (!kind) return;
      out.push({
        confidence: totalTrusted ? "낮음" : "보통",
        text: `${iga(it.label)} 원래 ${won(fixed)}일 수 있어요.`,
        why: `${eulreul(it.label)} ${won(fixed)}으로 바꾸면 ${FIELD_TEXT[field]}와 맞아요. 지금 값(${won(it.amount)})과 ${kind}.`,
        fix: { kind: "amount", group, index, amount: fixed },
        fixLabel: `${eulreul(it.label)} ${won(fixed)}으로`,
      });
    });
  const kind = typoKind(original, calc);
  if (kind && !totalTrusted) {
    out.push({
      confidence: "보통",
      text: `원본 ${FIELD_TEXT[field]}를 잘못 적었을 수 있어요.`,
      why: `${FIELD_TEXT[field]} ${won(original)}과 항목 합 ${won(calc)}이 ${kind}.`,
      fix: { kind: "total", field, amount: calc },
      fixLabel: `${FIELD_TEXT[field]}를 ${won(calc)}으로`,
    });
  }
  return out;
}

/** 금액이 차액과 같은 항목이 반대쪽(지급↔공제)에 있다 */
function wrongSide(
  e: EmployeePay,
  group: HintGroup,
  missing: number,
): MismatchHint[] {
  const other: HintGroup = group === "earnings" ? "deductions" : "earnings";
  return e[other]
    .filter((it) => near(it.amount, Math.abs(missing)))
    .map((it) => ({
      confidence: "보통" as const,
      text: `${GROUP_TEXT[other]} 쪽 ${iga(it.label)} 원래 ${GROUP_TEXT[group]} 항목일 수 있어요.`,
      why: `${it.label}(${won(it.amount)})의 금액이 차액과 같아요. 원본에서 열을 잘못 읽었을 수 있어요.`,
    }));
}

function earningsCase(e: EmployeePay, ctx: HintContext): MismatchCase | null {
  const calc = sum(e.earnings);
  const gap = e.totalEarnings - calc;
  if (Math.abs(gap) <= ROUNDING) return null;
  const hints: MismatchHint[] = [];
  const netByTotal = near(e.netPay, e.totalEarnings - e.totalDeductions);
  const netByItems = near(e.netPay, calc - e.totalDeductions);

  if (netByItems) {
    hints.push({
      confidence: "높음",
      text: `원본 지급합계(${won(e.totalEarnings)})를 잘못 적었을 가능성이 커요.`,
      why: `실지급액 ${won(e.netPay)}은 항목 합(${won(calc)})에서 공제합계를 뺀 값과 맞아요.`,
      fix: { kind: "total", field: "totalEarnings", amount: calc },
      fixLabel: `지급합계를 ${won(calc)}으로`,
    });
  }

  const ins = insuranceBase(e);
  /** 보험료가 항목 합 기준이면 항목 금액은 맞고 다른 항목이 빠진 쪽이다 */
  const insMatchesItems = !!ins && nearRate(ins.base, calc, 0.01);
  if (gap > 0) {
    hints.push(...fromOthers(e, "earnings", gap, ctx));
    if (ins) {
      const base = Math.round(ins.base);
      if (nearRate(base, calc, 0.01)) {
        const meal = gap <= 200_000 && !has(e.earnings, "식대");
        hints.push({
          confidence: meal ? "보통" : "낮음",
          text: meal
            ? `빠진 ${won(gap)}은 비과세 식대일 가능성이 있어요.`
            : `빠진 ${won(gap)}은 4대보험이 붙지 않는 비과세 항목으로 보여요.`,
          why: `${ins.from}로 거꾸로 구한 보수액이 약 ${won(base)}으로, 지급합계가 아니라 항목 합(${won(calc)})과 같아요. 빠진 돈에는 보험료가 안 붙었다는 뜻이라 식대·자가운전보조금 같은 비과세 수당일 가능성이 커요${meal ? " (식대는 월 20만원까지 비과세)" : ""}.`,
          ...(meal
            ? {
                fix: {
                  kind: "add" as const,
                  group: "earnings" as const,
                  label: "식대",
                  category: "식대" as const,
                  amount: gap,
                },
                fixLabel: `식대 ${won(gap)} 추가`,
              }
            : {}),
        });
      } else if (nearRate(base, e.totalEarnings, 0.01)) {
        hints.push({
          confidence: "보통",
          text: `빠진 ${won(gap)}은 보험료가 붙는 과세 수당(연장근로수당·상여 등)으로 보여요.`,
          why: `${ins.from}로 거꾸로 구한 보수액이 약 ${won(base)}으로 지급합계(${won(e.totalEarnings)})와 같아요. 빠진 돈에도 보험료가 매겨졌다는 뜻이에요.`,
        });
      }
    }
  }
  hints.push(...wrongSide(e, "earnings", gap));
  if (!netByItems)
    hints.push(
      ...typos(
        e,
        "earnings",
        "totalEarnings",
        e.totalEarnings,
        calc,
        netByTotal,
        insMatchesItems,
      ),
    );
  if (netByTotal && !hints.some((h) => h.confidence === "높음")) {
    hints.push({
      confidence: "보통",
      text: "합계보다는 항목이 빠졌을 가능성이 커요.",
      why: `실지급액 ${won(e.netPay)}이 원본 지급합계 − 공제합계와 맞아요. 합계는 제대로 적혀 있고, 파일에서 읽지 못한 지급 열이 있을 수 있어요.`,
    });
  }
  return {
    field: "totalEarnings",
    gap,
    title: `지급합계가 항목 합보다 ${won(Math.abs(gap))} ${gap > 0 ? "많아요" : "적어요"}`,
    hints,
  };
}

/** 이 직원에게 없는 표준 공제 항목의 예상 금액 */
function expectedDeductions(
  e: EmployeePay,
): { category: PayCategory; amount: number; why: string }[] {
  const out: { category: PayCategory; amount: number; why: string }[] = [];
  const get = (c: PayCategory) =>
    e.deductions.find((d) => d.category === c)?.amount;
  const tax = get("소득세");
  if (tax && !get("지방소득세"))
    out.push({
      category: "지방소득세",
      amount: Math.floor((tax * RATES.지방소득세_소득세대비) / 10) * 10,
      why: "소득세의 10%",
    });
  const health = get("건강보험");
  if (health && !get("장기요양보험"))
    out.push({
      category: "장기요양보험",
      amount: Math.floor((health * RATES.장기요양_건강보험대비) / 10) * 10,
      why: "건강보험료의 13.14%",
    });
  const ins = insuranceBase(e);
  const base = ins?.base ?? sum(e.earnings.filter((i) => !i.taxFree));
  if (!get("국민연금"))
    out.push({
      category: "국민연금",
      amount: Math.floor((base * RATES.국민연금) / 10) * 10,
      why: "보수액의 4.75%",
    });
  if (!health)
    out.push({
      category: "건강보험",
      amount: Math.floor((base * RATES.건강보험) / 10) * 10,
      why: "보수액의 3.595%",
    });
  if (!get("고용보험"))
    out.push({
      category: "고용보험",
      amount: Math.floor((base * RATES.고용보험) / 10) * 10,
      why: "보수액의 0.9%",
    });
  return out;
}

function deductionsCase(e: EmployeePay, ctx: HintContext): MismatchCase | null {
  const calc = sum(e.deductions);
  const gap = e.totalDeductions - calc;
  if (Math.abs(gap) <= ROUNDING) return null;
  const hints: MismatchHint[] = [];
  const netByItems = near(e.netPay, e.totalEarnings - calc);
  const netByTotal = near(e.netPay, e.totalEarnings - e.totalDeductions);

  if (netByItems) {
    hints.push({
      confidence: "높음",
      text: `원본 공제합계(${won(e.totalDeductions)})를 잘못 적었을 가능성이 커요.`,
      why: `실지급액 ${won(e.netPay)}은 지급합계에서 공제 항목 합(${won(calc)})을 뺀 값과 맞아요.`,
      fix: { kind: "total", field: "totalDeductions", amount: calc },
      fixLabel: `공제합계를 ${won(calc)}으로`,
    });
  }
  if (gap > 0) {
    hints.push(...fromOthers(e, "deductions", gap, ctx));
    for (const x of expectedDeductions(e)) {
      if (!nearRate(x.amount, gap, 0.03) && !near(x.amount, gap)) continue;
      hints.push({
        confidence: "보통",
        text: `${x.category} 약 ${won(gap)}이 빠졌을 수 있어요.`,
        why: `이 직원에게 ${x.category} 항목이 없는데, 예상 금액(${x.why}, 약 ${won(x.amount)})이 차액과 거의 같아요.`,
        fix: {
          kind: "add",
          group: "deductions",
          label: x.category,
          category: x.category,
          amount: gap,
        },
        fixLabel: `${x.category} ${won(gap)} 추가`,
      });
    }
  }
  hints.push(...wrongSide(e, "deductions", gap));
  if (!netByItems)
    hints.push(
      ...typos(
        e,
        "deductions",
        "totalDeductions",
        e.totalDeductions,
        calc,
        netByTotal,
      ),
    );
  if (netByTotal && !hints.some((h) => h.confidence === "높음")) {
    hints.push({
      confidence: "보통",
      text: "합계보다는 공제 항목이 빠졌을 가능성이 커요.",
      why: `실지급액 ${won(e.netPay)}이 원본 지급합계 − 공제합계와 맞아요. 가불금·경조회비처럼 파일에서 읽지 못한 공제 열이 있을 수 있어요.`,
    });
  }
  return {
    field: "totalDeductions",
    gap,
    title: `공제합계가 항목 합보다 ${won(Math.abs(gap))} ${gap > 0 ? "많아요" : "적어요"}`,
    hints,
  };
}

function netCase(e: EmployeePay): MismatchCase | null {
  const calc = e.totalEarnings - e.totalDeductions;
  const gap = e.netPay - calc;
  if (Math.abs(gap) <= ROUNDING) return null;
  const hints: MismatchHint[] = [];
  const itemsCalc = sum(e.earnings) - sum(e.deductions);
  if (near(e.netPay, itemsCalc) && !near(itemsCalc, calc)) {
    hints.push({
      confidence: "높음",
      text: "실지급액은 맞고, 원본 합계 쪽이 틀렸을 가능성이 커요.",
      why: `실지급액 ${won(e.netPay)}은 지급 항목 합 − 공제 항목 합과 맞아요. 위의 합계 차이를 먼저 확인해 주세요.`,
    });
  }
  if (Math.abs(gap) < 100) {
    hints.push({
      confidence: "보통",
      text: "원 단위 끝자리를 버리면서 생긴 차이일 수 있어요.",
      why: `차이가 ${won(Math.abs(gap))}으로 작아요. 실지급액을 10원·100원 단위로 맞췄을 수 있어요.`,
    });
  }
  for (const [group, items] of [
    ["earnings", e.earnings],
    ["deductions", e.deductions],
  ] as const) {
    for (const it of items) {
      if (!near(it.amount, Math.abs(gap))) continue;
      hints.push({
        confidence: "보통",
        text: `${it.label}(${won(it.amount)})이 실지급액 계산에서 ${gap > 0 === (group === "deductions") ? "빠졌거나" : "두 번 들어갔거나"} 따로 지급됐을 수 있어요.`,
        why: `차액이 ${GROUP_TEXT[group]} 항목 ${it.label}의 금액과 같아요.`,
      });
    }
  }
  const kind = typoKind(e.netPay, calc);
  if (kind) {
    hints.push({
      confidence: "보통",
      text: "원본 실지급액을 잘못 적었을 수 있어요.",
      why: `실지급액 ${won(e.netPay)}과 계산값 ${won(calc)}이 ${kind}.`,
      fix: { kind: "total", field: "netPay", amount: calc },
      fixLabel: `실지급액을 ${won(calc)}으로`,
    });
  }
  return {
    field: "netPay",
    gap,
    title: `실지급액이 계산값보다 ${won(Math.abs(gap))} ${gap > 0 ? "많아요" : "적어요"}`,
    hints,
  };
}

/** 숫자가 안 맞는 곳마다 추정 원인을 모은다 (믿을 만한 것부터, 곳마다 최대 4개) */
export function explainMismatches(
  e: EmployeePay,
  ctx: HintContext,
): MismatchCase[] {
  return [earningsCase(e, ctx), deductionsCase(e, ctx), netCase(e)]
    .filter((c): c is MismatchCase => c !== null)
    .map((c) => {
      const uniq = c.hints.filter(
        (h, i) => c.hints.findIndex((x) => x.text === h.text) === i,
      );
      return {
        ...c,
        hints: uniq
          .sort((a, b) => ORDER[a.confidence] - ORDER[b.confidence])
          .slice(0, 4),
      };
    });
}

/** 같은 사업장·같은 달 동료와, 같은 직원(자버 회원번호, 없으면 이름)의 다른 달 */
export function hintContextOf(
  batches: { payPeriod: string; employees: EmployeePay[] }[],
  e: EmployeePay,
): HintContext {
  const mine = batches.find((b) => b.employees.some((x) => x.id === e.id));
  const same = (x: EmployeePay) =>
    e.match?.memberId && x.match?.memberId
      ? x.match.memberId === e.match.memberId
      : x.name === e.name;
  return {
    peers: mine ? mine.employees.filter((x) => x.id !== e.id) : [],
    past: batches
      .filter((b) => b !== mine && b.payPeriod !== mine?.payPeriod)
      .flatMap((b) =>
        b.employees.filter(same).map((x) => ({ period: b.payPeriod, e: x })),
      ),
  };
}
