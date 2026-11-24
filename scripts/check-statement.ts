// 임금명세서 기재 확인 메모를 원본 급여대장에 돌려 보는 확인용 스크립트.
// 사용법: npx tsx scripts/check-statement.ts <급여대장 폴더>
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readBytesAsync } from "../src/lib/parser/read-file";
import { extractFiles } from "../src/lib/parser/extract";
import { calcMethodOf, resolveHeadcount, statementNotes } from "../src/lib/wage-statement";

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error("폴더 경로를 넣어 주세요");
  const names = readdirSync(dir).filter((n) => !n.startsWith(".")).sort();
  const files = await Promise.all(names.map((n) => readBytesAsync(n, new Uint8Array(readFileSync(join(dir, n))))));
  const res = extractFiles(files);
  for (const b of res.batches) {
    const hc = resolveHeadcount("자동", b);
    const ctx = { headcount: hc.value, businessIncome: false };
    console.log(`\n■ ${b.companyName} ${b.payPeriod} [${b.sourceSheet}] 인원 ${hc.count} → ${hc.value}`);
    for (const e of b.employees) {
      const methods = e.earnings.map((it) => [it.label, calcMethodOf(it, e, ctx)]).filter(([, m]) => m);
      const notes = statementNotes(e, ctx);
      if (!methods.length && !notes.length) continue;
      console.log(`   ${e.name} ${e.employmentType ?? "-"} ${JSON.stringify(e.workInfo ?? {})}`);
      for (const [l, m] of methods) console.log(`      계산방법 ${l}: ${m}`);
      for (const n of notes) console.log(`      ${n.level}: ${n.message}`);
    }
  }
}
void main();
