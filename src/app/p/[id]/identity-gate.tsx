"use client";
import { useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { EmployeePay } from "@/types/payroll";
import { birthCandidates, matchesSecret, phoneTailCandidates } from "./verify";

const keyOf = (id: string) => `jaber.unlocked.${id}`;

// 본인 확인을 마친 직원 id는 이 탭(sessionStorage)에만 기억한다. 새로고침해도 유지되고 탭을 닫으면 다시 묻는다.
const listeners = new Set<() => void>();
function isUnlocked(id: string): boolean {
  try {
    return sessionStorage.getItem(keyOf(id)) === "1";
  } catch {
    return false;
  }
}
function unlock(id: string) {
  try {
    sessionStorage.setItem(keyOf(id), "1");
  } catch {
    // 저장이 안 되면 새로고침할 때 다시 묻는다
  }
  listeners.forEach((l) => l());
}

/**
 * 명세서를 열기 전에 본인 확인을 한다. 링크만 알면 남의 급여를 볼 수 있으면 안 되기 때문이다.
 * 담당자가 목록에서 여는 미리보기(?preview=1)는 확인 없이 연다.
 */
export function IdentityGate({
  employee,
  registryBirth,
  registryPhone,
  children,
}: {
  employee: EmployeePay;
  /** 임직원 관리 명부에 등록된 생년월일. 급여대장 파일에 생년월일이 없을 때 쓴다 */
  registryBirth?: string;
  /** 임직원 관리 명부에 등록된 휴대폰 번호. 매칭 결과에 번호가 없을 때 쓴다 */
  registryPhone?: string;
  children: ReactNode;
}) {
  const births = birthCandidates(employee.birthDate, registryBirth);
  const phoneTails = phoneTailCandidates(employee.match?.phone, registryPhone);
  const unlocked = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => isUnlocked(employee.id),
    () => false,
  );
  const preview = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).has("preview"),
    () => false,
  );
  const [value, setValue] = useState("");
  const [wrong, setWrong] = useState(false);

  if (unlocked || preview) return <>{children}</>;

  const box = "mx-auto flex max-w-md flex-col gap-3 rounded-2xl border bg-background p-6 shadow-sm";

  if (births.length === 0 && phoneTails.length === 0) {
    return (
      <div className={`${box} text-center`}>
        <h1 className="text-lg font-semibold">본인 확인을 할 수 없어요</h1>
        <p className="text-sm text-muted-foreground">
          이 직원은 생년월일과 휴대폰 번호가 등록되어 있지 않아서 열 수 없어요. 담당자에게 문의해 주세요.
        </p>
      </div>
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (matchesSecret(births, phoneTails, value)) {
      unlock(employee.id);
      return;
    }
    setWrong(true);
    setValue("");
  }

  return (
    <form onSubmit={submit} className={box}>
      <h1 className="text-lg font-semibold">본인 확인</h1>
      <p className="text-sm text-muted-foreground">
        급여명세서는 개인정보라서 본인만 볼 수 있어요. <b className="text-foreground">생년월일 8자리</b> 또는{" "}
        <b className="text-foreground">휴대폰 번호 뒤 4자리</b> 중 하나를 비밀번호로 입력해 주세요.
      </p>
      <input
        value={value}
        onChange={(e) => {
          setValue(e.target.value.replace(/\D/g, "").slice(0, 8));
          setWrong(false);
        }}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={8}
        placeholder="생년월일 8자리 또는 휴대폰 뒤 4자리"
        aria-label="생년월일 8자리 또는 휴대폰 번호 뒤 4자리"
        className="rounded-md border bg-background px-3 py-2 text-center text-sm tracking-widest outline-none focus:border-ring"
      />
      <p className="text-xs text-muted-foreground">예) 19xx.xx.xx 생이면 점(.) 없이 숫자 8자리, 010-1234-5678이면 5678로 입력해요</p>
      {wrong && (
        <p role="alert" className="text-sm text-red-600">
          맞지 않아요. 생년월일 8자리 또는 휴대폰 번호 뒤 4자리를 다시 확인해 주세요.
        </p>
      )}
      <Button type="submit" disabled={value.length !== 8 && value.length !== 4}>
        확인
      </Button>
    </form>
  );
}
