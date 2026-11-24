"use client";
// 화면 사이에 정리 결과를 넘기는 작은 저장소. 브라우저 탭 안(sessionStorage)에만 둔다.
// 1단계(업로드) → 2단계(정리 결과) → 3단계(확인·수정)가 같은 데이터를 본다.
import { useSyncExternalStore } from "react";
import type { ParseResult } from "@/lib/parser/extract";

const KEY = "jaber.parseResult.v1";
let cache: ParseResult | null | undefined;
const listeners = new Set<() => void>();

function read(): ParseResult | null {
  if (cache !== undefined) return cache;
  try {
    const raw = sessionStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as ParseResult) : null;
  } catch {
    cache = null;
  }
  return cache;
}

/** 화면 밖(명부가 바뀌었을 때 다시 매칭 등)에서 지금 정리 결과 읽기 */
export function getParseResult(): ParseResult | null {
  return read();
}

export function saveParseResult(r: ParseResult | null) {
  cache = r;
  try {
    if (r) sessionStorage.setItem(KEY, JSON.stringify(r));
    else sessionStorage.removeItem(KEY);
  } catch {
    // 저장이 안 돼도 이 탭 안에서는 cache로 동작한다
  }
  listeners.forEach((l) => l());
}

export function useParseResult(): ParseResult | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => null,
  );
}
