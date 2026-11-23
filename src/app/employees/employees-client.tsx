"use client";
// 임직원 관리: ① 엑셀 업로드 또는 직접 입력으로 직원 등록 ② 등록된 직원 목록(회원번호 6자리 자동 부여)
// 명부는 hr-store(localStorage)에 두고, 급여대장을 올리면 이 명부로 직원을 찾는다.
import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Download, FileSpreadsheet, RotateCcw, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { jaberCompanies, type JaberEmployee } from "@/lib/jaber-db";
import { findCompanyByName, normBirth, normName } from "@/lib/jaber-match";
import { nextMemberId, rosterStore } from "@/lib/hr-store";
import { decodeCsv } from "@/lib/parser/read-file";

/** 등록할 때 넣는 값 (회원번호·등록일은 자동) */
type Draft = Omit<JaberEmployee, "memberId" | "registeredAt">;
/** 엑셀 한 줄을 읽은 결과 */
type Row = { line: number; draft?: Draft; problem?: string; raw: string };

const today = () => new Date().toLocaleDateString("sv-SE"); // yyyy-mm-dd

/** 엑셀 머리글 → 칸. 자버 직원연락처 내려받기 형식도 그대로 읽는다 */
const HEADERS: Record<keyof Draft | "ignore", string[]> = {
  companyName: ["사업장명", "사업장", "상호", "회사명"],
  name: ["이름", "성명", "직원명"],
  birthDate: ["생년월일", "생일"],
  phone: ["전화번호", "휴대전화", "휴대폰", "연락처", "핸드폰"],
  address: ["주소"],
  email: ["이메일", "메일", "email"],
  kakaoConsent: ["알림톡수신동의", "알림톡", "수신동의", "알림톡동의"],
  companyCode: ["사업장코드"],
  ignore: [],
};
const norm = (v: unknown) => String(v ?? "").replace(/\s/g, "").toLowerCase();

function fieldOf(header: unknown): keyof Draft | undefined {
  const h = norm(header);
  for (const [f, names] of Object.entries(HEADERS)) if (f !== "ignore" && names.some((n) => norm(n) === h)) return f as keyof Draft;
  return undefined;
}

function yes(v: unknown): boolean {
  return ["y", "yes", "o", "동의", "true", "1", "예", "✓", "v"].includes(norm(v));
}

function cellText(v: unknown): string {
  if (v instanceof Date) return v.toLocaleDateString("sv-SE");
  return String(v ?? "").trim();
}

/** 같은 사업장에 이름·생년월일이 같은 직원이 이미 있으면 중복으로 본다 */
function isDuplicate(roster: JaberEmployee[], d: Draft): boolean {
  return roster.some(
    (e) => e.companyCode === d.companyCode && normName(e.name) === normName(d.name) && (!e.birthDate || !d.birthDate || e.birthDate === d.birthDate),
  );
}

function readRows(fileName: string, buf: ArrayBuffer, roster: JaberEmployee[]): { rows: Row[]; error?: string } {
  // CSV는 인코딩(UTF-8·CP949)을 먼저 맞춰서 글자로 읽는다. 바이트째 넘기면 한글 머리글이 깨진다
  const wb = /\.csv$/i.test(fileName)
    ? XLSX.read(decodeCsv(new Uint8Array(buf)).text, { type: "string", cellDates: true })
    : XLSX.read(buf, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { rows: [], error: "시트를 찾지 못했어요." };
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true });
  // 머리글 줄: '이름'과 '사업장' 칸이 있는 첫 줄
  const hi = grid.findIndex((r) => {
    const fs = r.map(fieldOf);
    return fs.includes("name") && (fs.includes("companyName") || fs.includes("companyCode"));
  });
  if (hi < 0) return { rows: [], error: "머리글에서 '사업장명'과 '이름' 칸을 찾지 못했어요. 양식을 내려받아 맞춰 주세요." };
  const cols = grid[hi].map(fieldOf);
  const col = (f: keyof Draft) => cols.indexOf(f);
  const seen: Draft[] = [];
  const rows: Row[] = [];
  for (let r = hi + 1; r < grid.length; r++) {
    const line = grid[r];
    if (!line || line.every((v) => cellText(v) === "")) continue;
    const get = (f: keyof Draft) => (col(f) >= 0 ? line[col(f)] : null);
    const raw = line.map(cellText).filter(Boolean).join(" · ");
    const name = cellText(get("name"));
    const company =
      (cellText(get("companyCode")) && jaberCompanies.find((c) => c.code === cellText(get("companyCode")))) ||
      findCompanyByName(cellText(get("companyName")));
    if (!name) {
      rows.push({ line: r + 1, raw, problem: "이름이 비어 있어요" });
      continue;
    }
    if (!company) {
      const cn = cellText(get("companyName"));
      rows.push({ line: r + 1, raw, problem: cn ? `자버에 가입한 사업장 중 '${cn}'을(를) 찾지 못했어요` : "사업장명이 비어 있어요" });
      continue;
    }
    const birthText = cellText(get("birthDate"));
    const birthDate = normBirth(birthText);
    if (birthText && !birthDate) {
      rows.push({ line: r + 1, raw, problem: `생년월일 '${birthText}'을(를) 읽지 못했어요` });
      continue;
    }
    const draft: Draft = {
      companyCode: company.code,
      companyName: company.name,
      name,
      birthDate,
      phone: cellText(get("phone")) || undefined,
      address: cellText(get("address")) || undefined,
      email: cellText(get("email")) || undefined,
      kakaoConsent: yes(get("kakaoConsent")),
    };
    if (isDuplicate(roster, draft) || isDuplicate(seen as JaberEmployee[], draft)) {
      rows.push({ line: r + 1, raw, draft, problem: "이미 등록된 직원이에요" });
      continue;
    }
    seen.push(draft);
    rows.push({ line: r + 1, raw, draft });
  }
  return { rows };
}

function register(drafts: Draft[]): string[] {
  const ids: string[] = [];
  rosterStore.set((prev) => {
    const next = [...prev];
    for (const d of drafts) {
      const memberId = nextMemberId(next);
      ids.push(memberId);
      next.push({ ...d, memberId, registeredAt: today() });
    }
    return next;
  });
  return ids;
}

export function EmployeesClient() {
  const roster = rosterStore.use();
  /** 방금 등록한 회원번호 (목록에서 강조) */
  const [fresh, setFresh] = useState<string[]>([]);
  const [mode, setMode] = useState<"none" | "excel" | "manual">("none");

  if (!roster) return <p className="text-muted-foreground">불러오는 중…</p>;

  function done(ids: string[]) {
    setFresh(ids);
    setMode("none");
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">① 직원 등록</CardTitle>
          <CardDescription>엑셀 양식으로 한 번에 올리거나, 한 명씩 직접 입력해요. 사업장명 · 이름 · 생년월일 · 전화번호 · 주소 · 알림톡 수신동의를 받아요.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Button variant={mode === "excel" ? "default" : "outline"} onClick={() => setMode(mode === "excel" ? "none" : "excel")}>
              <FileSpreadsheet className="size-4" /> 엑셀로 올리기
            </Button>
            <Button variant={mode === "manual" ? "default" : "outline"} onClick={() => setMode(mode === "manual" ? "none" : "manual")}>
              <UserPlus className="size-4" /> 직접 입력
            </Button>
            <Button variant="ghost" onClick={downloadTemplate}>
              <Download className="size-4" /> 엑셀 양식 내려받기
            </Button>
          </div>
          {mode === "excel" && <ExcelImport roster={roster} onDone={done} onCancel={() => setMode("none")} />}
          {mode === "manual" && <ManualForm roster={roster} onDone={done} onCancel={() => setMode("none")} />}
        </CardContent>
      </Card>

      <RosterList roster={roster} fresh={fresh} />
    </div>
  );
}

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ["사업장명", "이름", "생년월일", "전화번호", "주소", "알림톡 수신동의"],
    ["라임결네일 홍대", "홍길동", "1995-03-12", "010-0000-0000", "서울특별시 마포구 와우산로 00", "Y"],
  ]);
  ws["!cols"] = [{ wch: 20 }, { wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 32 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "직원목록");
  XLSX.writeFile(wb, "자버_임직원_등록양식.xlsx");
}

// ---------- 엑셀로 올리기 ----------

function ExcelImport({ roster, onDone, onCancel }: { roster: JaberEmployee[]; onDone: (ids: string[]) => void; onCancel: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const good = rows.filter((r) => r.draft && !r.problem);

  async function pick(f: File | undefined) {
    if (!f) return;
    setFile(f.name);
    setError(null);
    try {
      const res = readRows(f.name, await f.arrayBuffer(), roster);
      setRows(res.rows);
      if (res.error) setError(res.error);
      else if (res.rows.length === 0) setError("등록할 직원 줄이 없어요.");
    } catch (e) {
      console.error(e);
      setRows([]);
      setError("엑셀 파일을 읽지 못했어요.");
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed p-4">
      <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => input.current?.click()}>
          파일 고르기
        </Button>
        <span className="text-sm text-muted-foreground">{file ?? "사업장명·이름 칸이 있는 엑셀(.xlsx·.csv)을 골라 주세요."}</span>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {rows.length > 0 && (
        <>
          <ul className="flex max-h-72 flex-col divide-y overflow-y-auto rounded-lg border text-sm">
            {rows.map((r) => (
              <li key={r.line} className={`flex flex-wrap items-baseline gap-x-3 px-3 py-1.5 ${r.problem ? "bg-amber-50" : ""}`}>
                <span className="w-12 shrink-0 text-xs text-muted-foreground">{r.line}행</span>
                {r.draft ? (
                  <span className="font-medium">
                    {r.draft.name} <span className="font-normal text-muted-foreground">· {r.draft.companyName}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">{r.raw}</span>
                )}
                {r.problem ? <span className="ml-auto text-xs text-amber-800">{r.problem}</span> : <span className="ml-auto text-xs text-emerald-700">등록 가능</span>}
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-end gap-2">
            <span className="mr-auto text-sm text-muted-foreground">
              {good.length}명 등록 가능{rows.length - good.length > 0 ? ` · ${rows.length - good.length}줄은 건너뛰어요` : ""}
            </span>
            <Button variant="ghost" size="sm" onClick={onCancel}>
              취소
            </Button>
            <Button size="sm" disabled={good.length === 0} onClick={() => onDone(register(good.map((r) => r.draft!)))}>
              {good.length}명 등록
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- 직접 입력 ----------

function ManualForm({ roster, onDone, onCancel }: { roster: JaberEmployee[]; onDone: (ids: string[]) => void; onCancel: () => void }) {
  const [companyCode, setCompanyCode] = useState(jaberCompanies[0]?.code ?? "");
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [consent, setConsent] = useState(true);
  const company = jaberCompanies.find((c) => c.code === companyCode);
  const draft: Draft | null =
    company && name.trim()
      ? {
          companyCode,
          companyName: company.name,
          name: name.trim(),
          birthDate: birthDate || undefined,
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
          kakaoConsent: consent,
        }
      : null;
  const dup = draft ? isDuplicate(roster, draft) : false;
  const field = "flex flex-col gap-1 text-sm";
  const box = "rounded-lg border bg-white px-3 py-2";

  return (
    <form
      className="grid gap-3 rounded-xl border border-dashed p-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (draft && !dup) onDone(register([draft]));
      }}
    >
      <label className={field}>
        <span className="font-medium">사업장명</span>
        <select value={companyCode} onChange={(e) => setCompanyCode(e.target.value)} className={box}>
          {jaberCompanies.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className={field}>
        <span className="font-medium">이름</span>
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" className={box} />
      </label>
      <label className={field}>
        <span className="font-medium">생년월일</span>
        <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className={box} />
      </label>
      <label className={field}>
        <span className="font-medium">전화번호</span>
        <input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-0000-0000" className={box} />
      </label>
      <label className={`${field} sm:col-span-2`}>
        <span className="font-medium">주소</span>
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="서울특별시 …" className={box} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="size-4" />
        알림톡 수신에 동의했어요
      </label>
      <div className="flex items-center justify-end gap-2 sm:col-span-2">
        {dup && <span className="mr-auto text-sm text-amber-800">같은 사업장에 이름·생년월일이 같은 직원이 이미 있어요.</span>}
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          취소
        </Button>
        <Button type="submit" size="sm" disabled={!draft || dup}>
          등록
        </Button>
      </div>
    </form>
  );
}

// ---------- ② 등록된 직원 목록 ----------

function RosterList({ roster, fresh }: { roster: JaberEmployee[]; fresh: string[] }) {
  const [company, setCompany] = useState("");
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const key = normName(q);
    const digits = q.replace(/\D/g, "");
    return roster
      .filter((e) => !company || e.companyCode === company)
      .filter((e) => !key || normName(e.name).includes(key) || (!!digits && (e.phone ?? "").replace(/\D/g, "").includes(digits)))
      .sort((a, b) => b.memberId.localeCompare(a.memberId));
  }, [roster, company, q]);

  function remove(e: JaberEmployee) {
    if (!window.confirm(`${e.companyName} ${e.name}(${e.memberId}) 직원을 명부에서 지울까요?`)) return;
    rosterStore.set((prev) => prev.filter((x) => x.memberId !== e.memberId));
  }
  function resetAll() {
    if (!window.confirm("직접 등록·삭제한 내용을 지우고 처음 테스트 데이터(자버 직원연락처 69명)로 되돌릴까요?")) return;
    rosterStore.reset();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">② 등록된 임직원 {roster.length}명</CardTitle>
        <CardDescription>급여대장을 올리면 이 명부에서 직원을 찾아 연락처와 알림톡 수신동의를 붙여요. 회원번호는 등록할 때 자동으로 붙어요.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="사업장으로 거르기" value={company} onChange={(e) => setCompany(e.target.value)} className="rounded-lg border bg-white px-2 py-2 text-sm">
            <option value="">전체 사업장</option>
            {jaberCompanies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <input aria-label="이름·전화번호 검색" placeholder="이름·전화번호 검색" value={q} onChange={(e) => setQ(e.target.value)} className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm sm:max-w-60" />
          <span className="text-sm text-muted-foreground">{rows.length}명</span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={resetAll}>
            <RotateCcw className="size-4" /> 테스트 데이터로 되돌리기
          </Button>
        </div>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">회원번호</th>
                <th className="px-3 py-2 font-medium">사업장명</th>
                <th className="px-3 py-2 font-medium">이름</th>
                <th className="px-3 py-2 font-medium">생년월일</th>
                <th className="px-3 py-2 font-medium">전화번호</th>
                <th className="px-3 py-2 font-medium">주소</th>
                <th className="px-3 py-2 font-medium">알림톡</th>
                <th className="px-3 py-2 font-medium">등록일</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.memberId} className={`border-t ${fresh.includes(e.memberId) ? "bg-indigo-50" : ""}`}>
                  <td className="px-3 py-2 font-mono tabular-nums">{e.memberId}</td>
                  <td className="px-3 py-2">{e.companyName}</td>
                  <td className="px-3 py-2 font-medium">
                    {e.name}
                    {fresh.includes(e.memberId) && <span className="ml-1.5 rounded bg-indigo-100 px-1 text-[11px] font-semibold text-indigo-700">새로 등록</span>}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{e.birthDate ?? <span className="text-muted-foreground">-</span>}</td>
                  <td className="px-3 py-2 tabular-nums">{e.phone ?? <span className="text-muted-foreground">-</span>}</td>
                  <td className="max-w-56 truncate px-3 py-2" title={e.address}>
                    {e.address ?? <span className="text-muted-foreground">-</span>}
                  </td>
                  <td className="px-3 py-2">{e.kakaoConsent ? <span className="text-emerald-700">동의</span> : <span className="text-muted-foreground">미동의</span>}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{e.registeredAt}</td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" aria-label={`${e.name} 삭제`} onClick={() => remove(e)} className="text-neutral-400 hover:text-red-600">
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                    조건에 맞는 직원이 없어요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
