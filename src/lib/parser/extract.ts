// 2단계: 시트 → 표 찾기 → 열 분류 → 금액 추출 → PayrollBatch
// 금액은 항상 원본 칸에서 그대로 가져온다(AI가 숫자를 만들지 않는다). 칸 주소는 source에 남긴다.
import type { EmployeePay, Issue, PayItem, PayrollBatch } from "@/types/payroll";
import { cellAddress, type CellValue, type RawFile, type RawSheet } from "./read-file";
import { groupOf, isAmountRole, lookupRole, normalizeLabel, type ColumnRole } from "./dictionary";
import {
  companyFromFileName,
  findCompany,
  findDate,
  findPayDate,
  findPeriod,
  findUnit,
  findYear,
  looksLikeName,
  parseAmount,
  personDate,
  parseQuantity,
} from "./values";
import { checkEmployee } from "./checks";
import { matchJaber } from "@/lib/jaber-match";
import type { JaberEmployee } from "@/lib/jaber-db";

// ---------- 결과 보고용 타입 (스키마 밖, 2단계 화면에서 씀) ----------

export type ColumnMapping = {
  label: string;
  /** 머리글 칸 주소 "H4" */
  address: string;
  role: ColumnRole;
  /** 사전: 열 이름으로 바로 분류 / 위치 추정: 지급·공제 구역으로 추정(AI 확인 필요) */
  how: "사전" | "위치 추정";
};

export type TableReport = {
  fileName: string;
  sheet: string;
  layout: "표" | "가로세로 뒤집힌 표" | "직원별 명세서";
  headerAddress: string;
  title?: string;
  columns: ColumnMapping[];
  unmapped: string[];
  employeeCount: number;
};

export type SkippedSheet = { fileName: string; sheet?: string; reason: string };

export type ParseResult = {
  batches: PayrollBatch[];
  tables: TableReport[];
  skipped: SkippedSheet[];
};

// ---------- 시트를 다루기 쉽게 감싸기 (가로세로 뒤집기 포함) ----------

type Grid = {
  name: string;
  rowCount: number;
  colCount: number;
  get(r: number, c: number): CellValue;
  addr(r: number, c: number): string;
};

function gridOf(s: RawSheet): Grid {
  return {
    name: s.name,
    rowCount: s.rowCount,
    colCount: s.colCount,
    get: (r, c) => s.rows[r]?.[c] ?? null,
    addr: (r, c) => cellAddress(s, r, c),
  };
}

function transpose(g: Grid): Grid {
  return { name: g.name, rowCount: g.colCount, colCount: g.rowCount, get: (r, c) => g.get(c, r), addr: (r, c) => g.addr(c, r) };
}

const str = (v: CellValue) => (typeof v === "string" ? v.replace(/\s*\n\s*/g, "") : v === null ? "" : String(v));

function rowTexts(g: Grid, r: number): string[] {
  const out: string[] = [];
  for (let c = 0; c < g.colCount; c++) {
    const v = g.get(r, c);
    if (typeof v === "string" && v.trim()) out.push(v.trim());
  }
  return out;
}

// ---------- 머리글 행 찾기 ----------

type Header = {
  row: number;
  /** 두 줄 머리글이면 아랫줄 */
  subRow?: number;
  nameCol: number;
  labels: (string | null)[];
  labelAddr: string[];
  groups: ("earning" | "deduction" | "other" | undefined)[];
};

function countMapped(g: Grid, r: number): number {
  let n = 0;
  for (let c = 0; c < g.colCount; c++) if (isAmountRole(lookupRole(g.get(r, c)))) n++;
  return n;
}

function buildHeader(g: Grid, r: number, allowItemAsName: boolean): Header | undefined {
  // 아랫줄이 '세부 머리글'인지: 사전에 있는 이름이 3개 이상이고 이름 칸에 사람 이름이 없음
  const below = r + 1 < g.rowCount ? r + 1 : undefined;
  let subMapped = 0;
  if (below !== undefined) for (let c = 0; c < g.colCount; c++) if (lookupRole(g.get(below, c))) subMapped++;
  const useSub = below !== undefined && subMapped >= 3;

  const labels: (string | null)[] = [];
  const labelAddr: string[] = [];
  for (let c = 0; c < g.colCount; c++) {
    const top = g.get(r, c);
    const sub = useSub ? g.get(below!, c) : null;
    const takeSub = useSub && typeof sub === "string" && sub.trim() && (top === null || groupOf(top) !== undefined);
    labels.push(takeSub ? str(sub) : top === null ? null : str(top));
    labelAddr.push(takeSub ? g.addr(below!, c) : g.addr(r, c));
  }

  let nameCol = labels.findIndex((l) => lookupRole(l)?.kind === "name");
  if (nameCol < 0 && allowItemAsName) nameCol = labels.findIndex((l) => normalizeLabel(l) === "항목");
  if (nameCol < 0) return undefined;
  const amountCols = labels.filter((l) => isAmountRole(lookupRole(l))).length;
  if (amountCols < 2) return undefined;

  // 묶음 머리글(지급/공제)은 바로 윗줄 또는 같은 줄(두 줄 머리글일 때)에 있다. 오른쪽으로 이어진다(병합 칸)
  const groups: Header["groups"] = new Array(g.colCount).fill(undefined);
  for (const gr of useSub ? [r] : [r - 1]) {
    if (gr < 0) continue;
    let cur: Header["groups"][number];
    for (let c = 0; c < g.colCount; c++) {
      const v = g.get(gr, c);
      if (v !== null) cur = groupOf(v);
      groups[c] = cur;
    }
  }
  return { row: r, subRow: useSub ? below : undefined, nameCol, labels, labelAddr, groups };
}

function hasGroupWord(g: Grid, r: number): boolean {
  for (let c = 0; c < g.colCount; c++) if (groupOf(g.get(r, c))) return true;
  return false;
}

function findHeaders(g: Grid, allowItemAsName = false): Header[] {
  const out: Header[] = [];
  for (let r = 0; r < g.rowCount; r++) {
    if (countMapped(g, r) + (r + 1 < g.rowCount ? countMapped(g, r + 1) : 0) < 2) continue;
    // "[1] 근로자 급여" 같은 제목 줄은 머리글이 아니다. 진짜 머리글은 다음 줄
    if (countMapped(g, r) === 0 && !hasGroupWord(g, r)) continue;
    const h = buildHeader(g, r, allowItemAsName);
    if (h) {
      out.push(h);
      if (h.subRow !== undefined) r = h.subRow;
    }
  }
  return out;
}

// ---------- 열 분류 ----------

function mapColumns(h: Header): { roles: (ColumnRole | undefined)[]; mappings: ColumnMapping[]; unmapped: string[] } {
  const roles: (ColumnRole | undefined)[] = h.labels.map((l) => (l ? lookupRole(l) : undefined));
  const firstEarning = roles.findIndex((r) => r?.kind === "earning");
  const totalE = roles.findIndex((r) => r?.kind === "totalEarnings");
  const totalD = roles.findIndex((r) => r?.kind === "totalDeductions");
  const how: ("사전" | "위치 추정" | undefined)[] = roles.map((r) => (r ? "사전" : undefined));
  const unmapped: string[] = [];

  h.labels.forEach((l, c) => {
    if (roles[c] || !l || !l.trim()) return;
    const group = h.groups[c];
    let guess: ColumnRole | undefined;
    if (group === "earning") guess = { kind: "earning", category: "기타지급" };
    else if (group === "deduction") guess = { kind: "deduction", category: "기타공제" };
    else if (firstEarning >= 0 && totalE > c && c > firstEarning) guess = { kind: "earning", category: "기타지급" };
    else if (totalE >= 0 && totalD > c && c > totalE) guess = { kind: "deduction", category: "기타공제" };
    if (guess) {
      roles[c] = guess;
      how[c] = "위치 추정";
    } else unmapped.push(l);
  });

  const mappings: ColumnMapping[] = [];
  roles.forEach((role, c) => {
    if (!role || role.kind === "ignore" || !h.labels[c]) return;
    mappings.push({ label: h.labels[c]!, address: h.labelAddr[c], role, how: how[c]! });
  });
  return { roles, mappings, unmapped };
}

// ---------- 공통: 표 하나 → 직원들 ----------

type Ctx = {
  file: RawFile;
  sheetName: string;
  unitMul: number;
  employmentHint?: EmployeePay["employmentType"];
};

function employmentFrom(v: CellValue): EmployeePay["employmentType"] | undefined {
  const s = normalizeLabel(v);
  if (!s) return undefined;
  if (/일용/.test(s)) return "일용";
  if (/월급|monthly|정규|연봉/.test(s)) return "정규";
  if (/시급|hourly|알바|part/.test(s)) return "시급";
  return "기타";
}

type RowResult = { employee: EmployeePay; period?: string; payDate?: string; flags: { e: boolean; d: boolean; n: boolean } };

function readRow(g: Grid, r: number, h: Header, roles: (ColumnRole | undefined)[], how: Map<number, string>, ctx: Ctx, idx: number): RowResult | undefined {
  const name = g.get(r, h.nameCol);
  if (!looksLikeName(name)) return undefined;

  let anyAmount = false;
  const earnings: PayItem[] = [];
  const deductions: PayItem[] = [];
  const e: EmployeePay = { id: "", name: name.trim(), earnings, deductions, totalEarnings: 0, totalDeductions: 0, netPay: 0, issues: [] };
  const flags = { e: false, d: false, n: false };
  let period: string | undefined;
  let payDate: string | undefined;
  const work: NonNullable<EmployeePay["workInfo"]> = {};
  const money = (v: number) => Math.round(v * ctx.unitMul);

  roles.forEach((role, c) => {
    if (!role) return;
    const v = g.get(r, c);
    const source = { sheet: ctx.sheetName, cell: g.addr(r, c) };
    const label = h.labels[c] ?? "";
    switch (role.kind) {
      case "earning":
      case "deduction": {
        const a = parseAmount(v);
        if (a === undefined || a === null) return;
        anyAmount = true;
        if (a === 0) return;
        const item: PayItem = { label, category: role.category, amount: money(a), source };
        if (role.kind === "earning" && role.taxFree) item.taxFree = true;
        (role.kind === "earning" ? earnings : deductions).push(item);
        if (how.get(c) === "위치 추정") {
          const list = role.kind === "earning" ? "earnings" : "deductions";
          e.issues.push({
            level: "warning",
            code: "UNKNOWN_ITEM",
            message: `'${label}'을(를) 표준 항목으로 분류하지 못해 '${role.category}'(으)로 넣었어요. 맞는지 확인해 주세요.`,
            field: `${list}.${(role.kind === "earning" ? earnings : deductions).length - 1}`,
          });
        }
        return;
      }
      case "totalEarnings":
      case "totalDeductions":
      case "netPay": {
        const a = parseAmount(v);
        if (a === undefined || a === null) return;
        anyAmount = true;
        if (role.kind === "totalEarnings") { e.totalEarnings = money(a); flags.e = true; }
        if (role.kind === "totalDeductions") { e.totalDeductions = money(a); flags.d = true; }
        if (role.kind === "netPay") { e.netPay = money(a); flags.n = true; }
        return;
      }
      case "workDays":
      case "workHours":
      case "overtimeHours":
      case "hourlyWage": {
        const q = parseQuantity(v);
        if (q !== undefined && q !== 0) work[role.kind] = q;
        return;
      }
      case "employmentType":
        e.employmentType = employmentFrom(v);
        return;
      case "department":
        if (typeof v === "string" && v.trim()) e.department = v.trim();
        return;
      case "position":
        if (typeof v === "string" && v.trim()) {
          // 직급(fallback)은 직위가 아직 없을 때만 넣고, 직위는 직급 값을 덮어쓴다
          if (role.fallback) {
            if (!e.position) e.position = v.trim();
          } else e.position = v.trim();
        }
        return;
      case "employeeNo":
        if (v !== null && String(v).trim()) e.employeeNo = String(v).trim();
        return;
      case "birthDate":
        if (v !== null && String(v).trim()) e.birthDate = personDate(v);
        return;
      case "hireDate":
        if (v !== null && String(v).trim()) e.hireDate = personDate(v);
        return;
      case "payPeriod":
        if (v !== null) period = findPeriod(String(v));
        return;
      case "payDate":
        if (v !== null) payDate = findDate(String(v));
        return;
    }
  });
  if (!anyAmount) return undefined;

  if (ctx.employmentHint && !e.employmentType) e.employmentType = ctx.employmentHint;
  if (earnings.some((i) => i.category === "강사료")) e.employmentType = "강사";
  if (Object.keys(work).length) e.workInfo = work;

  // 지급 항목 열이 없고 지급총액만 있는 표(일용직 지급대장 등)
  if (earnings.length === 0 && flags.e && e.totalEarnings > 0) {
    const c = roles.findIndex((x) => x?.kind === "totalEarnings");
    earnings.push({
      label: e.employmentType === "일용" ? "일용근로 지급액" : (h.labels[c] ?? "지급총액"),
      category: "기본급",
      amount: e.totalEarnings,
      source: { sheet: ctx.sheetName, cell: g.addr(r, c) },
    });
    e.issues.push({ level: "info", code: "UNKNOWN_ITEM", message: "지급 항목이 따로 없어 지급총액을 한 줄로 넣었어요.", field: "earnings.0" });
  }

  const se = earnings.reduce((a, b) => a + b.amount, 0);
  const sd = deductions.reduce((a, b) => a + b.amount, 0);
  if (!flags.e) e.totalEarnings = se;
  if (!flags.d) e.totalDeductions = sd;
  if (!flags.n) e.netPay = e.totalEarnings - e.totalDeductions;
  e.id = `e${idx}`;
  return { employee: e, period, payDate, flags };
}

// ---------- 배치 모으기 ----------

type Meta = { company?: string; period?: string; payDate?: string; unit: "원" | "천원"; yearGuessed: boolean };

class BatchCollector {
  private map = new Map<string, PayrollBatch>();
  constructor(private file: RawFile) {}
  add(meta: Meta, sheet: string, e: EmployeePay, rowPeriod?: string, rowPayDate?: string) {
    const period = rowPeriod ?? meta.period ?? "";
    const payDate = rowPayDate ?? meta.payDate;
    const company = meta.company ?? companyFromFileName(this.file.fileName) ?? this.file.fileName.replace(/\.[^.]+$/, "");
    const key = `${company}|${period}`;
    let b = this.map.get(key);
    if (!b) {
      b = {
        id: "",
        companyName: company,
        payPeriod: period,
        payDate,
        sourceFile: this.file.fileName,
        sourceSheet: sheet,
        unit: meta.unit,
        employees: [],
        issues: [],
      };
      if (!meta.company) b.issues.push({ level: "info", code: "LOW_CONFIDENCE", message: `파일 안에서 사업장명을 찾지 못해 '${company}'(으)로 추정했어요.`, field: "companyName" });
      if (meta.yearGuessed) b.issues.push({ level: "info", code: "LOW_CONFIDENCE", message: "파일에 연도가 없어 올해로 가정했어요. 귀속월을 확인해 주세요.", field: "payPeriod" });
      if (!period) b.issues.push({ level: "warning", code: "LOW_CONFIDENCE", message: "귀속월을 찾지 못했어요. 입력해 주세요.", field: "payPeriod" });
      this.map.set(key, b);
    } else if (b.sourceSheet && !b.sourceSheet.split(", ").includes(sheet)) {
      b.sourceSheet += `, ${sheet}`;
    }
    if (!b.payDate && payDate) b.payDate = payDate;
    b.employees.push(e);
  }
  batches(): PayrollBatch[] {
    return [...this.map.values()];
  }
}

// ---------- 시트 종류별 처리 ----------

function metaFrom(texts: string[], file: RawFile, sheetName: string): Meta {
  const all = [file.fileName, sheetName, ...texts].join(" ");
  const year = findYear(all);
  const fallbackYear = year ?? new Date().getFullYear();
  const joined = texts.join(" ");
  const period = findPeriod(joined, fallbackYear) ?? findPeriod(sheetName, fallbackYear) ?? findPeriod(file.fileName, fallbackYear);
  return {
    company: findCompany(texts),
    period,
    payDate: findPayDate(joined, period ? Number(period.slice(0, 4)) : fallbackYear),
    unit: findUnit(all),
    yearGuessed: year === undefined,
  };
}

function parseTableSheet(
  g: Grid,
  ctx: Omit<Ctx, "unitMul">,
  out: BatchCollector,
  layout: TableReport["layout"],
  headers: Header[],
  fileMeta: Partial<Meta>,
  extraTexts: string[] = [],
): TableReport[] {
  const reports: TableReport[] = [];
  const topTexts: string[] = [...extraTexts];
  for (let r = 0; r < headers[0].row; r++) topTexts.push(...rowTexts(g, r));
  const sheetMeta = metaFrom(topTexts, ctx.file, g.name);
  // 같은 파일의 다른 시트(예: 급여대장 시트)에 있는 사업장명·지급일을 빌려 쓴다
  sheetMeta.company ??= fileMeta.company;
  sheetMeta.payDate ??= fileMeta.payDate;

  headers.forEach((h, ti) => {
    const start = (h.subRow ?? h.row) + 1;
    const end = ti + 1 < headers.length ? headers[ti + 1].row : g.rowCount;
    // 표 바로 위 제목 줄(예: "11월분 (2026. 12. 10 지급)", "[2] 시간강사 강사료")
    const prevEnd = ti === 0 ? 0 : (headers[ti - 1].subRow ?? headers[ti - 1].row) + 1;
    const titleTexts: string[] = [];
    for (let r = prevEnd; r < h.row; r++) if (!looksLikeName(g.get(r, h.nameCol))) titleTexts.push(...rowTexts(g, r).filter((t) => !/합계|소계|총계/.test(t)));
    const tableMeta = ti === 0 ? sheetMeta : metaFrom([...titleTexts, ...topTexts], ctx.file, g.name);
    if (ti > 0) {
      const own = metaFrom(titleTexts, ctx.file, g.name);
      tableMeta.period = own.period ?? sheetMeta.period;
      tableMeta.payDate = own.payDate ?? sheetMeta.payDate;
      tableMeta.company = sheetMeta.company;
    }

    const { roles, mappings, unmapped } = mapColumns(h);
    const howMap = new Map<number, string>();
    roles.forEach((_, c) => {
      const m = mappings.find((x) => x.address === h.labelAddr[c]);
      if (m) howMap.set(c, m.how);
    });
    // 표 바로 위 한 줄만 본다(파일 제목의 '급여 및 강사료'에 끌려가지 않게)
    const nearest = (ti === 0 ? topTexts : titleTexts).at(-1) ?? "";
    const hint = /일용/.test(g.name) ? "일용" : /강사/.test(nearest) ? "강사" : undefined;
    const fullCtx: Ctx = { ...ctx, unitMul: tableMeta.unit === "천원" ? 1000 : 1, employmentHint: hint };

    let count = 0;
    for (let r = start; r < end; r++) {
      const res = readRow(g, r, h, roles, howMap, fullCtx, r);
      if (!res) continue;
      const e = res.employee;
      e.issues.push(...checkEmployee(e, { hasTotalEarnings: res.flags.e, hasTotalDeductions: res.flags.d, hasNet: res.flags.n }));
      out.add(tableMeta, g.name, e, res.period, res.payDate);
      count++;
    }
    const title = ti === 0 ? topTexts[0] : titleTexts[titleTexts.length - 1];
    // 뒤집힌 표는 제목·주석 칸도 머리글 줄에 섞여 들어온다
    const realUnmapped = unmapped.filter((u) => u.length <= 15 && !u.startsWith("※"));
    reports.push({ fileName: ctx.file.fileName, sheet: g.name, layout, headerAddress: h.labelAddr[h.nameCol], title, columns: mappings, unmapped: realUnmapped, employeeCount: count });
  });
  return reports;
}

/** 직원 한 명당 시트 하나인 급여지급명세서 양식(지급항목|금액 … 공제항목|금액) */
function parseFormSheet(g: Grid, ctx: Omit<Ctx, "unitMul">, out: BatchCollector): TableReport | undefined {
  let hr = -1, cE = -1, cEA = -1, cD = -1, cDA = -1;
  for (let r = 0; r < g.rowCount && hr < 0; r++) {
    for (let c = 0; c < g.colCount; c++) {
      const n = normalizeLabel(g.get(r, c));
      if (n === "지급항목") { hr = r; cE = c; }
      if (n === "공제항목") cD = c;
    }
  }
  if (hr < 0 || cD < 0) return undefined;
  for (let c = cE + 1; c < g.colCount; c++) if (normalizeLabel(g.get(hr, c)) === "금액") { cEA = c; break; }
  for (let c = cD + 1; c < g.colCount; c++) if (normalizeLabel(g.get(hr, c)) === "금액") { cDA = c; break; }
  if (cEA < 0 || cDA < 0) return undefined;

  const valueRightOf = (key: string): CellValue => {
    for (let r = 0; r < hr; r++)
      for (let c = 0; c < g.colCount - 1; c++)
        if (normalizeLabel(g.get(r, c)) === key) for (let k = c + 1; k < g.colCount; k++) if (g.get(r, k) !== null) return g.get(r, k);
    return null;
  };
  const name = valueRightOf("성명");
  if (!looksLikeName(name)) return undefined;

  const texts: string[] = [];
  for (let r = 0; r < hr; r++) texts.push(...rowTexts(g, r));
  const meta = metaFrom(texts, ctx.file, g.name);
  meta.company = companyFromFileName(ctx.file.fileName);
  const pd = valueRightOf("지급일");
  if (pd !== null) meta.payDate = findDate(String(pd)) ?? meta.payDate;
  const mul = meta.unit === "천원" ? 1000 : 1;

  const e: EmployeePay = { id: `${g.name}`, name: name.trim(), earnings: [], deductions: [], totalEarnings: 0, totalDeductions: 0, netPay: 0, issues: [] };
  const pos = valueRightOf("직위");
  if (typeof pos === "string") e.position = pos;
  const work: NonNullable<EmployeePay["workInfo"]> = {};
  const wd = parseQuantity(valueRightOf("근무일수"));
  if (wd) work.workDays = wd;
  const ot = parseQuantity(valueRightOf("연장근로시간"));
  if (ot) work.overtimeHours = ot;
  if (Object.keys(work).length) e.workInfo = work;

  const flags = { e: false, d: false, n: false };
  const mappings: ColumnMapping[] = [];
  const seen = new Set<string>();
  const take = (r: number, lc: number, ac: number, side: "earning" | "deduction") => {
    const label = g.get(r, lc);
    if (typeof label !== "string" || !label.trim()) return;
    const a = parseAmount(g.get(r, ac));
    let role = lookupRole(label);
    let how: ColumnMapping["how"] = "사전";
    if (!role || role.kind === "ignore") {
      if (a === undefined || a === null) return;
      role = side === "earning" ? { kind: "earning", category: "기타지급" } : { kind: "deduction", category: "기타공제" };
      how = "위치 추정";
    }
    if (!seen.has(label)) { mappings.push({ label: str(label), address: g.addr(r, lc), role, how }); seen.add(label); }
    if (a === undefined || a === null) return;
    const amount = Math.round(a * mul);
    const source = { sheet: g.name, cell: g.addr(r, ac) };
    if (role.kind === "earning" && amount !== 0) e.earnings.push({ label: str(label), category: role.category, amount, source, ...(role.taxFree ? { taxFree: true } : {}) });
    if (role.kind === "deduction" && amount !== 0) e.deductions.push({ label: str(label), category: role.category, amount, source });
    if (role.kind === "totalEarnings") { e.totalEarnings = amount; flags.e = true; }
    if (role.kind === "totalDeductions") { e.totalDeductions = amount; flags.d = true; }
    if (role.kind === "netPay") { e.netPay = amount; flags.n = true; }
    if (how === "위치 추정")
      e.issues.push({ level: "warning", code: "UNKNOWN_ITEM", message: `'${str(label)}'을(를) 표준 항목으로 분류하지 못해 '${role.kind === "earning" || role.kind === "deduction" ? role.category : ""}'(으)로 넣었어요.`, field: role.kind === "earning" ? `earnings.${e.earnings.length - 1}` : `deductions.${e.deductions.length - 1}` });
  };
  for (let r = hr + 1; r < g.rowCount; r++) {
    if (rowTexts(g, r).some((t) => /영수|수령인/.test(t))) break;
    take(r, cE, cEA, "earning");
    take(r, cD, cDA, "deduction");
  }
  if (!flags.e) e.totalEarnings = e.earnings.reduce((a, b) => a + b.amount, 0);
  if (!flags.d) e.totalDeductions = e.deductions.reduce((a, b) => a + b.amount, 0);
  if (!flags.n) e.netPay = e.totalEarnings - e.totalDeductions;
  e.issues.push(...checkEmployee(e, { hasTotalEarnings: flags.e, hasTotalDeductions: flags.d, hasNet: flags.n }));
  out.add(meta, g.name, e);
  return { fileName: ctx.file.fileName, sheet: g.name, layout: "직원별 명세서", headerAddress: g.addr(hr, cE), title: texts[0], columns: mappings, unmapped: [], employeeCount: 1 };
}

// ---------- 진입점 ----------

export function extractFile(file: RawFile): ParseResult {
  const out = new BatchCollector(file);
  const tables: TableReport[] = [];
  const skipped: SkippedSheet[] = [];

  if (file.kind === "pdf" && file.sheets.length === 0) {
    return { batches: [], tables, skipped: [{ fileName: file.fileName, reason: "글자를 찾지 못한 PDF예요. 스캔한 PDF는 아직 읽지 못해요." }] };
  }
  if (file.kind === "unknown") return { batches: [], tables, skipped: [{ fileName: file.fileName, reason: "지원하지 않는 형식이에요." }] };

  // 파일 전체에서 사업장명·지급일 한 번 찾아 두기(시트마다 없을 수 있음)
  const fileMeta: Partial<Meta> = {};
  for (const sheet of file.sheets) {
    const g = gridOf(sheet);
    const hs = findHeaders(g);
    if (!hs.length) continue;
    const texts: string[] = [];
    for (let r = 0; r < hs[0].row; r++) texts.push(...rowTexts(g, r));
    const m = metaFrom(texts, file, sheet.name);
    fileMeta.company ??= m.company;
    fileMeta.payDate ??= m.payDate;
  }

  for (const sheet of file.sheets) {
    const g = gridOf(sheet);
    const ctx = { file, sheetName: sheet.name };
    const form = parseFormSheet(g, ctx, out);
    if (form) {
      tables.push(form);
      continue;
    }
    let headers = findHeaders(g);
    if (headers.length) {
      tables.push(...parseTableSheet(g, ctx, out, "표", headers, fileMeta));
      continue;
    }
    const t = transpose(g);
    headers = findHeaders(t, true);
    if (headers.length) {
      // 뒤집힌 표의 제목("핏담짐 11월 급여 (단위: 천원, 지급일 11/25)")은 원래 시트의 윗줄에 있다
      const extra: string[] = [];
      for (let r = 0; r < Math.min(g.rowCount, 5); r++) {
        const texts = rowTexts(g, r);
        if (texts.some((x) => normalizeLabel(x) === "항목")) break;
        extra.push(...texts);
      }
      tables.push(...parseTableSheet(t, ctx, out, "가로세로 뒤집힌 표", headers, fileMeta, extra));
      continue;
    }
    skipped.push({ fileName: file.fileName, sheet: sheet.name, reason: "급여 표가 아니에요(목록·근태 기록 등). 건너뛰었어요." });
  }

  const batches = out.batches();
  for (const b of batches) {
    if (!b.payDate) b.issues.push({ level: "warning", code: "NO_PAY_DATE", message: "파일에서 지급일을 찾지 못했어요. 명세서에 넣을 지급일을 입력해 주세요.", field: "payDate" });
  }
  return { batches, tables, skipped };
}

export function extractFiles(files: RawFile[], roster?: JaberEmployee[]): ParseResult {
  const result: ParseResult = { batches: [], tables: [], skipped: [] };
  files.forEach((f, fi) => {
    const r = extractFile(f);
    r.batches.forEach((b, bi) => {
      b.id = `f${fi}-b${bi}`;
      b.employees.forEach((e, ei) => (e.id = `${b.id}-e${ei}`));
    });
    result.batches.push(...r.batches);
    result.tables.push(...r.tables);
    result.skipped.push(...r.skipped);
  });
  // 자버 등록 정보(사업장·직원)와 맞춰 연락처·수신동의를 붙인다
  matchJaber(result.batches, roster);
  return result;
}

export type { Issue };
