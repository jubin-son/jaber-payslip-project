"use client";
// 5단계 발송 결과 저장소. 시연용이라 실제로 보내지는 않고, '보낸 것으로 기록'만 브라우저 탭(sessionStorage)에 둔다.
// 다른 페이지에 갔다 와도 남고, 탭을 닫으면 사라진다. 다른 파일을 올리면(signature가 달라지면) 비운다.
import { useSyncExternalStore } from "react";
import type { Channel } from "./channels";

export type SendRecord = { at: string };

/** 직원이 명세서 링크를 처음 연 시각 */
export type OpenRecord = { at: string };

export type SendState = {
  /** 어떤 파일의 발송 결과인지 (3단계 확인 결과의 signature) */
  signature: string;
  /** 직원 id → 채널별 발송 기록 */
  records: Record<string, Partial<Record<Channel, SendRecord>>>;
  /** 직원 id → 명세서를 열어 본 기록 (시연: 같은 브라우저 탭 안에서만 기록된다) */
  opens: Record<string, OpenRecord>;
};

const KEY = "jaber.send.v1";
let cache: SendState | null | undefined;
const listeners = new Set<() => void>();

function read(): SendState | null {
  if (cache !== undefined) return cache;
  try {
    const raw = sessionStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as SendState) : null;
  } catch {
    cache = null;
  }
  return cache;
}

function commit(next: SendState | null) {
  cache = next;
  try {
    if (next) sessionStorage.setItem(KEY, JSON.stringify(next));
    else sessionStorage.removeItem(KEY);
  } catch {
    // 저장이 안 돼도 이 페이지 안에서는 cache로 동작한다
  }
  listeners.forEach((l) => l());
}

/** 서버에서 그릴 때는 null (저장된 값은 브라우저에만 있으므로) */
export function useSendState(): SendState | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => null,
  );
}

/** 같은 파일의 기록이면 이어서 쓰고, 다른 파일이면 비운 상태에서 시작한다 */
function base(signature: string): SendState {
  const cur = read();
  return cur && cur.signature === signature
    ? { signature, records: structuredClone(cur.records), opens: structuredClone(cur.opens ?? {}) }
    : { signature, records: {}, opens: {} };
}

/** 보낸 것으로 기록한다 (시연) */
export function recordSent(signature: string, items: { employeeId: string; channel: Channel }[]) {
  const next = base(signature);
  const at = new Date().toISOString();
  for (const { employeeId, channel } of items) {
    next.records[employeeId] = { ...next.records[employeeId], [channel]: { at } };
  }
  commit(next);
}

/** 직원이 명세서를 처음 열었다고 기록한다. 이미 기록이 있으면 바꾸지 않는다 */
export function recordOpened(signature: string, employeeId: string) {
  const next = base(signature);
  if (next.opens[employeeId]) return;
  next.opens[employeeId] = { at: new Date().toISOString() };
  commit(next);
}

/** 발송·열람 기록 지우기 (다시 시연할 때) */
export function clearSent() {
  commit(null);
}
