"use client";
import { PayslipCard } from "@/app/payslips/payslip-card";
import { useReviewed } from "@/app/payslips/use-reviewed";

export function PayslipView({ id }: { id: string }) {
  const reviewed = useReviewed();

  if (reviewed.status === "loading") {
    return <p className="mx-auto max-w-md text-center text-sm text-muted-foreground">불러오는 중…</p>;
  }

  if (reviewed.status === "ready") {
    for (const batch of reviewed.batches) {
      const employee = batch.employees.find((e) => e.id === id);
      // 3단계에서 확인 완료한 직원의 명세서만 열린다
      if (employee && reviewed.confirmed.has(employee.id)) return <PayslipCard batch={batch} employee={employee} />;
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-2 rounded-2xl border bg-background p-6 text-center">
      <h1 className="text-lg font-semibold">명세서를 찾을 수 없어요</h1>
      <p className="text-sm text-muted-foreground">
        지금은 명세서를 만든 브라우저 탭 안에서만 열려요. 담당자 화면(/payslips)에서 다시 열어 주세요.
      </p>
    </div>
  );
}
