// 급여대장 원본 폴더를 1단계 리더로 읽어 보는 확인용 스크립트.
// 사용법: npx tsx scripts/inspect-files.ts <급여대장 폴더 경로>
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readBytes } from "../src/lib/parser/read-file";

const dir = process.argv[2];
if (!dir) {
  console.error("폴더 경로를 넣어 주세요: npx tsx scripts/inspect-files.ts <폴더>");
  process.exit(1);
}
const show = (v: unknown) => (v === null ? "·" : String(v)).slice(0, 14);

for (const name of readdirSync(dir).filter((n) => !n.startsWith(".")).sort()) {
  const f = readBytes(name, new Uint8Array(readFileSync(join(dir, name))));
  console.log(`\n■ ${name} [${f.kind}${f.encoding ? ", " + f.encoding : ""}] ${f.warnings.join(" ")}`);
  if (f.kind === "pdf") console.log(`  PDF ${f.pdfBytes?.length} bytes → AI가 직접 읽을 예정`);
  for (const s of f.sheets) {
    console.log(`  - 시트 "${s.name}" ${s.rowCount}행 × ${s.colCount}열 (시작 ${s.origin.row + 1}행)`);
    for (const r of s.rows.slice(0, 4)) console.log("    | " + r.slice(0, 9).map(show).join(" | "));
  }
}
