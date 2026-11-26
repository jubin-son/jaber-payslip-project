// 발송할 때 직원 명세서를 저장한다. (시연용: 담당자 로그인이 없어서 누구나 부를 수 있다. 실제 서비스에서는 담당자 인증을 붙여야 한다)
import { NextResponse } from "next/server";
import { isShareEnabled, upsertShares } from "@/lib/share/server";

type Item = { id: string; employeeId: string; payload: unknown; births: string[]; phoneTails: string[] };

const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const onlyDigits = (xs: unknown, len: number) =>
  Array.isArray(xs) ? xs.filter((x): x is string => typeof x === "string" && new RegExp(`^\\d{${len}}$`).test(x)) : [];

export async function POST(req: Request) {
  if (!isShareEnabled()) return NextResponse.json({ error: "공유 저장소가 설정되지 않았어요" }, { status: 501 });
  const body = (await req.json().catch(() => null)) as { signature?: string; items?: Item[] } | null;
  if (!body || typeof body.signature !== "string" || !Array.isArray(body.items) || body.items.length > 500) {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const rows = body.items
    .filter((i) => i && ID_RE.test(i.id) && typeof i.employeeId === "string" && i.payload && typeof i.payload === "object")
    .map((i) => ({
      id: i.id,
      signature: body.signature!,
      employee_id: i.employeeId,
      payload: i.payload,
      secret_births: onlyDigits(i.births, 8),
      secret_phone_tails: onlyDigits(i.phoneTails, 4),
    }));
  try {
    await upsertShares(rows);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "저장에 실패했어요" }, { status: 502 });
  }
  return NextResponse.json({ saved: rows.length });
}
