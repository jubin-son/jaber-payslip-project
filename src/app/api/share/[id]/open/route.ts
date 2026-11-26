// 직원이 링크로 명세서를 연다. 비밀번호(생년월일 8자리 또는 휴대폰 뒤 4자리)는 서버에서 확인하고, 맞을 때만 내용을 준다.
import { NextResponse } from "next/server";
import { matchesSecret } from "@/app/p/[id]/verify";
import { getShare, isShareEnabled, patchShare } from "@/lib/share/server";

/** 이만큼 틀리면 잠근다 (휴대폰 뒤 4자리는 경우의 수가 적어서 막아야 한다) */
const MAX_FAILS = 10;

type Ctx = { params: Promise<{ id: string }> };

/** 링크가 있는지만 알려 준다 (내용은 주지 않는다) */
export async function GET(_req: Request, { params }: Ctx) {
  if (!isShareEnabled()) return NextResponse.json({}, { status: 501 });
  const { id } = await params;
  try {
    const row = await getShare(id);
    return NextResponse.json({ exists: Boolean(row) }, { status: row ? 200 : 404 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({}, { status: 502 });
  }
}

export async function POST(req: Request, { params }: Ctx) {
  if (!isShareEnabled()) return NextResponse.json({}, { status: 501 });
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { secret?: string } | null;
  const secret = typeof body?.secret === "string" ? body.secret : "";
  try {
    const row = await getShare(id);
    if (!row) return NextResponse.json({}, { status: 404 });
    if (row.failed_attempts >= MAX_FAILS) return NextResponse.json({}, { status: 423 });
    if (!matchesSecret(row.secret_births, row.secret_phone_tails, secret)) {
      await patchShare(id, { failed_attempts: row.failed_attempts + 1 });
      return NextResponse.json({ left: MAX_FAILS - row.failed_attempts - 1 }, { status: 401 });
    }
    const patch: { failed_attempts?: number; opened_at?: string } = {};
    if (row.failed_attempts > 0) patch.failed_attempts = 0;
    if (!row.opened_at) patch.opened_at = new Date().toISOString();
    if (Object.keys(patch).length > 0) await patchShare(id, patch);
    return NextResponse.json({ payload: row.payload });
  } catch (err) {
    console.error(err);
    return NextResponse.json({}, { status: 502 });
  }
}
