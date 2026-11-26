// 서버 전용: Supabase에 보낸 명세서를 저장하고 읽는다. 비밀 키를 쓰므로 브라우저 코드에서 import하면 안 된다.
// 키가 없으면(로컬에서 .env.local을 안 채웠을 때) isShareEnabled()가 false고, 앱은 같은 브라우저 안에서만 동작한다.
// API 라우트(src/app/api/share)에서만 쓴다.

const URL_ = process.env.SUPABASE_URL?.replace(/\/$/, "");
const KEY = process.env.SUPABASE_SECRET_KEY;
const TABLE = "shared_payslips";

export function isShareEnabled(): boolean {
  return Boolean(URL_ && KEY);
}

function headers(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { apikey: KEY!, "Content-Type": "application/json", ...extra };
  // 예전 형식(service_role JWT) 키는 Authorization 헤더도 필요하다. 새 형식(sb_secret_…)은 apikey만 쓴다
  if (KEY!.startsWith("eyJ")) h.Authorization = `Bearer ${KEY}`;
  return h;
}

async function rest(path: string, init: RequestInit & { prefer?: string } = {}): Promise<Response> {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: headers(init.prefer ? { Prefer: init.prefer } : undefined),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res;
}

export type ShareRow = {
  id: string;
  signature: string;
  employee_id: string;
  payload: unknown;
  secret_births: string[];
  secret_phone_tails: string[];
  failed_attempts: number;
  opened_at: string | null;
};

/** 같은 id면 내용을 새로 덮어쓴다 (재발송·값 수정). 열람 기록과 틀린 횟수는 건드리지 않는다 */
export async function upsertShares(rows: Pick<ShareRow, "id" | "signature" | "employee_id" | "payload" | "secret_births" | "secret_phone_tails">[]) {
  if (rows.length === 0) return;
  await rest(`${TABLE}?on_conflict=id`, {
    method: "POST",
    body: JSON.stringify(rows),
    prefer: "resolution=merge-duplicates,return=minimal",
  });
}

export async function getShare(id: string): Promise<ShareRow | null> {
  const res = await rest(`${TABLE}?id=eq.${encodeURIComponent(id)}&select=*`);
  const rows = (await res.json()) as ShareRow[];
  return rows[0] ?? null;
}

export async function patchShare(id: string, patch: Partial<Pick<ShareRow, "failed_attempts" | "opened_at">>) {
  await rest(`${TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
    prefer: "return=minimal",
  });
}

/** 담당자 화면용: 열람 시각만 */
export async function getOpens(ids: string[]): Promise<{ id: string; opened_at: string | null }[]> {
  if (ids.length === 0) return [];
  const list = ids.map((i) => `"${i.replace(/"/g, "")}"`).join(",");
  const res = await rest(`${TABLE}?id=in.(${encodeURIComponent(list)})&select=id,opened_at`);
  return (await res.json()) as { id: string; opened_at: string | null }[];
}
