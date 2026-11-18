import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  step: string;
  title: string;
  owner: string;
  description: string;
};

// 화면 뼈대용 임시 컴포넌트. 각 화면 담당자가 실제 화면을 만들면서 지운다.
export function PagePlaceholder({ step, title, owner, description }: Props) {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-6 sm:p-10">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">
        ← 처음으로
      </Link>
      <Card>
        <CardHeader>
          <CardDescription>
            {step} · 담당 {owner}
          </CardDescription>
          <CardTitle className="text-2xl">{title}</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">{description}</CardContent>
      </Card>
    </main>
  );
}
