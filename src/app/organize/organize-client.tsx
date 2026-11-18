"use client";

import Link from "next/link";
import { useState } from "react";
import type { ColumnRole } from "@/lib/parser/dictionary";
import type { TableReport } from "@/lib/parser/extract";
import { useParseResult } from "@/lib/store";
import type { EmployeePay, Issue, PayrollBatch } from "@/types/payroll";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const won = (n: number) => n.toLocaleString("ko-KR");

function roleLabel(r: ColumnRole): string {
  switch (r.kind) {
    case "earning":
      return `지급 · ${r.category}${r.taxFree ? " (비과세)" : ""}`;
    case "deduction":
      return `공제 · ${r.category}`;
    case "name":
      return "이름";
    case "totalEarnings":
      return "지급합계";
    case "totalDeductions":
      return "공제합계";
    case "netPay":
      return "실지급액";
    case "workDays":
      return "근무일수";
    case "workHours":
      return "근로시간";
    case "overtimeHours":
      return "연장시간";
    case "hourlyWage":
      return "시급";
    case "employmentType":
      return "고용 형태";
    case "department":
      return "부서";
    case "position":
      return "직위";
    case "payPeriod":
      return "귀속월";
    case "payDate":
      return "지급일";
    default:
      return "-";
  }
}

const allIssues = (b: PayrollBatch) => [...b.issues, ...b.employees.flatMap((e) => e.issues)];
const count = (xs: Issue[], level: Issue["level"]) => xs.filter((i) => i.level === level).length;

export function OrganizeClient() {
  const result = useParseResult();

  if (!result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>아직 정리한 파일이 없어요</CardTitle>
          <CardDescription>1단계에서 급여대장을 올리고 &lsquo;AI로 정리하기&rsquo;를 눌러 주세요.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/upload">파일 올리러 가기</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const issues = result.batches.flatMap(allIssues);
  const employees = result.batches.reduce((n, b) => n + b.employees.length, 0);
  const guessed = result.tables.flatMap((t) => t.columns.filter((c) => c.how === "위치 추정"));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="사업장·귀속월" value={result.batches.length} />
        <Stat label="직원" value={employees} />
        <Stat label="오류" value={count(issues, "error")} tone={count(issues, "error") ? "error" : undefined} />
        <Stat label="확인 필요" value={count(issues, "warning")} tone={count(issues, "warning") ? "warning" : undefined} />
      </div>

      <Card className="border-dashed">
        <CardContent className="flex flex-col gap-1 text-sm text-muted-foreground">
          <p>
            열 이름을 표준 항목 사전으로 먼저 분류하고, 금액은 원본 칸에서 그대로 가져와 검산했어요. 사전에 없는 열{" "}
            {guessed.length > 0 && <b className="text-foreground">{guessed.length}개</b>}는 지급·공제 위치로 추정했어요.
          </p>
          <p>Claude API 키를 연결하면 추정한 열과 PDF 급여대장을 AI가 다시 확인해요.</p>
        </CardContent>
      </Card>

      {result.skipped.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">정리하지 않은 파일·시트</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1 text-sm">
              {result.skipped.map((s, i) => (
                <li key={i}>
                  <span className="font-medium">{s.fileName}</span>
                  {s.sheet && <span className="text-muted-foreground"> · {s.sheet}</span>}
                  <span className="text-muted-foreground"> — {s.reason}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <ul className="flex flex-col gap-4">
        {result.batches.map((b) => (
          <li key={b.id}>
            <BatchCard batch={b} tables={result.tables.filter((t) => t.fileName === b.sourceFile && (b.sourceSheet ?? "").split(", ").includes(t.sheet))} />
          </li>
        ))}
      </ul>

      <div className="flex justify-between gap-2">
        <Button variant="outline" asChild>
          <Link href="/upload">← 파일 다시 올리기</Link>
        </Button>
        <Button asChild>
          <Link href="/review">다음: 담당자 확인·수정 →</Link>
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "error" | "warning" }) {
  const color = tone === "error" ? "text-destructive" : tone === "warning" ? "text-amber-600" : "";
  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</span>
      </CardContent>
    </Card>
  );
}

function BatchCard({ batch: b, tables }: { batch: PayrollBatch; tables: TableReport[] }) {
  const [showMap, setShowMap] = useState(false);
  const issues = allIssues(b);
  const errors = count(issues, "error");
  const warns = count(issues, "warning");
  const total = b.employees.reduce((n, e) => n + e.netPay, 0);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-lg">{b.companyName}</CardTitle>
          <Badge variant="secondary">귀속 {b.payPeriod || "?"}</Badge>
          <Badge variant={b.payDate ? "secondary" : "destructive"}>지급일 {b.payDate ?? "없음"}</Badge>
          {b.unit === "천원" && <Badge variant="outline">원본 단위 천원 → 원으로 변환</Badge>}
          {errors > 0 && <Badge variant="destructive">오류 {errors}</Badge>}
          {warns > 0 && <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">확인 {warns}</Badge>}
          {errors + warns === 0 && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">검산 통과</Badge>}
        </div>
        <CardDescription>
          {b.sourceFile}
          {b.sourceSheet && ` · ${b.sourceSheet}`} · 직원 {b.employees.length}명 · 실지급 합계 {won(total)}원
        </CardDescription>
        {b.issues.length > 0 && <IssueList issues={b.issues} />}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-normal">이름</th>
                <th className="hidden px-3 py-2 text-left font-normal sm:table-cell">형태</th>
                <th className="hidden px-3 py-2 text-left font-normal md:table-cell">지급 항목</th>
                <th className="px-3 py-2 text-right font-normal">지급합계</th>
                <th className="px-3 py-2 text-right font-normal">공제합계</th>
                <th className="px-3 py-2 text-right font-normal">실지급액</th>
              </tr>
            </thead>
            <tbody>
              {b.employees.map((e) => (
                <EmployeeRow key={e.id} e={e} />
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <Button variant="link" size="sm" className="px-0" onClick={() => setShowMap((s) => !s)}>
            {showMap ? "열 분류표 접기" : "원본 열을 어떻게 분류했는지 보기"}
          </Button>
          {showMap &&
            tables.map((t, i) => (
              <div key={i} className="mt-2 flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">
                  {t.sheet} · {t.layout} · 머리글 {t.headerAddress}
                  {t.title && ` · ${t.title}`}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {t.columns.map((c, j) => (
                    <span
                      key={j}
                      className={`rounded-md border px-2 py-1 text-xs ${c.how === "위치 추정" ? "border-amber-300 bg-amber-50 text-amber-900" : ""}`}
                      title={`${c.address} · ${c.how}`}
                    >
                      <span className="text-muted-foreground">{c.label}</span> → {roleLabel(c.role)}
                      {c.how === "위치 추정" && " (추정)"}
                    </span>
                  ))}
                </div>
                {t.unmapped.length > 0 && <p className="text-xs text-muted-foreground">분류 안 한 열: {t.unmapped.join(", ")}</p>}
              </div>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}

function EmployeeRow({ e }: { e: EmployeePay }) {
  const shown = e.issues.filter((i) => i.level !== "info");
  return (
    <>
      <tr className="border-t">
        <td className="px-3 py-2 font-medium whitespace-nowrap">{e.name}</td>
        <td className="hidden px-3 py-2 text-muted-foreground sm:table-cell">{e.employmentType ?? "-"}</td>
        <td className="hidden max-w-64 truncate px-3 py-2 text-muted-foreground md:table-cell">{e.earnings.map((i) => i.category).join(", ")}</td>
        <td className="px-3 py-2 text-right tabular-nums">{won(e.totalEarnings)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{won(e.totalDeductions)}</td>
        <td className="px-3 py-2 text-right font-medium tabular-nums">{won(e.netPay)}</td>
      </tr>
      {shown.length > 0 && (
        <tr>
          <td colSpan={6} className="px-3 pb-2 whitespace-normal">
            <IssueList issues={shown} />
          </td>
        </tr>
      )}
    </>
  );
}

function IssueList({ issues }: { issues: Issue[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {issues.map((i, k) => (
        <li
          key={k}
          className={`rounded-md px-2 py-1 text-xs ${
            i.level === "error" ? "bg-red-50 text-red-800" : i.level === "warning" ? "bg-amber-50 text-amber-900" : "bg-muted text-muted-foreground"
          }`}
        >
          {i.message}
        </li>
      ))}
    </ul>
  );
}
