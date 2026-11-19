import { PayslipView } from "./payslip-view";

// 직원이 알림톡·메일 링크로 여는 명세서 (휴대폰·컴퓨터 모두). PDF로 저장할 수 있다
export default async function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="min-h-screen bg-muted/40 px-4 py-6 sm:py-10 print:min-h-0 print:bg-white print:p-0">
      <PayslipView id={decodeURIComponent(id)} />
    </main>
  );
}
