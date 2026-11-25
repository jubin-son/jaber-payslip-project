"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Store } from "lucide-react";
import { jaberCompanies } from "@/lib/jaber-db";
import { ownerStore, useOwner } from "@/lib/hr-store";
import { STEPS, stepOf } from "./site-header";

// 사업주 화면 왼쪽 메뉴. 맨 위에 내 사업장, 아래로 상위 메뉴 5개(기본 관리·임직원 관리·급여명세서 작성·급여명세서 관리·발송 관리).
// 급여명세서 작성 아래에는 업로드 → 확인·수정 → 명세서 변환 단계를, 발송 관리 아래에는 발송하기·발송 결과를 둔다.
type Item = { href: string; label: string; on: (pathname: string) => boolean; children?: Item[]; numbered?: boolean };

const under = (...prefixes: string[]) => (p: string) => prefixes.some((x) => p === x || p.startsWith(`${x}/`));

const MENU: Item[] = [
  { href: "/settings", label: "기본 관리", on: under("/settings") },
  { href: "/employees", label: "임직원 관리", on: under("/employees") },
  {
    href: "/upload",
    label: "급여명세서 작성",
    on: (p) => stepOf(p) !== undefined,
    numbered: true,
    children: STEPS.map((s) => ({ href: s.href, label: s.label, on: (p: string) => stepOf(p)?.href === s.href })),
  },
  { href: "/records", label: "급여명세서 관리", on: under("/records") },
  {
    href: "/send",
    label: "발송 관리",
    on: under("/send"),
    children: [
      { href: "/send", label: "발송하기", on: (p: string) => p === "/send" },
      { href: "/send/history", label: "발송 결과·재발송", on: under("/send/history") },
    ],
  },
];

export function AdminSidebar() {
  const pathname = usePathname();
  return (
    <nav aria-label="관리 메뉴" className="print:hidden">
      {/* 넓은 화면: 왼쪽 세로 메뉴 */}
      <div className="sticky top-16 hidden w-52 shrink-0 flex-col gap-5 border-r border-neutral-100 bg-white px-4 py-8 lg:flex lg:h-[calc(100vh-4rem)]">
        <MyBusiness />
        <ul className="flex flex-col gap-1">
          {MENU.map((it) => {
            const on = it.on(pathname);
            return (
              <li key={it.href} className="flex flex-col gap-1">
                <Link
                  href={it.href}
                  aria-current={on && !it.children ? "page" : undefined}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                    on
                      ? it.children
                        ? "bg-neutral-100 text-neutral-900"
                        : "bg-neutral-900 text-white"
                      : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                  }`}
                >
                  {it.label}
                </Link>
                {it.children && (
                  <ol className="ml-3 flex flex-col gap-0.5 border-l border-neutral-200 pl-2">
                    {it.children.map((c, i) => {
                      const cOn = c.on(pathname);
                      return (
                        <li key={c.href}>
                          <Link
                            href={c.href}
                            aria-current={cOn ? "page" : undefined}
                            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-medium transition-colors ${
                              cOn ? "bg-neutral-900 text-white" : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                            }`}
                          >
                            {it.numbered && (
                              <span
                                className={`flex size-4 items-center justify-center rounded-full text-[10px] ${
                                  cOn ? "bg-white text-neutral-900" : "bg-neutral-100 text-neutral-500"
                                }`}
                              >
                                {i + 1}
                              </span>
                            )}
                            {c.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </li>
            );
          })}
        </ul>
        <OwnerSwitch />
      </div>
      {/* 좁은 화면: 위쪽 가로 메뉴 (작성 단계는 상단 바의 단계 이동에 나온다) */}
      <div className="flex gap-1 overflow-x-auto border-b border-neutral-100 bg-white px-4 py-2 lg:hidden">
        {MENU.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            aria-current={it.on(pathname) ? "page" : undefined}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${
              it.on(pathname) ? "bg-neutral-900 text-white" : "text-neutral-500 hover:bg-neutral-100"
            }`}
          >
            {it.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

/** 로그인한 사업주의 사업장 (여러 곳이면 가입한 사업장 외 몇 곳인지) */
function MyBusiness() {
  const owner = useOwner();
  const more = owner ? owner.workplaces.length - 1 : 0;
  return (
    <Link href="/settings" className="flex items-center gap-2 rounded-xl bg-neutral-50 px-3 py-2.5 hover:bg-neutral-100">
      <Store className="size-4 shrink-0 text-neutral-500" />
      <span className="flex min-w-0 flex-col">
        <span className="text-[11px] text-muted-foreground">내 사업장{more > 0 ? ` ${more + 1}곳` : ""}</span>
        <span className="truncate text-sm font-bold">
          {owner?.company.name ?? "…"}
          {more > 0 && <span className="font-medium text-muted-foreground"> 외 {more}곳</span>}
        </span>
      </span>
    </Link>
  );
}

/** 로그인이 붙기 전까지 쓰는 테스트용 사업주 바꾸기 (테스트 데이터 16곳 중 하나) */
function OwnerSwitch() {
  const owner = useOwner();
  if (!owner) return null;
  return (
    <label className="mt-auto flex flex-col gap-1 rounded-xl border border-dashed border-neutral-300 p-2 text-[11px] text-muted-foreground">
      테스트: 로그인한 사업주
      <select
        value={owner.login}
        onChange={(e) => ownerStore.set(() => e.target.value)}
        className="rounded-md border bg-white px-1.5 py-1 text-xs text-foreground"
      >
        {jaberCompanies.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}
