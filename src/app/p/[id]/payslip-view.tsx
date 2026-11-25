"use client";
import { useEffect, useRef } from "react";
import { PayslipCard } from "@/app/payslips/payslip-card";
import { recordOpened } from "@/app/send/send-store";
import { periodText, useReviewed } from "@/app/payslips/use-reviewed";
import { Button } from "@/components/ui/button";
import { rosterStore } from "@/lib/hr-store";
import { IdentityGate } from "./identity-gate";
import type { EmployeePay, PayrollBatch } from "@/types/payroll";

/** 인쇄 직전에 제목을 파일 이름으로 맞춘다. 인쇄 창은 페이지 제목을 PDF 기본 파일 이름으로 쓴다 */
function printAs(fileName: string) {
  document.title = fileName;
  window.print();
}

function PayslipWithActions({ batch, employee, signature }: { batch: PayrollBatch; employee: EmployeePay; signature: string }) {
  const fileName = `${periodText(batch.payPeriod)} 급여명세서_${employee.name}`;

  // 직원이 링크로 열면 열람 시각을 남긴다. 담당자가 목록에서 여는 미리보기(?preview=1)는 직원이 본 게 아니라서 남기지 않는다.
  // (시연: 지금은 같은 브라우저 탭 안에서만 기록된다. 직원 기기에서 열린 걸 알려면 저장소(Supabase)가 필요하다)
  const recorded = useRef(false);
  useEffect(() => {
    if (recorded.current) return;
    recorded.current = true;
    if (new URLSearchParams(window.location.search).has("preview")) return;
    recordOpened(signature, employee.id);
  }, [signature, employee.id]);

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
  // 임직원 관리 명부. 급여대장 파일에 생년월일이 없는 직원은 여기 등록된 생년월일로 본인 확인한다
  const roster = rosterStore.use();

  if (reviewed.status === "loading") {
    return <p className="mx-auto max-w-md text-center text-sm text-muted-foreground">불러오는 중…</p>;
  }

  if (reviewed.status === "ready") {
    for (const batch of reviewed.batches) {
      const employee = batch.employees.find((e) => e.id === id);
      // 오류가 없는 직원의 명세서만 열린다
      if (employee && reviewed.issuable.has(employee.id)) {
        return (
          <IdentityGate
            employee={employee}
            registryBirth={roster?.find((r) => r.memberId === employee.match?.memberId)?.birthDate}
          >
            <PayslipWithActions batch={batch} employee={employee} signature={reviewed.signature} />
          </IdentityGate>
        );
      }
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
