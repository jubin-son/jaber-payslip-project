import { PageShell } from "./page-shell";

type Props = {
  step: string;
  title: string;
  description: string;
};

// 화면 뼈대용 임시 컴포넌트. 각 화면 담당자가 실제 화면을 만들면서 지운다.
export function PagePlaceholder({ step, title, description }: Props) {
  return (
    <PageShell step={step} title={title} description={description}>
      <div className="rounded-3xl border border-dashed border-neutral-300 bg-white p-10 text-center text-neutral-500">
        아직 만들고 있는 화면이에요
      </div>
    </PageShell>
  );
}
