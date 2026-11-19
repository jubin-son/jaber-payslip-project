import Link from "next/link";
import { SendClient } from "./send-client";

export default function SendPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-4 sm:p-10">
      <Link href="/" className="text-sm text-muted-foreground hover:underline">
        ← 처음으로
      </Link>
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">5단계</p>
        <h1 className="text-2xl font-semibold">발송</h1>
        <p className="text-muted-foreground">
          직원마다 알림톡과 메일 중 어디로 보낼지 고르고, 받는 사람이 보게 될 안내를 미리 확인해요. 지금은 시연이라 실제로 발송되지는 않아요.
        </p>
      </header>
      <SendClient />
    </main>
  );
}
