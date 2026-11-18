import { PagePlaceholder } from "@/components/common/page-placeholder";

export default async function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PagePlaceholder
      step="4단계"
      title={`급여명세서 ${id}`}
      owner="현지"
      description="직원이 알림톡 링크로 여는 모바일 명세서. 지급·공제 항목, 실지급액, 지급일을 보여준다."
    />
  );
}
