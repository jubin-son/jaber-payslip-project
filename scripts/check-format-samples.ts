// make-format-samples.ts로 만든 파일을 파서에 넣고 정답.json과 비교한다.
// 사용법: npx tsx scripts/check-format-samples.ts [폴더]   (기본: 샘플_양식다양화)
// 파일마다 '직원 수 · 지급합계 · 실지급액'이 정답과 맞는지, 오류·경고가 무엇인지 보여준다.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readBytesAsync } from "../src/lib/parser/read-file";
import { extractFiles } from "../src/lib/parser/extract";

type Expect = { name: string; gross: number; net: number };
type Case = { file: string; shape: string; risk: string; expect: { sheet?: string; period: string; employees: Expect[] }[] };

const dir = process.argv[2] ?? "샘플_양식다양화";
const cases: Case[] = JSON.parse(readFileSync(join(dir, "정답.json"), "utf8"));
const key = (s: string) => s.replace(/\(.*?\)/g, "").replace(/\s/g, "");
const won = (n: number) => n.toLocaleString("ko-KR");

async function main() {
  let pass = 0;
  for (const c of cases) {
    const lines: string[] = [];
    let ok = true;
    try {
      const raw = await readBytesAsync(c.file, new Uint8Array(readFileSync(join(dir, c.file))));
      const res = extractFiles([raw]);
      for (const want of c.expect) {
        const b = want.sheet ? res.batches.find((x) => x.sourceSheet === want.sheet) : res.batches[0];
        if (!b) {
          ok = false;
          lines.push(`   ✗ ${want.sheet ?? ""} 표를 못 찾음 (찾은 표 ${res.batches.length}개, 건너뜀: ${res.skipped.map((s) => `${s.sheet ?? ""} ${s.reason}`).join(" / ") || "-"})`);
          continue;
        }
        const got = new Map(b.employees.map((e) => [key(e.name), e]));
        const wrong: string[] = [];
        for (const w of want.employees) {
          const e = got.get(key(w.name));
          if (!e) wrong.push(`${w.name} 없음`);
          else if (e.totalEarnings !== w.gross || e.netPay !== w.net)
            wrong.push(`${w.name} 지급 ${won(e.totalEarnings)}(정답 ${won(w.gross)}) 실지급 ${won(e.netPay)}(정답 ${won(w.net)})`);
          got.delete(key(w.name));
        }
        const extra = [...got.keys()];
        if (b.payPeriod !== want.period) wrong.push(`귀속월 ${b.payPeriod}(정답 ${want.period})`);
        if (extra.length) wrong.push(`정답에 없는 직원: ${extra.join(", ")}`);
        const issues = [...b.issues, ...b.employees.flatMap((e) => e.issues.map((i) => ({ ...i, message: `${e.name}: ${i.message}` })))]
          .filter((i) => i.level !== "info" && i.code !== "MATCH_NOT_FOUND");
        if (wrong.length) ok = false;
        lines.push(`   ${wrong.length ? "✗" : "✓"} [${b.sourceSheet}] 직원 ${b.employees.length}명${wrong.length ? " · " + wrong.join(" · ") : ""}`);
        for (const i of issues.slice(0, 4)) lines.push(`      ${i.level} ${i.code}: ${i.message.slice(0, 110)}`);
      }
      const unmapped = res.tables.flatMap((t) => t.unmapped);
      const guessed = res.tables.flatMap((t) => t.columns.filter((x) => x.how === "위치 추정").map((x) => x.label));
      if (unmapped.length || guessed.length) lines.push(`      열 추정: ${guessed.join(", ") || "-"} | 미분류: ${unmapped.join(", ") || "-"}`);
    } catch (e) {
      ok = false;
      lines.push(`   ✗ 읽다가 실패: ${(e as Error).message}`);
    }
    if (ok) pass++;
    console.log(`${ok ? "✅" : "❌"} ${c.file}\n${lines.join("\n")}`);
  }
  console.log(`\n정답과 일치: ${pass}/${cases.length}개 파일`);
}

void main();
