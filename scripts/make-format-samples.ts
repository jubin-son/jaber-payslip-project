// 지금 샘플에 없는 '까다로운 양식' 급여대장을 만든다 (노무사·세무 프로그램에서 흔한 모양).
// 같은 직원 4명의 같은 금액을 양식만 바꿔 찍어내서, 파서가 양식과 상관없이 같은 값을 읽는지 본다.
// 사용법: npx tsx scripts/make-format-samples.ts [출력 폴더]   (기본: 샘플_양식다양화)
// 결과: 급여대장 파일들 + 정답.json(파일별 기대값) + 정답표.md
// 모든 상호·이름·금액은 가상이다.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";

const OUT = process.argv[2] ?? "샘플_양식다양화";
const COMPANY = "해담국밥 합정점";
const PERIOD = "2026-11";
const PAY_DATE = "2026-11-25";

const f10 = (n: number) => Math.floor(n / 10) * 10;

type Emp = {
  no: string;
  name: string;
  dept: string;
  base: number;
  meal: number;
  ot: number;
  incomeTax: number;
};

const people: Emp[] = [
  { no: "1001", name: "김자버", dept: "홀", base: 2_300_000, meal: 200_000, ot: 0, incomeTax: 35_600 },
  { no: "1002", name: "이하늘", dept: "주방", base: 2_156_880, meal: 200_000, ot: 154_000, incomeTax: 31_900 },
  { no: "1003", name: "박온유", dept: "홀", base: 1_890_000, meal: 200_000, ot: 0, incomeTax: 18_420 },
  { no: "1004", name: "최다솜", dept: "주방", base: 2_500_000, meal: 200_000, ot: 96_000, incomeTax: 52_700 },
];

/** 2026년 요율로 공제 계산(원 단위 10원 미만 버림). 식대는 비과세라 보험료 기준에서 뺀다 */
function pay(e: Emp, extra: { yearEndTax?: number } = {}) {
  const taxable = e.base + e.ot;
  const np = f10(taxable * 0.0475);
  const hi = f10(taxable * 0.03595);
  const ltc = f10(hi * 0.1314);
  const ei = f10(taxable * 0.009);
  const it = e.incomeTax;
  const lt = f10(it * 0.1);
  const yeIt = extra.yearEndTax ?? 0; // 연말정산 소득세(음수면 환급)
  const yeLt = yeIt === 0 ? 0 : Math.trunc(yeIt / 100) * 10; // 지방소득세 정산분 = 10%
  const gross = e.base + e.meal + e.ot;
  const ded = np + hi + ltc + ei + it + lt + yeIt + yeLt;
  return { ...e, taxable, np, hi, ltc, ei, it, lt, yeIt, yeLt, gross, ded, net: gross - ded };
}
type Pay = ReturnType<typeof pay>;
const rows = people.map((e) => pay(e));

type Expect = { name: string; gross: number; net: number };
type Case = {
  file: string;
  shape: string; // 어떤 양식인지
  risk: string; // 파서가 틀리기 쉬운 지점
  expect: { sheet?: string; period: string; employees: Expect[] }[];
};
const cases: Case[] = [];
const exp = (list: Pay[]): Expect[] => list.map((p) => ({ name: p.name, gross: p.gross, net: p.net }));

const head = [`상호: ${COMPANY}`, null, null, `귀속연월: 2026년 11월`, null, null, `지급일: ${PAY_DATE}`];

function save(wb: XLSX.WorkBook, file: string, bookType: XLSX.BookType = "xlsx") {
  XLSX.writeFile(wb, join(OUT, file), { bookType });
}
function book(...sheets: [string, XLSX.WorkSheet][]) {
  const wb = XLSX.utils.book_new();
  for (const [n, ws] of sheets) XLSX.utils.book_append_sheet(wb, ws, n);
  return wb;
}
const merge = (r1: number, c1: number, r2: number, c2: number): XLSX.Range => ({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });

mkdirSync(OUT, { recursive: true });

// 1) 한 사람이 두 줄: 윗줄 지급, 아랫줄 공제 (세무 프로그램 급여대장 출력에서 흔함)
{
  const aoa: unknown[][] = [
    head,
    [],
    ["사번", "성명", "기본급", "식대", "연장수당", null, "지급합계", null, null],
    [null, "부서", "국민연금", "건강보험", "장기요양", "고용보험", "소득세", "지방소득세", "공제합계", "차인지급액"],
  ];
  for (const p of rows) {
    aoa.push([p.no, p.name, p.base, p.meal, p.ot, null, p.gross]);
    aoa.push([null, p.dept, p.np, p.hi, p.ltc, p.ei, p.it, p.lt, p.ded, p.net]);
  }
  save(book(["급여대장", XLSX.utils.aoa_to_sheet(aoa)]), "01_두줄1인_세무프로그램출력.xlsx");
  cases.push({
    file: "01_두줄1인_세무프로그램출력.xlsx",
    shape: "직원 1명이 두 줄(윗줄 지급, 아랫줄 공제). 헤더도 두 줄",
    risk: "아랫줄(부서명 '홀'·'주방')을 직원으로 읽거나, 공제 줄을 놓쳐 공제 0원",
    expect: [{ period: PERIOD, employees: exp(rows) }],
  });
}

// 2) 병합된 2단 헤더 + 사업주 부담분 4대보험 열 (노무사 임금대장)
{
  const aoa: unknown[][] = [
    head,
    [],
    ["성명", "지급내역", null, null, null, "근로자 공제내역", null, null, null, null, null, null, "차인지급액", "사업주 부담분", null, null, null],
    [null, "기본급", "식대", "연장근로수당", "지급계", "국민연금", "건강보험", "장기요양보험", "고용보험", "소득세", "지방소득세", "공제계", null, "국민연금", "건강보험", "장기요양보험", "고용보험"],
  ];
  for (const p of rows)
    aoa.push([p.name, p.base, p.meal, p.ot, p.gross, p.np, p.hi, p.ltc, p.ei, p.it, p.lt, p.ded, p.net, p.np, p.hi, p.ltc, f10(p.taxable * 0.0115)]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = [merge(2, 0, 3, 0), merge(2, 1, 2, 4), merge(2, 5, 2, 11), merge(2, 12, 3, 12), merge(2, 13, 2, 16)];
  save(book(["임금대장", ws]), "02_병합헤더_사업주부담포함_노무사.xlsx");
  cases.push({
    file: "02_병합헤더_사업주부담포함_노무사.xlsx",
    shape: "'지급내역/공제내역/사업주 부담분' 병합 2단 헤더. 같은 이름(국민연금 등) 열이 두 번 나옴",
    risk: "사업주 부담분을 직원 공제로 더해 공제가 두 배가 되거나, 같은 이름 열 중 뒤의 것을 읽음",
    expect: [{ period: PERIOD, employees: exp(rows) }],
  });
}

// 3) 부서별 소계 행과 총계 행이 직원 사이에 섞임
{
  const header = ["부서", "성명", "기본급", "식대", "연장수당", "지급총액", "국민연금", "건강보험", "장기요양", "고용보험", "소득세", "지방소득세", "공제총액", "실지급액"];
  const line = (p: Pay) => [p.dept, p.name, p.base, p.meal, p.ot, p.gross, p.np, p.hi, p.ltc, p.ei, p.it, p.lt, p.ded, p.net];
  const sum = (label: string, list: Pay[]) => {
    const keys = ["base", "meal", "ot", "gross", "np", "hi", "ltc", "ei", "it", "lt", "ded", "net"] as const;
    return [label, null, ...keys.map((k) => list.reduce((a, p) => a + p[k], 0))];
  };
  const hall = rows.filter((p) => p.dept === "홀");
  const kitchen = rows.filter((p) => p.dept === "주방");
  const aoa: unknown[][] = [head, [], header, ...hall.map(line), sum("홀 소계", hall), ...kitchen.map(line), sum("주방 소계", kitchen), sum("총계", rows)];
  save(book(["11월", XLSX.utils.aoa_to_sheet(aoa)]), "03_부서별소계_총계섞임.xlsx");
  cases.push({
    file: "03_부서별소계_총계섞임.xlsx",
    shape: "부서별 직원 뒤에 '홀 소계', '주방 소계', 맨 끝에 '총계' 행",
    risk: "소계·총계 행을 직원으로 읽어 인원이 7명이 되거나 인건비가 두 배",
    expect: [{ period: PERIOD, employees: exp(rows) }],
  });
}

// 4) 세로형: 항목이 행, 직원이 열 (소규모 사업장 노무사 지급내역에서 흔함)
{
  const items: [string, (p: Pay) => number][] = [
    ["기본급", (p) => p.base],
    ["식대", (p) => p.meal],
    ["연장근로수당", (p) => p.ot],
    ["지급합계", (p) => p.gross],
    ["국민연금", (p) => p.np],
    ["건강보험", (p) => p.hi],
    ["장기요양보험", (p) => p.ltc],
    ["고용보험", (p) => p.ei],
    ["소득세", (p) => p.it],
    ["지방소득세", (p) => p.lt],
    ["공제합계", (p) => p.ded],
    ["실지급액", (p) => p.net],
  ];
  const aoa: unknown[][] = [head, [], ["항목", ...rows.map((p) => p.name)], ...items.map(([k, f]) => [k, ...rows.map(f)])];
  save(book(["지급내역", XLSX.utils.aoa_to_sheet(aoa)]), "04_세로형_항목이행_직원이열.xlsx");
  cases.push({
    file: "04_세로형_항목이행_직원이열.xlsx",
    shape: "가로세로가 바뀐 표: 첫 열에 항목, 직원 이름이 머리글 줄에 가로로",
    risk: "표를 못 찾거나, 항목 이름('기본급' 등)을 직원으로 읽음",
    expect: [{ period: PERIOD, employees: exp(rows) }],
  });
}

// 5) 금액이 글자: "2,300,000원", 0은 "-", 이름에 직책 괄호·가운데 공백
{
  const won = (n: number) => (n === 0 ? "-" : `${n.toLocaleString("ko-KR")}원`);
  const names = ["김자버(점장)", "이 하늘", "박온유 ", "최다솜(주방장)"];
  const aoa: unknown[][] = [
    head,
    [],
    ["성명", "기본급", "식대", "연장수당", "지급합계", "국민연금", "건강보험", "장기요양", "고용보험", "소득세", "지방소득세", "공제합계", "차인지급액"],
    ...rows.map((p, i) => [names[i], won(p.base), won(p.meal), won(p.ot), won(p.gross), won(p.np), won(p.hi), won(p.ltc), won(p.ei), won(p.it), won(p.lt), won(p.ded), won(p.net)]),
  ];
  save(book(["급여", XLSX.utils.aoa_to_sheet(aoa)]), "05_금액글자_이름괄호공백.xlsx");
  cases.push({
    file: "05_금액글자_이름괄호공백.xlsx",
    shape: "숫자 대신 '2,300,000원' 같은 글자, 0원은 '-'. 이름이 '김자버(점장)', '이 하늘', 끝 공백",
    risk: "글자 금액을 0으로 읽거나, 이름을 그대로 써서 직원 명부와 매칭 실패",
    expect: [{ period: PERIOD, employees: exp(rows) }],
  });
}

// 6) 구형 엑셀(.xls, 97-2003)
{
  const aoa: unknown[][] = [
    head,
    [],
    ["성명", "기본급", "식대", "연장수당", "지급합계", "국민연금", "건강보험", "장기요양", "고용보험", "소득세", "지방소득세", "공제합계", "차인지급액"],
    ...rows.map((p) => [p.name, p.base, p.meal, p.ot, p.gross, p.np, p.hi, p.ltc, p.ei, p.it, p.lt, p.ded, p.net]),
  ];
  save(book(["Sheet1", XLSX.utils.aoa_to_sheet(aoa)]), "06_구형엑셀_97-2003.xls", "biff8");
  cases.push({
    file: "06_구형엑셀_97-2003.xls",
    shape: "엑셀 97-2003 형식(.xls). 오래된 급여 프로그램이 아직 이 형식으로 내보냄",
    risk: "형식을 못 읽음",
    expect: [{ period: PERIOD, employees: exp(rows) }],
  });
}

// 7) 같은 달 급여와 상여가 시트 두 장 (명절·연말 상여를 따로 지급)
{
  const bonus = rows.map((p) => {
    const b = p.base / 2;
    const ei = f10(b * 0.009);
    const it = f10(b * 0.06);
    const lt = f10(it * 0.1);
    return { name: p.name, bonus: b, ei, it, lt, ded: ei + it + lt, net: b - ei - it - lt };
  });
  const main = XLSX.utils.aoa_to_sheet([
    head,
    [],
    ["성명", "기본급", "식대", "연장수당", "지급합계", "국민연금", "건강보험", "장기요양", "고용보험", "소득세", "지방소득세", "공제합계", "차인지급액"],
    ...rows.map((p) => [p.name, p.base, p.meal, p.ot, p.gross, p.np, p.hi, p.ltc, p.ei, p.it, p.lt, p.ded, p.net]),
  ]);
  const bonusWs = XLSX.utils.aoa_to_sheet([
    [`상호: ${COMPANY}`, null, null, "귀속연월: 2026년 11월 (상여)", null, null, `지급일: ${PAY_DATE}`],
    [],
    ["성명", "상여금", "고용보험", "소득세", "지방소득세", "공제합계", "차인지급액"],
    ...bonus.map((b) => [b.name, b.bonus, b.ei, b.it, b.lt, b.ded, b.net]),
  ]);
  save(book(["급여", main], ["상여", bonusWs]), "07_급여상여_시트분리.xlsx");
  cases.push({
    file: "07_급여상여_시트분리.xlsx",
    shape: "같은 귀속월에 '급여' 시트와 '상여' 시트",
    risk: "같은 직원이 두 번 나와 명세서·발송이 두 번 됨. 한 장(급여+상여)으로 합쳐야 함",
    // 같은 달 같은 직원은 명세서 한 장으로 합친다(급여 + 상여)
    expect: [{ period: PERIOD, employees: rows.map((p, i) => ({ name: p.name, gross: p.gross + bonus[i].bonus, net: p.net + bonus[i].net })) }],
  });
}

// 8) 연말정산 정산분이 공제 열로 따로 (환급이면 음수)
{
  const ye = [pay(people[0], { yearEndTax: -128_400 }), pay(people[1], { yearEndTax: 46_200 }), pay(people[2]), pay(people[3], { yearEndTax: -9_870 })];
  const aoa: unknown[][] = [
    [`상호: ${COMPANY}`, null, null, "귀속연월: 2027년 2월", null, null, "지급일: 2027-02-25"],
    [],
    ["성명", "기본급", "식대", "연장수당", "지급합계", "국민연금", "건강보험", "장기요양", "고용보험", "소득세", "지방소득세", "연말정산소득세", "연말정산지방소득세", "공제합계", "차인지급액"],
    ...ye.map((p) => [p.name, p.base, p.meal, p.ot, p.gross, p.np, p.hi, p.ltc, p.ei, p.it, p.lt, p.yeIt, p.yeLt, p.ded, p.net]),
  ];
  save(book(["2월", XLSX.utils.aoa_to_sheet(aoa)]), "08_연말정산_환급음수.xlsx");
  cases.push({
    file: "08_연말정산_환급음수.xlsx",
    shape: "2월 급여에 '연말정산소득세·지방소득세' 열. 환급은 음수(-128,400 등)",
    risk: "정산 열을 일반 소득세와 같은 항목으로 합쳐 덮어쓰거나, 음수를 빼먹어 실지급액 불일치",
    expect: [{ period: "2027-02", employees: exp(ye) }],
  });
}

writeFileSync(join(OUT, "정답.json"), JSON.stringify(cases, null, 2));
const md = [
  "# 양식 다양화 샘플 정답표",
  "",
  `\`scripts/make-format-samples.ts\`로 만든 파일이에요. 상호(${COMPANY})·이름·금액은 모두 가상이에요.`,
  "같은 직원 4명의 같은 금액을 양식만 바꿔 담았어요. 파서는 양식과 상관없이 아래 값을 읽어야 해요.",
  "",
  "| 파일 | 양식 | 틀리기 쉬운 곳 |",
  "|---|---|---|",
  ...cases.map((c) => `| ${c.file} | ${c.shape} | ${c.risk} |`),
  "",
  "## 직원별 기대값 (급여, 2026년 11월)",
  "",
  "| 성명 | 지급합계 | 실지급액 |",
  "|---|---:|---:|",
  ...rows.map((p) => `| ${p.name} | ${p.gross.toLocaleString("ko-KR")} | ${p.net.toLocaleString("ko-KR")} |`),
  "",
  "07(상여 시트)·08(연말정산) 기대값은 정답.json에 있어요.",
];
writeFileSync(join(OUT, "정답표.md"), md.join("\n") + "\n");
console.log(`${cases.length}개 양식 → ${OUT}/`);
