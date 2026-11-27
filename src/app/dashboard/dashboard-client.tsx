"use client";
// 월별 급여 대시보드: 쌓인 명세서 기록을 달마다 합산해 추이와 전월 대비 변동을 보여 준다.
// 데이터는 archive-store(localStorage)에서 읽고, 계산은 monthly-stats에서 한다.
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { periodText, won } from "@/app/payslips/use-reviewed";
import { useArchive } from "@/lib/archive-store";
import { useOwner } from "@/lib/hr-store";
import {
  companiesOf,
  compareCategories,
  compareEmployees,
  delta,
  pctText,
  signedWon,
  summarizeMonths,
  type Delta,
  type MonthStat,
} from "@/lib/monthly-stats";

/** 지급·공제는 늘어난 게 빨강, 줄어든 게 파랑 (비용 관점) */
const tone = (diff: number) => (diff > 0 ? "text-rose-600" : diff < 0 ? "text-blue-600" : "text-muted-foreground");

export function DashboardClient() {
  const all = useArchive();
  const owner = useOwner();
  // 로그인한 사업주의 사업장 기록만 본다 (사업장코드가 없는 기록은 이름이 같을 때만)
  const archive =
    all && owner
      ? all.filter((a) => owner.workplaces.some((w) => w.code === a.batch.companyCode || (!a.batch.companyCode && w.name === a.batch.companyName)))
      : null;
  const [company, setCompany] = useState("");
  const [month, setMonth] = useState<string | null>(null);

  if (archive === null) return <p className="text-muted-foreground">불러오는 중…</p>;
  if (archive.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{owner?.company.name ?? "내 사업장"}의 쌓인 명세서가 아직 없어요</CardTitle>
          <CardDescription>급여대장을 올려 명세서로 변환하면 달마다 여기에 모여요.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/upload">급여명세서 작성하러 가기</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const companies = companiesOf(archive);
  const sel = companies.includes(company) ? company : "";
  const stats = summarizeMonths(archive, sel || undefined);
  const curIdx = Math.max(0, month ? stats.findIndex((s) => s.period === month) : stats.length - 1);
  const cur = stats[curIdx];
  const prev = curIdx > 0 ? stats[curIdx - 1] : undefined;

  return (
    <div className="flex flex-col gap-6">
      {/* 보기 조건 */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">사업장</span>
          <select value={sel} onChange={(e) => setCompany(e.target.value)} className="rounded-lg border bg-white px-3 py-1.5">
            <option value="">전체</option>
            {companies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">기준월</span>
          <select value={cur.period} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border bg-white px-3 py-1.5">
            {[...stats].reverse().map((s) => (
              <option key={s.period} value={s.period}>
                {periodText(s.period)}
              </option>
            ))}
          </select>
        </label>
        <span className="text-muted-foreground">{prev ? `${periodText(prev.period)}과 비교` : "비교할 이전 달이 아직 없어요"}</span>
      </div>

      <Kpis cur={cur} prev={prev} />
      <Trend stats={stats} curPeriod={cur.period} />
      {prev ? <Compare cur={cur} prev={prev} /> : <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">다음 달 명세서를 변환하면 지난달과 비교한 변동이 여기에 나와요.</CardContent></Card>}
      {!sel && Object.keys(cur.byCompany).length > 1 && <Companies cur={cur} prev={prev} />}

      <p className="text-xs text-muted-foreground">
        명세서 변환 화면에서 오류 없는 직원만 저장돼요. 기록은 이 브라우저에 있어서, 다른 기기에서 보려면 저장소(Supabase) 연결이 필요해요.
      </p>
    </div>
  );
}

function Change({ d, suffix = "" }: { d: Delta; suffix?: string }) {
  return (
    <span className={`text-xs font-medium tabular-nums ${tone(d.diff)}`}>
      {d.diff === 0 ? "변동 없음" : `${signedWon(d.diff).replace("원", suffix || "원")} (${pctText(d.pct)})`}
    </span>
  );
}

function Kpis({ cur, prev }: { cur: MonthStat; prev?: MonthStat }) {
  const items = [
    { label: "명세서 수(인원)", v: cur.headcount, p: prev?.headcount, fmt: (n: number) => `${n}명`, suffix: "명" },
    { label: "지급 합계", v: cur.totalEarnings, p: prev?.totalEarnings, fmt: won },
    { label: "공제 합계", v: cur.totalDeductions, p: prev?.totalDeductions, fmt: won },
    { label: "실지급액 합계", v: cur.netPay, p: prev?.netPay, fmt: won },
    { label: "1인 평균 실지급액", v: cur.avgNet, p: prev?.avgNet, fmt: won },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {items.map((it) => (
        <Card key={it.label} className="gap-1 py-4">
          <CardHeader className="gap-1 px-4">
            <CardDescription>{it.label}</CardDescription>
            <CardTitle className="text-lg tabular-nums">{it.fmt(it.v)}</CardTitle>
          </CardHeader>
          <CardContent className="px-4">
            {it.p === undefined ? (
              <span className="text-xs text-muted-foreground">전월 없음</span>
            ) : (
              <Change d={delta(it.v, it.p)} suffix={it.suffix} />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** 월별 실지급액 막대 추이 (선택한 달이 진하게) */
function Trend({ stats, curPeriod }: { stats: MonthStat[]; curPeriod: string }) {
  const max = Math.max(...stats.map((s) => s.netPay), 1);
  return (
    <Card>
      <CardHeader>
        <CardTitle>월별 실지급액 추이</CardTitle>
        <CardDescription>달마다 직원에게 실제로 나간 금액의 합계예요.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex h-48 items-end gap-3 overflow-x-auto pb-1">
          {stats.map((s) => {
            const on = s.period === curPeriod;
            return (
              <li key={s.period} className="flex h-full min-w-14 flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[11px] tabular-nums text-muted-foreground">{Math.round(s.netPay / 10000).toLocaleString("ko-KR")}만</span>
                <div
                  className={`w-full max-w-16 rounded-t-md ${on ? "bg-indigo-600" : "bg-indigo-200"}`}
                  style={{ height: `${Math.max((s.netPay / max) * 75, 2)}%` }}
                  title={`${periodText(s.period)} ${won(s.netPay)} · ${s.headcount}명`}
                />
                <span className={`text-xs ${on ? "font-bold" : "text-muted-foreground"}`}>{Number(s.period.slice(5))}월</span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function Compare({ cur, prev }: { cur: MonthStat; prev: MonthStat }) {
  const earn = compareCategories(cur.earnings, prev.earnings);
  const ded = compareCategories(cur.deductions, prev.deductions);
  const people = compareEmployees(cur, prev);
  const news = people.filter((p) => p.kind === "new");
  const left = people.filter((p) => p.kind === "left");
  const changed = people.filter((p) => p.kind === "changed");
  return (
    <>
      <div className="grid gap-6 lg:grid-cols-2">
        <CategoryTable title="지급 항목 비교" cur={cur.period} prev={prev.period} rows={earn} />
        <CategoryTable title="공제 항목 비교" cur={cur.period} prev={prev.period} rows={ded} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>직원별 변동</CardTitle>
          <CardDescription>
            {periodText(prev.period)} → {periodText(cur.period)} · 새로 들어옴 {news.length}명 · 빠짐 {left.length}명 · 금액 달라짐 {changed.length}명
          </CardDescription>
        </CardHeader>
        <CardContent>
          {people.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">지난달과 달라진 직원이 없어요.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">직원</th>
                  <th className="py-2 font-medium">구분</th>
                  <th className="py-2 text-right font-medium">{periodText(prev.period)}</th>
                  <th className="py-2 text-right font-medium">{periodText(cur.period)}</th>
                  <th className="py-2 text-right font-medium">차이</th>
                </tr>
              </thead>
              <tbody>
                {people.slice(0, 30).map((p) => (
                  <tr key={p.key} className="border-b last:border-0">
                    <td className="py-2 font-medium">
                      {p.name} <span className="text-xs font-normal text-muted-foreground">{p.company}</span>
                    </td>
                    <td className="py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${p.kind === "new" ? "bg-emerald-50 text-emerald-700" : p.kind === "left" ? "bg-neutral-100 text-neutral-600" : "bg-amber-50 text-amber-700"}`}>
                        {p.kind === "new" ? "신규" : p.kind === "left" ? "이번 달 없음" : "금액 변동"}
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums">{p.kind === "new" ? "-" : won(p.prev)}</td>
                    <td className="py-2 text-right tabular-nums">{p.kind === "left" ? "-" : won(p.cur)}</td>
                    <td className={`py-2 text-right tabular-nums ${tone(p.diff)}`}>{signedWon(p.diff)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {people.length > 30 && <p className="mt-2 text-xs text-muted-foreground">변동이 큰 순서로 30명까지 보여요. (전체 {people.length}명)</p>}
        </CardContent>
      </Card>
    </>
  );
}

function CategoryTable({ title, cur, prev, rows }: { title: string; cur: string; prev: string; rows: ReturnType<typeof compareCategories> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 font-medium">항목</th>
              <th className="py-2 text-right font-medium">{Number(prev.slice(5))}월</th>
              <th className="py-2 text-right font-medium">{Number(cur.slice(5))}월</th>
              <th className="py-2 text-right font-medium">차이</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.category} className="border-b last:border-0">
                <td className="py-2 font-medium">{r.category}</td>
                <td className="py-2 text-right tabular-nums">{won(r.prev)}</td>
                <td className="py-2 text-right tabular-nums">{won(r.cur)}</td>
                <td className={`py-2 text-right tabular-nums ${tone(r.diff)}`}>
                  {signedWon(r.diff)}
                  {r.diff !== 0 && <span className="ml-1 text-xs">({pctText(r.pct)})</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-muted-foreground">
                  항목이 없어요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function Companies({ cur, prev }: { cur: MonthStat; prev?: MonthStat }) {
  const rows = Object.entries(cur.byCompany).sort((a, b) => b[1].netPay - a[1].netPay);
  return (
    <Card>
      <CardHeader>
        <CardTitle>사업장별 실지급액</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 font-medium">사업장</th>
              <th className="py-2 text-right font-medium">인원</th>
              <th className="py-2 text-right font-medium">실지급액</th>
              <th className="py-2 text-right font-medium">전월 대비</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, c]) => {
              const p = prev?.byCompany[name];
              return (
                <tr key={name} className="border-b last:border-0">
                  <td className="py-2 font-medium">{name}</td>
                  <td className="py-2 text-right tabular-nums">{c.headcount}명</td>
                  <td className="py-2 text-right tabular-nums">{won(c.netPay)}</td>
                  <td className={`py-2 text-right tabular-nums ${p ? tone(c.netPay - p.netPay) : "text-muted-foreground"}`}>
                    {p ? signedWon(c.netPay - p.netPay) : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
