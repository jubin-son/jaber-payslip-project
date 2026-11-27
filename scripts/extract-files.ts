// 급여대장 폴더를 2단계 정리까지 돌려 보는 확인용 스크립트.
// 사용법: npx tsx scripts/extract-files.ts <급여대장 폴더> [--json]
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { readBytesAsync } from "../src/lib/parser/read-file";
import { extractFiles } from "../src/lib/parser/extract";

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error("폴더 경로를 넣어 주세요");
  // 하위 폴더(예: 월별 급여대장/)는 건너뛴다. 그 폴더는 따로 넣어 돌린다
  const names = readdirSync(dir)
    .filter((n) => !n.startsWith(".") && statSync(join(dir, n)).isFile())
    .sort();
  const files = await Promise.all(names.map((n) => readBytesAsync(n, new Uint8Array(readFileSync(join(dir, n))))));
  const res = extractFiles(files);
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(res, null, 2));
    process.exit(0);
  }
  const won = (n: number) => n.toLocaleString("ko-KR");
  for (const b of res.batches) {
    const errs = b.employees.flatMap((e) => e.issues).filter((i) => i.level === "error").length;
    const warns = b.employees.flatMap((e) => e.issues).filter((i) => i.level === "warning").length + b.issues.filter((i) => i.level === "warning").length;
    console.log(`\n■ ${b.companyName} | 귀속 ${b.payPeriod} | 지급 ${b.payDate ?? "?"} | 단위 ${b.unit} | ${b.sourceFile} [${b.sourceSheet}] | 직원 ${b.employees.length} | 오류 ${errs} 경고 ${warns}`);
    for (const i of b.issues) console.log(`   (파일) ${i.level} ${i.code}: ${i.message}`);
    for (const e of b.employees) {
      console.log(`   ${e.name.padEnd(8)} ${e.employmentType ?? "-"} 지급 ${won(e.totalEarnings)} 공제 ${won(e.totalDeductions)} 실지급 ${won(e.netPay)}  [${e.earnings.map((i) => i.category).join(",")}] [${e.deductions.map((i) => i.category).join(",")}]`);
      for (const i of e.issues) console.log(`      ${i.level} ${i.code}: ${i.message}`);
    }
  }
  console.log("\n== 건너뜀");
  for (const s of res.skipped) console.log(`   ${s.fileName} ${s.sheet ?? ""}: ${s.reason}`);
  console.log("\n== 위치 추정·미분류 열");
  for (const t of res.tables) {
    const g = t.columns.filter((c) => c.how === "위치 추정").map((c) => c.label);
    if (g.length || t.unmapped.length) console.log(`   ${t.fileName} [${t.sheet}] 추정: ${g.join(", ") || "-"} | 미분류: ${t.unmapped.join(", ") || "-"}`);
  }
}

void main();
