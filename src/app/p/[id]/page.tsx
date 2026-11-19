import { PayslipView } from "./payslip-view";

// 직원이 알림톡 링크로 여는 모바일 명세서
export default async function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="min-h-screen bg-muted/40 px-4 py-6 sm:py-10">
      <PayslipView id={decodeURIComponent(id)} />
    </main>
  );
}
