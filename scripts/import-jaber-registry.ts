// 자버 관리자 화면에서 내려받은 등록 정보 엑셀 2개(사업장목록·직원연락처)를 앱 데이터 파일(JSON)로 바꾼다.
// 사용법: npx tsx scripts/import-jaber-registry.ts <사업장목록.xlsx> <직원연락처.xlsx>
// 결과: src/data/jaber/companies.json, src/data/jaber/employees.json (덮어씀)
// 값은 엑셀에 적힌 그대로 둔다(휴대전화 표기·직원명 등). 빈칸은 필드를 빼고, 날짜는 "yyyy-mm-dd" 글자로 바꾼다.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";
import type { JaberCompany, JaberEmployee } from "../src/lib/jaber-db";

type Row = Record<string, unknown>;

function readSheet(path: string, sheetName: string): Row[] {
  const wb = XLSX.read(readFileSync(path), { type: "buffer", cellDates: true });
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`${path}에 '${sheetName}' 시트가 없어요 (있는 시트: ${wb.SheetNames.join(", ")})`);
  return XLSX.utils.sheet_to_json<Row>(ws, { raw: true, defval: null });
}

function text(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

function need(row: Row, col: string, where: string): string {
  const v = text(row[col]);
  if (!v) throw new Error(`${where}: '${col}' 칸이 비어 있어요`);
  return v;
}

/** 빈 값(undefined) 필드를 빼서 JSON을 깔끔하게 */
function compact<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

const WRITERS = ["세무사", "노무사", "사장"] as const;

function main() {
  const [companyPath, employeePath] = process.argv.slice(2);
  if (!companyPath || !employeePath) throw new Error("사업장목록.xlsx와 직원연락처.xlsx 경로를 차례로 넣어 주세요");

  const companies: JaberCompany[] = readSheet(companyPath, "사업장목록").map((r, i) => {
    const where = `사업장목록 ${i + 2}행`;
    const writer = need(r, "급여대장 작성", where);
    if (!(WRITERS as readonly string[]).includes(writer)) throw new Error(`${where}: 급여대장 작성 '${writer}'는 세무사·노무사·사장 중 하나여야 해요`);
    return compact({
      code: need(r, "사업장코드", where),
      name: need(r, "상호", where),
      owner: need(r, "대표자", where),
      bizRegNo: need(r, "사업자등록번호", where),
      industry: text(r["업종"]),
      address: text(r["사업장 주소"]),
      ownerPhone: text(r["대표자 휴대전화"]),
      payrollWriter: writer as JaberCompany["payrollWriter"],
      payrollOffice: text(r["급여대장 작성 사무소"]),
      joinedAt: need(r, "자버 가입일", where),
    });
  });

  const codes = new Set(companies.map((c) => c.code));
  if (codes.size !== companies.length) throw new Error("사업장코드가 겹치는 행이 있어요");

  const employees: JaberEmployee[] = readSheet(employeePath, "직원목록").map((r, i) => {
    const where = `직원목록 ${i + 2}행`;
    const consent = need(r, "알림톡 수신동의", where).toUpperCase();
    if (consent !== "Y" && consent !== "N") throw new Error(`${where}: 알림톡 수신동의는 Y/N이어야 해요 ('${consent}')`);
    const companyCode = need(r, "사업장코드", where);
    if (!codes.has(companyCode)) throw new Error(`${where}: 사업장목록에 없는 사업장코드 ${companyCode}`);
    return compact({
      memberId: need(r, "회원번호", where),
      companyCode,
      companyName: need(r, "사업장명", where),
      name: need(r, "직원명", where),
      birthDate: text(r["생년월일"]),
      phone: text(r["휴대전화"]),
      email: text(r["이메일"]),
      kakaoConsent: consent === "Y",
      registeredAt: need(r, "등록일", where),
    });
  });

  const ids = new Set(employees.map((e) => e.memberId));
  if (ids.size !== employees.length) throw new Error("회원번호가 겹치는 행이 있어요");

  const outDir = join(__dirname, "..", "src", "data", "jaber");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "companies.json"), JSON.stringify(companies, null, 2) + "\n");
  writeFileSync(join(outDir, "employees.json"), JSON.stringify(employees, null, 2) + "\n");
  console.log(`사업장 ${companies.length}곳, 직원 ${employees.length}명을 저장했어요 → ${outDir}`);
}

main();
