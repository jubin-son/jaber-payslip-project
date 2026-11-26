"use client";
// 브라우저 쪽: 발송할 때 직원 명세서를 서버(Supabase)에 올리고, 다른 기기에서 열 때 받아 온다.
// 서버에 키가 없으면 올리기를 건너뛰고(enabled: false) 지금처럼 같은 브라우저 안에서만 열린다.
import { useEffect, useState } from "react";
import { birthCandidates, phoneTailCandidates } from "@/app/p/[id]/verify";
import type { StatementContext } from "@/lib/wage-statement";
import type { EmployeePay, PayItem, PayrollBatch } from "@/types/payroll";

/** 명세서 한 장을 그리는 데 필요한 값. 다른 직원 정보·연락처·원본 위치는 넣지 않는다 */
export type SharePayload = {
  batch: PayrollBatch;
  employee: EmployeePay;
  context: StatementContext;
};

/** 링크 주소. 추측하기 어렵게 무작위 22자 */
export function newShareId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 원본 파일 위치(셀 주소)는 직원에게 필요 없어서 뺀다 */
const withoutSource = (it: PayItem): PayItem => ({ ...it, source: undefined });

export function payloadOf(batch: PayrollBatch, employee: EmployeePay, context: StatementContext): SharePayload {
  return {
    batch: { ...batch, employees: [], issues: [] },
    employee: {
      ...employee,
      match: undefined,
      issues: [],
      earnings: employee.earnings.map(withoutSource),
      deductions: employee.deductions.map(withoutSource),
    },
    context,
  };
}

export type PublishItem = {
  id: string;
  employeeId: string;
  payload: SharePayload;
  /** 본인 확인 후보. 급여대장·명부에서 모은 값 */
  births: (string | undefined)[];
  phones: (string | undefined)[];
};

/** 서버에 올린다. 서버에 키가 없으면 { enabled: false } */
export async function publishShares(signature: string, items: PublishItem[]): Promise<{ enabled: boolean }> {
  const res = await fetch("/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      signature,
      items: items.map((i) => ({
        id: i.id,
        employeeId: i.employeeId,
        payload: i.payload,
        births: birthCandidates(...i.births),
        phoneTails: phoneTailCandidates(...i.phones),
      })),
    }),
  });
  if (res.status === 501) return { enabled: false };
  if (!res.ok) throw new Error(`명세서 올리기 실패 (${res.status})`);
  return { enabled: true };
}

export type OpenResult =
  | { status: "ok"; payload: SharePayload }
  | { status: "wrong" }
  | { status: "locked" }
  | { status: "not-found" }
  | { status: "error" };

/** 비밀번호로 명세서를 받아 온다. 서버가 맞는지 확인하고 열람 시각을 남긴다 */
export async function openShare(id: string, secret: string): Promise<OpenResult> {
  try {
    const res = await fetch(`/api/share/${encodeURIComponent(id)}/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret }),
    });
    if (res.ok) return { status: "ok", payload: ((await res.json()) as { payload: SharePayload }).payload };
    if (res.status === 401) return { status: "wrong" };
    if (res.status === 423) return { status: "locked" };
    if (res.status === 404 || res.status === 501) return { status: "not-found" };
    return { status: "error" };
  } catch {
    return { status: "error" };
  }
}

/** 이 링크가 서버에 있는지만 확인 (내용은 받지 않는다) */
export async function shareExists(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/share/${encodeURIComponent(id)}/open`);
    return res.ok;
  } catch {
    return false;
  }
}

/** 담당자 화면용: 링크 id → 직원이 처음 연 시각 */
export async function fetchOpens(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  try {
    const res = await fetch(`/api/share/opens?ids=${ids.map(encodeURIComponent).join(",")}`);
    if (!res.ok) return {};
    const rows = (await res.json()) as { id: string; opened_at: string | null }[];
    return Object.fromEntries(rows.filter((r) => r.opened_at).map((r) => [r.id, r.opened_at!]));
  } catch {
    return {};
  }
}

/**
 * 담당자 화면용: 서버에 올린 명세서를 직원이 열었는지 주기적으로 확인한다.
 * shares: 직원 id → 링크 id. 돌려주는 값: 직원 id → 처음 연 시각
 */
export function useRemoteOpens(shares: Record<string, string> | undefined): Record<string, string> {
  const key = shares ? Object.entries(shares).map(([e, s]) => `${e}:${s}`).sort().join("|") : "";
  const [opens, setOpens] = useState<{ key: string; value: Record<string, string> }>({ key: "", value: {} });
  useEffect(() => {
    if (!key) return;
    const pairs = key.split("|").map((p) => p.split(":") as [string, string]);
    let alive = true;
    const load = async () => {
      const byShare = await fetchOpens(pairs.map(([, s]) => s));
      if (!alive) return;
      const value: Record<string, string> = {};
      for (const [e, s] of pairs) if (byShare[s]) value[e] = byShare[s];
      setOpens({ key, value });
    };
    load();
    const t = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [key]);
  return opens.key === key ? opens.value : {};
}
