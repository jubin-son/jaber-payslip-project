// 담당자 화면용: 보낸 명세서를 직원이 열었는지 (열람 시각만 준다)
import { NextResponse } from "next/server";
import { getOpens, isShareEnabled } from "@/lib/share/server";

export async function GET(req: Request) {
  if (!isShareEnabled()) return NextResponse.json([], { status: 501 });
  const ids = (new URL(req.url).searchParams.get("ids") ?? "")
    .split(",")
    .filter((i) => /^[A-Za-z0-9_-]{16,64}$/.test(i))
    .slice(0, 500);
  try {
    return NextResponse.json(await getOpens(ids));
  } catch (err) {
    console.error(err);
    return NextResponse.json([], { status: 502 });
  }
}
