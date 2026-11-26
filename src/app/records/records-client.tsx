"use client";
// 급여명세서 관리: 변환한 명세서를 귀속월 → 사업장 → 직원 순으로 찾아 본다.
// 기록은 archive-store(localStorage)에 있어서 이 브라우저에 남는다. 명세서 변환 화면을 열 때마다 최신 내용으로 저장된다.
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PayslipCard } from "@/app/payslips/payslip-card";
import { periodText, won } from "@/app/payslips/use-reviewed";
import { removeArchived, useArchive, type ArchivedPayslips } from "@/lib/archive-store";

/** "11. 19. 14:32" */
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

export function RecordsClient() {
  const archive = useArchive();
  const [month, setMonth] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [empId, setEmpId] = useState<string | null>(null);
  const [q, setQ] = useState("");

  if (archive === null) return <p className="text-muted-foreground">불러오는 중…</p>;
  if (archive.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>아직 저장된 명세서가 없어요</CardTitle>
          <CardDescription>급여대장을 올려 명세서로 변환하면 여기에 귀속월별로 쌓여요.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/upload">급여명세서 작성하러 가기</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // 귀속월 목록(1월이 위, 12월이 아래). 처음에는 가장 최근 달을 연다
  const months = [...new Set(archive.map((a) => a.batch.payPeriod))].sort();
  const curMonth = month && months.includes(month) ? month : months[months.length - 1];
  const inMonth = archive.filter((a) => a.batch.payPeriod === curMonth);
  const cur: ArchivedPayslips = inMonth.find((a) => a.key === key) ?? inMonth[0];
  const keyword = q.trim();
  const employees = cur.batch.employees.filter((e) => !keyword || e.name.includes(keyword));
  const selected = employees.find((e) => e.id === empId) ?? employees[0] ?? null;

  const monthTotal = (m: string) => archive.filter((a) => a.batch.payPeriod === m).reduce((n, a) => n + a.batch.employees.length, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
      {/* 월 목록 */}
      <ul className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible" aria-label="귀속월">
        {months.map((m) => (
          <li key={m} className="shrink-0">
            <button
              type="button"
              aria-current={m === curMonth ? "true" : undefined}
              onClick={() => {
                setMonth(m);
                setKey(null);
                setEmpId(null);
              }}
              className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                m === curMonth ? "border-neutral-900 bg-neutral-900 text-white" : "bg-white hover:bg-neutral-100"
              }`}
            >
              <span className="font-semibold">{periodText(m)}</span>
              <span className={`text-xs ${m === curMonth ? "text-neutral-300" : "text-muted-foreground"}`}>{monthTotal(m)}장</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="flex min-w-0 flex-col gap-6">
        {/* 사업장 */}
        {inMonth.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">사업장</span>
            {inMonth.map((a) => (
              <Button
                key={a.key}
                size="sm"
                variant={a.key === cur.key ? "default" : "outline"}
                onClick={() => {
                  setKey(a.key);
                  setEmpId(null);
                }}
              >
                {a.batch.companyName}
              </Button>
            ))}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardDescription>{periodText(cur.batch.payPeriod)} 급여명세서</CardDescription>
            <CardTitle className="text-xl">{cur.batch.companyName}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span>
              명세서 <b>{cur.batch.employees.length}</b>장
            </span>
            <span>
              실지급액 합계 <b>{won(cur.batch.employees.reduce((n, e) => n + e.netPay, 0))}</b>
            </span>
            <span className="text-muted-foreground">원본 {cur.batch.sourceFile}</span>
            <span className="text-muted-foreground">저장 {fmtTime(cur.savedAt)}</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => {
                if (window.confirm(`${cur.batch.companyName} ${periodText(cur.batch.payPeriod)} 기록을 삭제할까요?`)) {
                  removeArchived(cur.key);
                  setKey(null);
                  setEmpId(null);
                }
              }}
            >
              기록 삭제
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="flex flex-col gap-2">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="직원 이름 검색"
              className="rounded-lg border bg-white px-3 py-2 text-sm"
            />
            <ul className="flex flex-col gap-2">
              {employees.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => setEmpId(e.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg border p-3 text-left ${
                      selected?.id === e.id ? "border-foreground bg-muted" : "bg-white hover:bg-neutral-50"
                    }`}
                  >
                    <span className="truncate font-medium">{e.name}</span>
                    <span className="shrink-0 tabular-nums">{won(e.netPay)}</span>
                  </button>
                </li>
              ))}
              {employees.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">해당하는 직원이 없어요.</li>}
            </ul>
          </div>
          <div className="flex flex-col gap-2">
            {selected && (
              <>
                <p className="text-sm text-muted-foreground">저장된 명세서 · {selected.name}</p>
                <PayslipCard batch={cur.batch} employee={selected} />
              </>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          기록은 이 브라우저에 저장돼요. 다른 기기에서도 보려면 저장소(Supabase) 연결이 필요해요.
        </p>
      </div>
    </div>
  );
}
