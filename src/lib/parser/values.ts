// 칸 값 해석: 금액, 날짜, 귀속월, 단위, 사업장명
import type { CellValue } from "./read-file";

/** 금액 칸 읽기. 숫자, "2,760,000원", "-"(=0), 빈칸(null)을 처리한다. 금액이 아니면 undefined */
export function parseAmount(v: CellValue): number | null | undefined {
  if (v === null) return null;
  if (typeof v === "number") return v;
  if (typeof v !== "string") return undefined;
  const s = v.replace(/[\s,원₩]/g, "");
  if (s === "") return null;
  if (s === "-" || s === "–") return 0;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return undefined;
  return Number(s);
}

/** 숫자처럼 쓰인 근무 정보 ("22일", "8시간", "209:00", "127.5") → 숫자 */
export function parseQuantity(v: CellValue): number | undefined {
  if (v === null) return undefined;
  if (typeof v === "number") return v;
  const s = String(v).trim();
  const hm = s.match(/^(\d+):(\d{2})$/);
  if (hm) return Number(hm[1]) + Number(hm[2]) / 60;
  const m = s.replace(/,/g, "").match(/^(-?\d+(\.\d+)?)\s*(일|시간|h|원)?$/);
  return m ? Number(m[1]) : undefined;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 글 속에서 날짜 하나 찾기. "2026년 11월 25일", "2026.11.25.", "2026-12-10", "2026. 11. 10", "11/25" */
export function findDate(text: string, fallbackYear?: number): string | undefined {
  let m = text.match(/(20\d{2})\s*[년.\-/]\s*(\d{1,2})\s*[월.\-/]\s*(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = text.match(/(?:^|[^\d])(\d{1,2})\s*\/\s*(\d{1,2})(?:[^\d]|$)/);
  if (m && fallbackYear) return `${fallbackYear}-${pad(+m[1])}-${pad(+m[2])}`;
  m = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (m && fallbackYear) return `${fallbackYear}-${pad(+m[1])}-${pad(+m[2])}`;
  return undefined;
}

/** 지급일: "지급일" "급여일" "지급)" 근처의 날짜 */
export function findPayDate(text: string, fallbackYear?: number): string | undefined {
  const m = text.match(/(?:지급일|급여일|지급\s*일자)\s*[:：]?\s*([^|)\]]{0,24})/);
  if (m) {
    const d = findDate(m[1], fallbackYear);
    if (d) return d;
  }
  const m2 = text.match(/\(([^)]*?)\s*지급\)/); // "10월분 (2026. 11. 10 지급)"
  if (m2) return findDate(m2[1], fallbackYear);
  return undefined;
}

/** 귀속월 "2026-11". "귀속연월: 2026년 11월", "귀속 2026-11", "2026년 11월", "2026.11", "202611", "11월분" */
export function findPeriod(text: string, fallbackYear?: number): string | undefined {
  let m = text.match(/귀속\S*\s*[:：]?\s*(20\d{2})\s*[년.\-/]?\s*(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}`;
  m = text.match(/(\d{1,2})\s*월분/);
  if (m && fallbackYear) return `${fallbackYear}-${pad(+m[1])}`;
  m = text.match(/(20\d{2})\s*년도?\s*(\d{1,2})\s*월(?!\s*\d{1,2}\s*일)/);
  if (m) return `${m[1]}-${pad(+m[2])}`;
  m = text.match(/(20\d{2})[.\-](\d{1,2})(?![.\-]\d)/);
  if (m) return `${m[1]}-${pad(+m[2])}`;
  m = text.match(/(?:^|[^\d])(20\d{2})(0[1-9]|1[0-2])(?:[^\d]|$)/);
  if (m) return `${m[1]}-${m[2]}`;
  m = text.match(/(?:^|[^\d])(\d{1,2})\s*월(?!\s*\d{1,2}\s*일)/);
  if (m && fallbackYear) return `${fallbackYear}-${pad(+m[1])}`;
  return undefined;
}

export function findYear(text: string): number | undefined {
  const m = text.match(/(20\d{2})/);
  return m ? Number(m[1]) : undefined;
}

export function findUnit(text: string): "원" | "천원" {
  return /단위\s*[:：]?\s*천\s*원/.test(text) ? "천원" : "원";
}

/** "회사명: X" 또는 제목 줄의 앞부분("새하얀결세탁소 2026년 11월 급여대장") */
export function findCompany(texts: string[]): string | undefined {
  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];
    const m = t.match(/회사명\s*[:：]\s*(.+)/);
    if (m && m[1].trim()) return m[1].trim();
    if (/^회사명\s*[:：]?$/.test(t.trim()) && texts[i + 1]) return texts[i + 1].trim();
  }
  for (const t of texts) {
    const head = t.split(/\s*(?:20\d{2}\s*년|\d{1,2}\s*월|급여|임금|\(|\[)/)[0].trim();
    if (head.length >= 2 && !/^(급|여|대|장|\s)+$/.test(head)) return head;
  }
  return undefined;
}

/** 파일 이름에서 사업장명 추정 (마지막 수단). "2026년11월(급여) 들꽃여울 급여지급명세서.xlsx" → "들꽃여울" */
export function companyFromFileName(fileName: string): string | undefined {
  const base = fileName.replace(/\.[^.]+$/, "");
  const cleaned = base
    .replace(/\(.*?\)/g, " ")
    .replace(/20\d{2}\s*년?/g, " ")
    .replace(/\d{1,2}\s*월/g, " ")
    .replace(/[_\-.]/g, " ")
    .replace(/(급여지급명세서|급여대장|임금대장|급여|지급내역|명세서|최종|수정\d*|export|payroll)/gi, " ")
    .replace(/\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /[가-힣]/.test(cleaned) ? cleaned.split(" ")[0] : undefined;
}

/** 직원 이름처럼 보이는지. 합계·소계·구분 줄은 제외 */
export function looksLikeName(v: CellValue): v is string {
  if (typeof v !== "string") return false;
  const s = v.trim();
  if (!s || s.length > 30) return false;
  if (/(합계|소계|총계|^계$|합\s*계)/.test(s)) return false;
  if (/^\d+(일|시간)?$/.test(s) || /^\d+:\d+$/.test(s)) return false;
  return /^[가-힣]{2,5}$/.test(s.replace(/\s/g, "")) || /^[A-Za-z][A-Za-z .'-]+$/.test(s);
}
