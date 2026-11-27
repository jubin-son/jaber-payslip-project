"use client";
// 발송 관리 > 발송하기: 발송 화면 (시연 수준). 오류가 없는 직원이 대상이 된다.
// 실제로 알림톡·메일을 보내지는 않고, '보낸 것으로 기록'만 남긴다.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { dateText, periodText, useReviewed } from "@/app/payslips/use-reviewed";
import type { EmployeePay, PayrollBatch } from "@/types/payroll";
import { rosterStore, settingsStore } from "@/lib/hr-store";
import { statementContextOf } from "@/app/payslips/payslip-card";
import { newShareId, payloadOf, publishShares, useRemoteOpens, type PublishItem } from "@/lib/share/client";
import { availability, CHANNEL_LABEL, defaultPick, maskEmail, maskPhone, secretNote, unsentReason, type Channel, type Pick } from "./channels";
import { cancelSchedule, clearSent, linkIdOf, recordSent, recordShares, scheduleSend, useSendState, type SendState } from "./send-store";

const CHANNELS: Channel[] = ["kakao", "mail"];

/** "11. 19. 14:32" */
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

/** 예약 시각이 되면 onFire를 부른다. 이미 지난 예약이면 바로 부른다. 화면에는 children을 그대로 그린다 */
function ScheduleRunner({ at, onFire, children }: { at: string; onFire: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const t = setTimeout(onFire, Math.max(0, new Date(at).getTime() - Date.now()));
    return () => clearTimeout(t);
  }, [at, onFire]);
  return <>{children}</>;
}

function Guide({ title, text, href, button }: { title: string; text: string; href: string; button: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{text}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <Link href={href}>{button}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function SendClient() {
  const reviewed = useReviewed();
  const sendState = useSendState();
  const roster = rosterStore.use();
  const settings = settingsStore.use();
  const remoteOpens = useRemoteOpens(sendState?.shares);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [batchIdx, setBatchIdx] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<"now" | "later">("now");
  const [when, setWhen] = useState("");
  const [whenError, setWhenError] = useState<string | null>(null);

  if (reviewed.status === "loading") return <p className="text-muted-foreground">불러오는 중…</p>;
  if (reviewed.status === "no-file") {
    return (
      <Guide
        title="아직 발송할 파일이 없어요"
        text="급여대장을 올려 변환하면 명세서가 만들어지고, 여기서 발송할 수 있어요."
        href="/upload"
        button="파일 올리러 가기"
      />
    );
  }
  const { batches, issuable, signature } = reviewed;
  const batch: PayrollBatch | undefined = batches[batchIdx] ?? batches[0];
  if (!batch || batch.employees.length === 0) return <p className="text-muted-foreground">발송할 직원이 없어요.</p>;

  // 발송은 오류가 없는 직원이 대상이다 (따로 확인을 누르지 않아도 된다)
  const ready = batch.employees.filter((e) => issuable.has(e.id));
  const blocked = batch.employees.length - ready.length;
  const records = sendState && sendState.signature === signature ? sendState.records : {};
  const localOpens = sendState && sendState.signature === signature ? (sendState.opens ?? {}) : {};
  // 같은 브라우저에서 연 기록 + 다른 기기에서 연 기록(서버)
  const opens: Record<string, { at: string }> = { ...localOpens };
  if (sendState?.signature === signature) for (const [id, at] of Object.entries(remoteOpens)) opens[id] ??= { at };
  const selected = ready.find((e) => e.id === selectedId) ?? ready[0] ?? null;

  const pickOf = (e: EmployeePay): Pick => picks[e.id] ?? defaultPick(e);
  const sentAt = (e: EmployeePay, c: Channel) => records[e.id]?.[c]?.at;

  // 확인 카드 숫자
  const kakaoOk = ready.filter((e) => availability(e, "kakao").ok).length;
  const mailOk = ready.filter((e) => availability(e, "mail").ok).length;
  const noWay = ready.filter((e) => !availability(e, "kakao").ok && !availability(e, "mail").ok);

  // 이번에 보낼 것: 선택했고, 보낼 수 있고, 아직 안 보낸 것
  const toSend = ready.flatMap((e) =>
    CHANNELS.filter((c) => pickOf(e)[c] && availability(e, c).ok && !sentAt(e, c)).map((c) => ({ employeeId: e.id, channel: c })),
  );
  const alreadySent = ready.reduce((n, e) => n + CHANNELS.filter((c) => sentAt(e, c)).length, 0);
  const sentPeople = ready.filter((e) => CHANNELS.some((c) => sentAt(e, c)));
  const openedPeople = sentPeople.filter((e) => opens[e.id]);

  // 발송 대상을 겹치지 않게 넷으로 나눈다: 발송 완료(한 곳이라도 보냄) → 보낼 수 없음 → 발송 예정(보낼 곳을 골랐음) → 선택 안 함
  const sentIds = new Set(sentPeople.map((e) => e.id));
  const pendingIds = new Set(toSend.map((i) => i.employeeId));
  const blockedPeople = ready.filter((e) => !sentIds.has(e.id) && !availability(e, "kakao").ok && !availability(e, "mail").ok);
  const pendingPeople = ready.filter((e) => !sentIds.has(e.id) && pendingIds.has(e.id));
  const idleCount = ready.length - sentPeople.length - blockedPeople.length - pendingPeople.length;

  function toggle(e: EmployeePay, c: Channel) {
    const cur = pickOf(e);
    setPicks((p) => ({ ...p, [e.id]: { ...cur, [c]: !cur[c] } }));
  }

  /** 직원별 명세서를 서버에 올리고 보낸 것으로 기록한다 (지금 발송·예약 시각 도달 모두 여기로 온다) */
  function sendItems(items: { employeeId: string; channel: Channel }[]) {
    if (items.length === 0 || sending) return;
    setSending(true);
    setShareNote(null);
    // 다른 기기에서도 열리게 명세서를 서버에 올린다. 이미 올린 직원은 같은 링크로 내용만 새로 덮어쓴다
    const shares = { ...(sendState?.signature === signature ? sendState.shares : undefined) };
    const publish: PublishItem[] = [...new Set(items.map((i) => i.employeeId))].flatMap((employeeId) => {
      const cur = batches.find((b) => b.employees.some((x) => x.id === employeeId));
      const e = cur?.employees.find((x) => x.id === employeeId);
      if (!cur || !e) return [];
      const reg = roster?.find((r) => r.memberId === e.match?.memberId);
      shares[employeeId] ??= newShareId();
      return [
        {
          id: shares[employeeId],
          employeeId,
          payload: payloadOf(cur, e, statementContextOf(settings, roster, cur).forEmployee(e)),
          births: [e.birthDate, reg?.birthDate],
          phones: [e.match?.phone, reg?.phone],
        },
      ];
    });
    const started = Date.now();
    publishShares(signature, publish)
      .then((r) => {
        if (r.enabled) recordShares(signature, shares);
        else setShareNote("공유 저장소(Supabase)가 연결되지 않아서, 명세서 링크는 이 브라우저에서만 열려요.");
      })
      .catch(() => setShareNote("명세서를 서버에 올리지 못했어요. 링크는 이 브라우저에서만 열려요. 잠시 뒤 다시 보내 보세요."))
      .finally(() => {
        // 시연: 실제 발송 대신 보낸 것으로 기록한다
        setTimeout(() => {
          recordSent(signature, items);
          setSending(false);
        }, Math.max(0, 900 - (Date.now() - started)));
      });
  }

  const schedule = sendState?.signature === signature ? sendState.schedule : undefined;

  function reserve() {
    const at = new Date(when);
    if (!when || Number.isNaN(at.getTime())) return setWhenError("예약할 날짜와 시간을 골라 주세요.");
    if (at.getTime() <= Date.now() + 10_000) return setWhenError("지금보다 뒤의 시각을 골라 주세요.");
    setWhenError(null);
    scheduleSend(signature, at.toISOString(), toSend);
    setMode("now");
  }

  /** 예약 시각이 됐을 때: 예약을 지우고, 그 사이 이미 보낸 것을 뺀 나머지를 보낸다 */
  function fireSchedule() {
    if (!schedule) return;
    cancelSchedule(signature);
    sendItems(schedule.items.filter((i) => !records[i.employeeId]?.[i.channel]));
  }

  /** 이 시각 기준 'datetime-local' 입력값 (예: 2026-11-27T14:30) */
  function localInput(ms: number) {
    const d = new Date(ms - new Date().getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
  }

  return (
    <div className="flex flex-col gap-6">
      {batches.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">사업장·귀속월</span>
          {batches.map((b, i) => (
            <Button
              key={b.id}
              size="sm"
              variant={b === batch ? "default" : "outline"}
              onClick={() => {
                setBatchIdx(i);
                setSelectedId(null);
              }}
            >
              {b.companyName} · {b.payPeriod}
            </Button>
          ))}
        </div>
      )}

      {/* 확인 카드: 보내기 전에 한 번 더 볼 것들 */}
      <Card>
        <CardHeader>
          <CardDescription>발송 전 확인</CardDescription>
          <CardTitle className="text-xl">
            {batch.companyName} · {periodText(batch.payPeriod)} 급여명세서
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="귀속월" value={periodText(batch.payPeriod)} />
            <Stat label="지급일" value={dateText(batch.payDate)} warn={!batch.payDate} />
            <Stat label="발송 대상" value={`${ready.length}명`} sub={`직원 ${batch.employees.length}명 중`} />
            <Stat label="알림톡 가능" value={`${kakaoOk}명`} />
            <Stat label="메일 가능" value={`${mailOk}명`} />
            <Stat
              label="열람 확인"
              value={sentPeople.length > 0 ? `${openedPeople.length}/${sentPeople.length}명` : "-"}
              sub={sentPeople.length > 0 ? "발송한 직원 중" : "발송 후 표시돼요"}
            />
          </dl>

          {/* 발송 대상 중 어디까지 보냈는지 */}
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="text-muted-foreground">발송 대상 {ready.length}명 중</span>
            <span className="text-emerald-700 dark:text-emerald-400">
              발송 완료 <b>{sentPeople.length}</b>명
            </span>
            <span>
              발송 예정 <b>{pendingPeople.length}</b>명
            </span>
            {blockedPeople.length > 0 && (
              <span className="text-red-600 dark:text-red-400">
                보낼 수 없음 <b>{blockedPeople.length}</b>명
              </span>
            )}
            {idleCount > 0 && (
              <span className="text-muted-foreground">
                선택 안 함 <b>{idleCount}</b>명
              </span>
            )}
          </p>

          {!batch.payDate && (
            <Notice>
              지급일이 비어 있어요. 안내에 &lsquo;지급일 미정&rsquo;으로 나가니, 확인·수정 화면에서 지급일을 입력하는 게 좋아요.{" "}
              <Link href="/review" className="font-medium underline underline-offset-2">
                확인·수정 화면으로 가기
              </Link>
            </Notice>
          )}
          {blocked > 0 && (
            <Notice>
              오류가 남은 직원 {blocked}명은 발송 대상에서 빠져요.{" "}
              <Link href="/review" className="font-medium underline underline-offset-2">
                확인·수정 화면으로 가기
              </Link>
            </Notice>
          )}
          {noWay.length > 0 && (
            <Notice>
              알림톡·메일 어느 쪽으로도 보낼 수 없는 직원이 {noWay.length}명 있어요: {noWay.map((e) => e.name).join(", ")}. 자버 직원연락처
              매칭을 확인해 주세요.
            </Notice>
          )}
        </CardContent>
      </Card>

      {/* 발송: 직원이 많아도 내려가지 않게 위쪽에 둔다 */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {alreadySent > 0 && (
            <>
              <span className="text-sm text-muted-foreground">발송(시연) {alreadySent}건 기록됨</span>
              <Button variant="ghost" size="sm" onClick={clearSent}>
                발송·열람 기록 지우기
              </Button>
            </>
          )}
          <Button variant="outline" asChild>
            <Link href="/send/history">발송 결과 보기</Link>
          </Button>
          {mode === "now" || schedule ? (
            <>
              {!schedule && (
                <Button variant="outline" disabled={toSend.length === 0 || sending} onClick={() => setMode("later")}>
                  예약 발송
                </Button>
              )}
              <Button disabled={toSend.length === 0 || sending} onClick={() => sendItems(toSend)}>
                {sending ? "발송 중…" : toSend.length > 0 ? `${toSend.length}건 발송하기 (시연)` : "보낼 대상이 없어요"}
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={() => setMode("now")}>
              예약 그만두기
            </Button>
          )}
        </div>
      </div>

      {/* 예약 발송 (시연) */}
      {schedule && (
        <ScheduleRunner at={schedule.at} onFire={fireSchedule}>
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
            <span>
              <b>{fmtTime(schedule.at)}</b>에 {schedule.items.length}건을 보낼 예정이에요.
            </span>
            <span className="flex gap-2">
              <Button size="sm" variant="outline" disabled={sending} onClick={fireSchedule}>
                지금 바로 보내기
              </Button>
              <Button size="sm" variant="ghost" onClick={() => cancelSchedule(signature)}>
                예약 취소
              </Button>
            </span>
          </div>
        </ScheduleRunner>
      )}
      {!schedule && mode === "later" && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 px-3 py-3 text-sm">
          <label className="flex items-center gap-2">
            <span className="font-medium">보낼 시각</span>
            <input
              type="datetime-local"
              value={when}
              onChange={(ev) => setWhen(ev.target.value)}
              className="rounded-md border bg-background px-2 py-1"
            />
          </label>
          <Button size="sm" variant="outline" onClick={() => setWhen(localInput(Date.now() + 60_000))}>
            1분 뒤로 맞추기 (시연)
          </Button>
          <Button size="sm" disabled={toSend.length === 0} onClick={reserve}>
            {toSend.length}건 예약하기
          </Button>
          {whenError && <span className="text-red-600">{whenError}</span>}
        </div>
      )}
      {shareNote && (
        <p role="status" className="text-sm text-amber-700">
          {shareNote}
        </p>
      )}

      {ready.length === 0 ? (
        <Guide
          title="발송할 수 있는 직원이 없어요"
          text={`${batch.companyName}의 직원 ${batch.employees.length}명 모두 오류가 남아 있어요. 확인·수정 화면에서 오류를 고치면 발송할 수 있어요.`}
          href="/review"
          button="담당자 확인·수정으로 가기"
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          {/* 직원별 채널 선택 */}
          <ul className="flex flex-col gap-2">
            {ready.map((e) => {
              const pick = pickOf(e);
              const active = selected?.id === e.id;
              return (
                <li key={e.id} className={`flex flex-col gap-2 rounded-lg border p-3 ${active ? "border-foreground bg-muted" : ""}`}>
                  <button type="button" onClick={() => setSelectedId(e.id)} className="flex flex-wrap items-center justify-between gap-2 text-left">
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{e.name}</span>
                      <MatchBadge e={e} />
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {e.match?.status === "matched" ? `${maskPhone(e.match.phone)} · ${maskEmail(e.match.email)}` : "연락처 없음"}
                    </span>
                  </button>

                  <div className="flex flex-wrap gap-2">
                    {CHANNELS.map((c) => {
                      const av = availability(e, c);
                      const sent = sentAt(e, c);
                      return (
                        <div key={c} className="flex flex-col gap-0.5">
                          <Button
                            size="sm"
                            variant={pick[c] && av.ok ? "default" : "outline"}
                            aria-pressed={pick[c] && av.ok}
                            disabled={!av.ok || !!sent}
                            onClick={() => toggle(e, c)}
                          >
                            {sent ? "✓ " : ""}
                            {CHANNEL_LABEL[c]}
                          </Button>
                          <span className="text-[11px] text-muted-foreground">
                            {sent ? `${fmtTime(sent)} 발송(시연)` : av.ok ? (pick[c] ? "보낼 예정" : "보내지 않음") : av.reason}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {(() => {
                    const note = secretNote(e, roster);
                    return note ? (
                      <p className={`rounded-md px-2 py-1.5 text-xs ${note.blocked ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`}>
                        <b>열람 비밀번호 정보 없음 · </b>
                        {note.message}{" "}
                        <Link href="/employees" className="font-semibold underline underline-offset-2">
                          임직원 관리로 가기
                        </Link>
                      </p>
                    ) : null;
                  })()}

                  {!CHANNELS.some((c) => sentAt(e, c)) && !availability(e, "kakao").ok && !availability(e, "mail").ok && (
                    <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                      보낼 수 없어요. {unsentReason(e).guide}{" "}
                      <Link href="/employees" className="font-semibold underline underline-offset-2">
                        임직원 관리로 가기
                      </Link>
                    </p>
                  )}

                  {CHANNELS.some((c) => sentAt(e, c)) &&
                    (opens[e.id] ? (
                      <p className="text-xs text-emerald-700 dark:text-emerald-400">✓ 열람 확인 · {fmtTime(opens[e.id].at)}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">미열람</p>
                    ))}
                </li>
              );
            })}
          </ul>

          {/* 미리보기 */}
          {selected && <Preview batch={batch} employee={selected} sendState={sendState} signature={signature} />}
        </div>
      )}

      <div className="flex flex-col gap-3 border-t pt-4">
        <div>
          <Button variant="outline" asChild>
            <Link href="/payslips">← 명세서 변환</Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
        시연이라 실제 알림톡·메일은 나가지 않아요. 예약 발송은 이 발송 화면을 열어 둔 동안에만 시각에 맞춰 보내져요. 발송하면 명세서가 저장소(Supabase)에 올라가서, 미리보기의 링크를 휴대폰 등 다른 기기에서 열 수 있어요.
        직원이 열면 &lsquo;열람&rsquo;으로 표시돼요.
        </p>
      </div>
    </div>
  );
}

// ---------- 조각들 ----------

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className={`flex flex-col gap-0.5 rounded-lg border p-2 ${warn ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40" : ""}`}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
      {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      {children}
    </div>
  );
}

function MatchBadge({ e }: { e: EmployeePay }) {
  const m = e.match;
  if (!m || m.status === "not_found") return <Badge variant="destructive">자버 직원 못 찾음</Badge>;
  if (m.status === "ambiguous") return <Badge variant="outline">후보 {m.candidates?.length ?? 0}명</Badge>;
  return (
    <>
      <Badge variant="secondary">자버 {m.memberId}</Badge>
      {m.kakaoConsent === false && <Badge variant="outline">알림톡 미동의</Badge>}
    </>
  );
}

/** 받는 사람이 보게 될 알림톡·메일 미리보기 */
function Preview({
  batch,
  employee: e,
  sendState,
  signature,
}: {
  batch: PayrollBatch;
  employee: EmployeePay;
  sendState: SendState | null;
  signature: string;
}) {
  const [tab, setTab] = useState<Channel>("kakao");
  const [copied, setCopied] = useState(false);
  const linkId = linkIdOf(sendState, signature, e.id);
  const shared = linkId !== e.id;
  const link = `${window.location.origin}/p/${linkId}`;
  const period = periodText(batch.payPeriod);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground">미리보기 · {e.name}님이 받는 모양</p>
        <div className="ml-auto flex gap-1">
          {CHANNELS.map((c) => (
            <Button key={c} size="sm" variant={tab === c ? "default" : "outline"} onClick={() => setTab(c)}>
              {CHANNEL_LABEL[c]}
            </Button>
          ))}
        </div>
      </div>

      {shared ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs">
          <span className="text-muted-foreground">다른 기기에서도 열리는 링크</span>
          <code className="min-w-0 flex-1 truncate">{link}</code>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              navigator.clipboard?.writeText(link).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? "복사했어요" : "링크 복사"}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">시연: 아래 버튼을 누르면 직원이 명세서를 연 것으로 기록돼요. 발송하면 다른 기기에서도 열리는 링크가 만들어져요.</p>
      )}

      {tab === "kakao" ? (
        <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
          <div className="bg-[#FEE500] px-4 py-2 text-xs font-medium text-black">알림톡 도착</div>
          <div className="flex flex-col gap-3 px-4 py-4 text-sm">
            <p className="font-semibold">[{batch.companyName}] 급여명세서 안내</p>
            <p>
              {e.name}님, {period} 급여명세서가 도착했어요.
            </p>
            <p className="text-muted-foreground">지급일: {dateText(batch.payDate)}</p>
            <a href={link} className="rounded-md border bg-muted px-3 py-2 text-center font-medium hover:bg-muted/70">
              명세서 확인하기
            </a>
            <p className="text-xs text-muted-foreground">명세서는 개인정보라서 열 때 생년월일 8자리(예: 19xx.xx.xx, 점 없이 숫자만) 또는 휴대폰 번호 뒤 4자리를 입력해야 해요.</p>
            <p className="text-xs text-muted-foreground">이 메시지는 급여명세서 수신에 동의하신 분께 발송돼요.</p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
          <dl className="grid grid-cols-[64px_1fr] gap-x-2 gap-y-1 border-b bg-muted/50 px-4 py-3 text-xs">
            <dt className="text-muted-foreground">받는 사람</dt>
            <dd>{e.match?.email ?? "메일 주소 없음"}</dd>
            <dt className="text-muted-foreground">제목</dt>
            <dd className="font-medium">
              [{batch.companyName}] {period} 급여명세서
            </dd>
          </dl>
          <div className="flex flex-col gap-3 px-4 py-4 text-sm">
            <p>안녕하세요, {e.name}님.</p>
            <p>
              {period} 급여명세서를 보내드려요. 아래 버튼을 누르면 지급·공제 내역을 확인할 수 있어요. (지급일 {dateText(batch.payDate)})
            </p>
            <a href={link} className="rounded-md border bg-muted px-3 py-2 text-center font-medium hover:bg-muted/70">
              명세서 보기
            </a>
            <p className="text-xs text-muted-foreground">명세서는 개인정보라서 열 때 생년월일 8자리(예: 19xx.xx.xx, 점 없이 숫자만) 또는 휴대폰 번호 뒤 4자리를 입력해야 해요.</p>
            <p className="text-xs text-muted-foreground">명세서 화면에서 &lsquo;PDF로 저장&rsquo;을 눌러 파일로 보관할 수도 있어요.</p>
            <p className="text-xs text-muted-foreground">문의는 급여 담당자에게 해 주세요.</p>
          </div>
        </div>
      )}
    </div>
  );
}
