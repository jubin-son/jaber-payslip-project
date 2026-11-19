"use client";
import { PayslipCard } from "@/app/payslips/payslip-card";
import { periodText, useReviewed } from "@/app/payslips/use-reviewed";
import { Button } from "@/components/ui/button";
import type { EmployeePay, PayrollBatch } from "@/types/payroll";

/** 인쇄 직전에 제목을 파일 이름으로 맞춘다. 인쇄 창은 페이지 제목을 PDF 기본 파일 이름으로 쓴다 */
function printAs(fileName: string) {
  document.title = fileName;
  window.print();
}

function PayslipWithActions({ batch, employee }: { batch: PayrollBatch; employee: EmployeePay }) {
  const fileName = `${periodText(batch.payPeriod)} 급여명세서_${employee.name}`;

  return (
    <>
      {/* React가 <head>의 제목으로 올려 준다. Next.js 기본 제목보다 우선한다 */}
      <title>{fileName}</title>
      <PayslipCard batch={batch} employee={employee} />
      {/* 인쇄·PDF에는 나오지 않는 영역 */}
      <div className="mx-auto mt-4 flex w-full max-w-2xl flex-col items-center gap-2 print:hidden">
        <Button onClick={() => printAs(fileName)}>PDF로 저장</Button>
        <p className="text-xs text-muted-foreground">
          인쇄 창이 열리면 &lsquo;대상&rsquo;(프린터)을 &lsquo;PDF로 저장&rsquo;으로 골라 주세요. 파일 이름이 다르게 나오면 저장 창에서 직접 고칠 수 있어요.
        </p>
      </div>
    </>
  );
}

export function PayslipView({ id }: { id: string }) {
  const reviewed = useReviewed();

  if (reviewed.status === "loading") {
    return <p className="mx-auto max-w-md text-center text-sm text-muted-foreground">불러오는 중…</p>;
  }

  if (reviewed.status === "ready") {
    for (const batch of reviewed.batches) {
      const employee = batch.employees.find((e) => e.id === id);
      // 3단계에서 확인 완료한 직원의 명세서만 열린다
      if (employee && reviewed.confirmed.has(employee.id)) return <PayslipWithActions batch={batch} employee={employee} />;
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
