"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 관리자 화면 왼쪽 메뉴. 인건비 관리(기본 관리·임직원 관리)와 급여명세서·발송 관리로 나눈다.
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
