"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Store } from "lucide-react";
import { jaberCompanies } from "@/lib/jaber-db";
import { ownerStore, useOwner } from "@/lib/hr-store";

// 사업주 화면 왼쪽 메뉴. 맨 위에 내 사업장, 아래로 인건비 관리(기본 관리·임직원 관리)와 급여명세서·발송 관리.
type Item = { href: string; label: string; /** 이 경로들에 있으면 이 메뉴를 켠다 */ match: string[] };

const GROUPS: { title?: string; items: Item[] }[] = [
  {
    title: "인건비 관리",
    items: [
      { href: "/settings", label: "기본 관리", match: ["/settings"] },
      { href: "/employees", label: "임직원 관리", match: ["/employees"] },
    ],
  },
  {
    items: [
      { href: "/upload", label: "급여명세서", match: ["/upload", "/organize", "/review", "/payslips"] },
      { href: "/send", label: "발송 관리", match: ["/send"] },
    ],
  },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const isOn = (it: Item) => it.match.some((m) => pathname.startsWith(m));
  return (
    <nav aria-label="관리 메뉴" className="print:hidden">
      {/* 넓은 화면: 왼쪽 세로 메뉴 */}
      <div className="sticky top-16 hidden w-52 shrink-0 flex-col gap-5 border-r border-neutral-100 bg-white px-4 py-8 lg:flex lg:h-[calc(100vh-4rem)]">
        <MyBusiness />
        {GROUPS.map((g, gi) => (
          <div key={gi} className={`flex flex-col gap-1 ${gi > 0 ? "border-t border-neutral-200 pt-5" : ""}`}>
            {g.title && <p className="px-3 pb-1 text-sm font-bold text-neutral-900">{g.title}</p>}
            {g.items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                aria-current={isOn(it) ? "page" : undefined}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${g.title ? "pl-5" : ""} ${
                  isOn(it) ? "bg-neutral-900 text-white" : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                }`}
              >
                {it.label}
              </Link>
            ))}
          </div>
        ))}
        <OwnerSwitch />
      </div>
      {/* 좁은 화면: 위쪽 가로 메뉴 */}
      <div className="flex gap-1 overflow-x-auto border-b border-neutral-100 bg-white px-4 py-2 lg:hidden">
        {GROUPS.flatMap((g) => g.items).map((it) => (
          <Link
            key={it.href}
            href={it.href}
            aria-current={isOn(it) ? "page" : undefined}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${
              isOn(it) ? "bg-neutral-900 text-white" : "text-neutral-500 hover:bg-neutral-100"
            }`}
          >
            {it.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

/** 로그인한 사업주의 사업장 이름 */
function MyBusiness() {
  const owner = useOwner();
  return (
    <Link href="/settings" className="flex items-center gap-2 rounded-xl bg-neutral-50 px-3 py-2.5 hover:bg-neutral-100">
      <Store className="size-4 shrink-0 text-neutral-500" />
      <span className="flex min-w-0 flex-col">
        <span className="text-[11px] text-muted-foreground">내 사업장</span>
        <span className="truncate text-sm font-bold">{owner?.company.name ?? "…"}</span>
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
        value={owner.code}
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
