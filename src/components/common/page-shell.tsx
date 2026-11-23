import { AdminSidebar } from "./admin-sidebar";
import { SiteFooter, SiteHeader } from "./site-header";

type Props = {
  step: string;
  title: string;
  description: React.ReactNode;
  /** 내용 너비. 표가 넓은 화면은 wide, 여러 칸을 나란히 쓰는 화면은 full */
  width?: "default" | "wide" | "full";
  children: React.ReactNode;
};

// 관리자 화면 공통 틀: 상단 바 + 왼쪽 메뉴 + 제목 영역 + 회색 바탕의 내용 영역 + 바닥글.
// 각 화면은 page.tsx에서 이 틀로 감싸고, 실제 기능은 children(…-client.tsx)에 둔다.
export function PageShell({ step, title, description, width = "default", children }: Props) {
  const max = width === "full" ? "max-w-[1600px]" : width === "wide" ? "max-w-6xl" : "max-w-5xl";
  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 text-neutral-900 print:bg-white">
      <SiteHeader />
      <div className="flex flex-1 flex-col lg:flex-row">
        <AdminSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <section className="border-b border-neutral-100 bg-white print:hidden">
            <div className={`mx-auto ${max} px-4 pb-8 pt-8 sm:px-6 sm:pt-10`}>
              <span className="inline-flex rounded-full bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-600">
                {step}
              </span>
              <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
              <p className="mt-3 max-w-3xl text-base leading-relaxed text-neutral-600 sm:text-lg">{description}</p>
            </div>
          </section>
          <main className={`mx-auto flex w-full ${max} flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10 print:p-0`}>
            {children}
          </main>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
