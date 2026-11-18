import { PagePlaceholder } from "@/components/common/page-placeholder";

export default function UploadPage() {
  return (
    <PagePlaceholder
      step="1단계"
      title="급여대장 업로드"
      owner="주빈"
      description="xlsx·csv·pdf 급여대장을 여러 개 올리는 화면. 올린 파일은 lib/parser와 lib/ai로 넘긴다."
    />
  );
}
