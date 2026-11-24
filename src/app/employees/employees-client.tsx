"use client";
// 임직원 관리: 사업주가 내 사업장 직원을 ① 엑셀 업로드 또는 직접 입력으로 등록하고 ② 목록에서 고친다(회원번호 6자리 자동 부여).
// 소득 구분(근로소득·사업소득 3.3%)도 직원마다 여기서 정한다. 사업소득으로 정한 직원은 명세서 제목이 '사업소득 지급명세서'가 된다.
// 명부는 hr-store(localStorage)에 두고, 급여대장을 올리면 이 명부로 직원을 찾는다. 화면에는 내 사업장 직원만 나온다.
import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Download, FileSpreadsheet, Pencil, RotateCcw, Trash2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { INCOME_TYPES, jaberCompanies, type IncomeType, type JaberCompany, type JaberEmployee } from "@/lib/jaber-db";
import { findCompanyByName, normBirth, normName } from "@/lib/jaber-match";
import { nextMemberId, rosterStore, useOwner } from "@/lib/hr-store";
import { decodeCsv } from "@/lib/parser/read-file";

/** 등록할 때 넣는 값 (회원번호·등록일은 자동) */
type Draft = Omit<JaberEmployee, "memberId" | "registeredAt">;
/** 엑셀 한 줄을 읽은 결과 */
type Row = { line: number; draft?: Draft; problem?: string; raw: string };

const today = () => new Date().toLocaleDateString("sv-SE"); // yyyy-mm-dd

/** 엑셀 머리글 → 칸. 자버 직원연락처 내려받기 형식도 그대로 읽는다 (사업장 칸은 다른 사업장 직원이 섞였는지 볼 때만 쓴다) */
const HEADERS: Record<keyof Draft | "ignore", string[]> = {
  companyName: ["사업장명", "사업장", "상호", "회사명"],
  name: ["이름", "성명", "직원명"],
  birthDate: ["생년월일", "생일"],
  phone: ["전화번호", "휴대전화", "휴대폰", "연락처", "핸드폰"],
  address: ["주소"],
  email: ["이메일", "메일", "email"],
  kakaoConsent: ["알림톡수신동의", "알림톡", "수신동의", "알림톡동의"],
  incomeType: ["소득구분", "소득유형", "소득종류"],
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

/** 소득 구분 칸 읽기. 비어 있으면 근로소득, 읽을 수 없으면 undefined */
function incomeFrom(v: unknown): IncomeType | undefined {
  const s = norm(v);
  if (!s) return "근로소득";
  if (/사업|3\.3|프리|강사|용역/.test(s)) return "사업소득";
  if (/근로|급여|정규|직원|월급|시급|일용/.test(s)) return "근로소득";
  return undefined;
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

function readRows(fileName: string, buf: ArrayBuffer, roster: JaberEmployee[], own: JaberCompany): { rows: Row[]; error?: string } {
  // CSV는 인코딩(UTF-8·CP949)을 먼저 맞춰서 글자로 읽는다. 바이트째 넘기면 한글 머리글이 깨진다
  const wb = /\.csv$/i.test(fileName)
    ? XLSX.read(decodeCsv(new Uint8Array(buf)).text, { type: "string", cellDates: true })
    : XLSX.read(buf, { cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { rows: [], error: "시트를 찾지 못했어요." };
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true });
  // 머리글 줄: '이름' 칸이 있는 첫 줄
  const hi = grid.findIndex((r) => r.map(fieldOf).includes("name"));
  if (hi < 0) return { rows: [], error: "머리글에서 '이름' 칸을 찾지 못했어요. 양식을 내려받아 맞춰 주세요." };
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
    if (!name) {
      rows.push({ line: r + 1, raw, problem: "이름이 비어 있어요" });
      continue;
    }
    // 사업장 칸이 있고 다른 사업장으로 읽히면 내 직원이 아니다
    const cc = cellText(get("companyCode"));
    const cn = cellText(get("companyName"));
    const listed = (cc && jaberCompanies.find((c) => c.code === cc)) || (cn ? findCompanyByName(cn) : undefined);
    if (listed && listed.code !== own.code) {
      rows.push({ line: r + 1, raw, problem: `다른 사업장(${listed.name}) 직원이에요` });
      continue;
    }
    const birthText = cellText(get("birthDate"));
    const birthDate = normBirth(birthText);
    if (birthText && !birthDate) {
      rows.push({ line: r + 1, raw, problem: `생년월일 '${birthText}'을(를) 읽지 못했어요` });
      continue;
    }
    const incomeText = cellText(get("incomeType"));
    const incomeType = incomeFrom(incomeText);
    if (!incomeType) {
      rows.push({ line: r + 1, raw, problem: `소득구분 '${incomeText}'을(를) 읽지 못했어요 (근로소득·사업소득)` });
      continue;
    }
    const draft: Draft = {
      companyCode: own.code,
      companyName: own.name,
      name,
      birthDate,
      incomeType,
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
  const owner = useOwner();
  /** 방금 등록한 회원번호 (목록에서 강조) */
  const [fresh, setFresh] = useState<string[]>([]);
  const [mode, setMode] = useState<"none" | "excel" | "manual">("none");

  if (!roster || !owner) return <p className="text-muted-foreground">불러오는 중…</p>;
  const own = owner.company;

  function done(ids: string[]) {
    setFresh(ids);
    setMode("none");
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">① 직원 등록</CardTitle>
          <CardDescription>
            {own.name} 직원을 엑셀 양식으로 한 번에 올리거나, 한 명씩 직접 입력해요. 이름 · 생년월일 · 전화번호 · 주소 · 알림톡 수신동의 · 소득 구분을 받아요.
          </CardDescription>
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
          {mode === "excel" && <ExcelImport roster={roster} own={own} onDone={done} onCancel={() => setMode("none")} />}
          {mode === "manual" && <ManualForm roster={roster} own={own} onDone={done} onCancel={() => setMode("none")} />}
        </CardContent>
      </Card>

      <RosterList key={own.code} roster={roster} own={own} fresh={fresh} />
    </div>
  );
}

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ["이름", "생년월일", "전화번호", "주소", "알림톡 수신동의", "소득구분"],
    ["홍길동", "1995-03-12", "010-0000-0000", "서울특별시 마포구 와우산로 00", "Y", "근로소득"],
    ["김강사", "1988-07-01", "010-0000-0001", "서울특별시 마포구 와우산로 01", "Y", "사업소득"],
  ]);
  ws["!cols"] = [{ wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 32 }, { wch: 14 }, { wch: 12 }];
  // 소득구분 칸 안내 (비워 두면 근로소득)
  ws["F1"].c = [{ a: "자버", t: "근로소득: 4대보험·근로소득세를 떼는 직원\n사업소득: 3.3%를 떼는 프리랜서·강사\n비워 두면 근로소득으로 등록돼요" }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "직원목록");
  XLSX.writeFile(wb, "자버_임직원_등록양식.xlsx");
}

// ---------- 엑셀로 올리기 ----------

function ExcelImport({ roster, own, onDone, onCancel }: { roster: JaberEmployee[]; own: JaberCompany; onDone: (ids: string[]) => void; onCancel: () => void }) {
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
      const res = readRows(f.name, await f.arrayBuffer(), roster, own);
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
        <span className="text-sm text-muted-foreground">{file ?? "이름 칸이 있는 엑셀(.xlsx·.csv)을 골라 주세요."}</span>
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
                    {r.draft.name}
                    {r.draft.birthDate && <span className="font-normal text-muted-foreground"> · {r.draft.birthDate}</span>}
                    <span className="font-normal text-muted-foreground"> · {r.draft.incomeType ?? "근로소득"}</span>
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

function ManualForm({ roster, own, onDone, onCancel }: { roster: JaberEmployee[]; own: JaberCompany; onDone: (ids: string[]) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [consent, setConsent] = useState(true);
  const [incomeType, setIncomeType] = useState<IncomeType>("근로소득");
  const draft: Draft | null = name.trim()
    ? {
        companyCode: own.code,
        companyName: own.name,
        name: name.trim(),
        birthDate: birthDate || undefined,
        incomeType,
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
      <label className={field}>
        <span className="font-medium">소득 구분</span>
        <IncomeSelect value={incomeType} onChange={setIncomeType} className={box} />
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
        {dup && <span className="mr-auto text-sm text-amber-800">이름·생년월일이 같은 직원이 이미 있어요.</span>}
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

function RosterList({ roster, own, fresh }: { roster: JaberEmployee[]; own: JaberCompany; fresh: string[] }) {
  const [q, setQ] = useState("");
  /** 내 사업장 직원만 */
  const mine = useMemo(() => roster.filter((e) => e.companyCode === own.code), [roster, own.code]);
  /** 지금 고치고 있는 직원의 회원번호 (한 번에 한 명만) */
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = roster.find((e) => e.memberId === editingId);
  const rows = useMemo(() => {
    const key = normName(q);
    const digits = q.replace(/\D/g, "");
    return mine
      .filter((e) => !key || normName(e.name).includes(key) || (!!digits && (e.phone ?? "").replace(/\D/g, "").includes(digits)))
      .sort((a, b) => b.memberId.localeCompare(a.memberId));
  }, [mine, q]);

  /** 체크한 직원의 회원번호. 검색으로 안 보이게 된 직원은 지우는 대상에서 뺀다 */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const visiblePicked = rows.filter((e) => picked.has(e.memberId));
  const allPicked = rows.length > 0 && visiblePicked.length === rows.length;

  function toggle(id: string, on: boolean) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function toggleAll(on: boolean) {
    setPicked(on ? new Set(rows.map((e) => e.memberId)) : new Set());
  }
  function removeIds(ids: string[], what: string) {
    if (ids.length === 0 || !window.confirm(`${what} 명부에서 지울까요? 되돌릴 수 없어요.`)) return;
    const del = new Set(ids);
    rosterStore.set((prev) => prev.filter((x) => !del.has(x.memberId)));
    setPicked((prev) => new Set([...prev].filter((id) => !del.has(id))));
  }
  function remove(e: JaberEmployee) {
    removeIds([e.memberId], `${e.name}(${e.memberId}) 직원을`);
  }
  function removePicked() {
    const names = visiblePicked.map((e) => e.name);
    const shown = names.length > 3 ? `${names.slice(0, 3).join(", ")} 외 ${names.length - 3}명` : names.join(", ");
    removeIds(
      visiblePicked.map((e) => e.memberId),
      `선택한 직원 ${visiblePicked.length}명(${shown})을`,
    );
  }
  function resetAll() {
    if (!window.confirm("직접 등록·수정·삭제한 내용을 지우고 처음 테스트 데이터(자버 직원연락처)로 되돌릴까요? 테스트로 고른 다른 사업장 명부도 함께 되돌아가요.")) return;
    rosterStore.reset();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">② 등록된 임직원 {mine.length}명</CardTitle>
        <CardDescription>급여대장을 올리면 이 명부에서 직원을 찾아 연락처·알림톡 수신동의·소득 구분을 붙여요. 사업소득(3.3%)으로 정한 직원은 명세서가 &lsquo;사업소득 지급명세서&rsquo;로 나가요. 연필 버튼으로 한 명씩 고치고, 체크해서 여러 명을 한 번에 지울 수 있어요.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input aria-label="이름·전화번호 검색" placeholder="이름·전화번호 검색" value={q} onChange={(e) => setQ(e.target.value)} className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm sm:max-w-60" />
          <span className="text-sm text-muted-foreground">{rows.length}명</span>
          <Button variant="outline" size="sm" className="ml-auto" disabled={visiblePicked.length === 0} onClick={removePicked}>
            <Trash2 className="size-4" /> 선택 삭제{visiblePicked.length > 0 ? ` ${visiblePicked.length}명` : ""}
          </Button>
          <Button variant="ghost" size="sm" onClick={resetAll}>
            <RotateCcw className="size-4" /> 테스트 데이터로 되돌리기
          </Button>
        </div>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[780px] text-sm">
            <thead className="bg-neutral-50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="보이는 직원 모두 선택"
                    checked={allPicked}
                    ref={(el) => {
                      if (el) el.indeterminate = visiblePicked.length > 0 && !allPicked;
                    }}
                    onChange={(ev) => toggleAll(ev.target.checked)}
                    className="size-4 align-middle"
                  />
                </th>
                <th className="px-3 py-2 font-medium">회원번호</th>
                <th className="px-3 py-2 font-medium">이름</th>
                <th className="px-3 py-2 font-medium">생년월일</th>
                <th className="px-3 py-2 font-medium">전화번호</th>
                <th className="px-3 py-2 font-medium">주소</th>
                <th className="px-3 py-2 font-medium">소득 구분</th>
                <th className="px-3 py-2 font-medium">알림톡</th>
                <th className="px-3 py-2 font-medium">등록일</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr
                  key={e.memberId}
                  className={`border-t ${e.memberId === editingId ? "bg-amber-50" : picked.has(e.memberId) ? "bg-neutral-100" : fresh.includes(e.memberId) ? "bg-indigo-50" : ""}`}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`${e.name} 선택`}
                      checked={picked.has(e.memberId)}
                      onChange={(ev) => toggle(e.memberId, ev.target.checked)}
                      className="size-4 align-middle"
                    />
                  </td>
                  <td className="px-3 py-2 font-mono tabular-nums">{e.memberId}</td>
                  <td className="px-3 py-2 font-medium">
                    {e.name}
                    {fresh.includes(e.memberId) && <span className="ml-1.5 rounded bg-indigo-100 px-1 text-[11px] font-semibold text-indigo-700">새로 등록</span>}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{e.birthDate ?? <span className="text-muted-foreground">-</span>}</td>
                  <td className="px-3 py-2 tabular-nums">{e.phone ?? <span className="text-muted-foreground">-</span>}</td>
                  <td className="max-w-56 truncate px-3 py-2" title={e.address}>
                    {e.address ?? <span className="text-muted-foreground">-</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {e.incomeType === "사업소득" ? (
                      <span className="rounded bg-violet-50 px-1.5 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-200">사업소득 3.3%</span>
                    ) : (
                      <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-700">근로소득</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{e.kakaoConsent ? <span className="text-emerald-700">동의</span> : <span className="text-muted-foreground">미동의</span>}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{e.registeredAt}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button type="button" aria-label={`${e.name} 수정`} onClick={() => setEditingId(e.memberId)} className="mr-2 text-neutral-400 hover:text-neutral-900">
                      <Pencil className="size-4" />
                    </button>
                    <button type="button" aria-label={`${e.name} 삭제`} onClick={() => remove(e)} className="text-neutral-400 hover:text-red-600">
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                    조건에 맞는 직원이 없어요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {editing && <EditDialog key={editing.memberId} e={editing} roster={roster} onClose={() => setEditingId(null)} />}
      </CardContent>
    </Card>
  );
}

/** 직원 한 명을 고치는 팝업. 표가 좁아도 다 보이도록 화면 가운데에 띄운다. 회원번호·등록일은 바꾸지 않는다 */
function EditDialog({ e, roster, onClose }: { e: JaberEmployee; roster: JaberEmployee[]; onClose: () => void }) {
  const [name, setName] = useState(e.name);
  const [birthDate, setBirthDate] = useState(e.birthDate ?? "");
  const [phone, setPhone] = useState(e.phone ?? "");
  const [address, setAddress] = useState(e.address ?? "");
  const [consent, setConsent] = useState(e.kakaoConsent);
  const [incomeType, setIncomeType] = useState<IncomeType>(e.incomeType ?? "근로소득");
  const draft: Draft | null = name.trim()
    ? {
        companyCode: e.companyCode,
        companyName: e.companyName,
        name: name.trim(),
        birthDate: birthDate || undefined,
        incomeType,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        email: e.email,
        kakaoConsent: consent,
      }
    : null;
  // 자기 자신은 빼고 중복을 본다
  const dup = draft ? isDuplicate(roster.filter((x) => x.memberId !== e.memberId), draft) : false;

  function save() {
    if (!draft || dup) return;
    rosterStore.set((prev) => prev.map((x) => (x.memberId === e.memberId ? { ...x, ...draft } : x)));
    onClose();
  }
  const box = "w-full min-w-0 rounded-lg border bg-white px-3 py-2 text-sm";
  const field = "flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground";
  const onKey = (ev: React.KeyboardEvent) => {
    if (ev.key === "Enter" && (ev.target as HTMLElement).tagName === "INPUT") save();
    if (ev.key === "Escape") onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={`${e.name} 직원 정보 수정`} onKeyDown={onKey} className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-lg font-bold">직원 정보 수정</h3>
            <p className="text-xs text-muted-foreground">
              회원번호 <span className="font-mono">{e.memberId}</span> · 등록일 {e.registeredAt} · 회원번호와 등록일은 바뀌지 않아요
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={field}>
              이름
              <input autoFocus value={name} onChange={(ev) => setName(ev.target.value)} className={box} />
            </label>
            <label className={field}>
              생년월일
              <input type="date" value={birthDate} onChange={(ev) => setBirthDate(ev.target.value)} className={box} />
            </label>
            <label className={field}>
              전화번호
              <input inputMode="tel" value={phone} onChange={(ev) => setPhone(ev.target.value)} className={box} />
            </label>
            <label className={field}>
              소득 구분
              <IncomeSelect value={incomeType} onChange={setIncomeType} className={box} />
            </label>
            <label className={`${field} sm:col-span-2`}>
              주소
              <input value={address} onChange={(ev) => setAddress(ev.target.value)} className={box} />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={consent} onChange={(ev) => setConsent(ev.target.checked)} className="size-4" />
              알림톡 수신에 동의했어요
            </label>
            {dup && <span className="text-sm text-amber-800">같은 사업장에 이름·생년월일이 같은 직원이 이미 있어요.</span>}
            <span className="ml-auto flex gap-2">
              <Button size="sm" variant="ghost" onClick={onClose}>
                취소
              </Button>
              <Button size="sm" onClick={save} disabled={!draft || dup}>
                저장
              </Button>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 소득 구분 고르기 (근로소득·사업소득) */
function IncomeSelect({ value, onChange, className = "" }: { value: IncomeType; onChange: (v: IncomeType) => void; className?: string }) {
  return (
    <select value={value} onChange={(ev) => onChange(ev.target.value as IncomeType)} className={className}>
      {INCOME_TYPES.map((t) => (
        <option key={t} value={t}>
          {t === "근로소득" ? "근로소득 (4대보험·근로소득세)" : "사업소득 (3.3% 프리랜서·강사)"}
        </option>
      ))}
    </select>
  );
}
