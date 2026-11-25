"use client";
// 기본 관리: 사업주 본인이 ① 내 사업장(여러 곳 등록, 사업장마다 정보·상시근로자 수) ② 엑셀 항목 연결(+ 비과세)을 정하는 화면.
// 사업장을 골라서 보는 건 임직원 관리에서 한다. 여기서는 등록하고 고치기만 한다.
// 엑셀 항목 연결은 내 사업장 전체에 쓴다(한 파일에 여러 사업장이 들어와도 같은 연결로 읽는다).
// 소득 구분(근로소득·사업소득)은 직원마다 달라서 임직원 관리에서 정한다.
import { useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { JaberCompany } from "@/lib/jaber-db";
import { jaberCompanies } from "@/lib/jaber-db";
import {
  addWorkplace,
  baseCompany,
  headcountOf,
  isJaberCompany,
  removeWorkplace,
  settingsStore,
  updateBusiness,
  useOwner,
  type CompanyProfile,
  type ItemLink,
  type Owner,
} from "@/lib/hr-store";
import { builtinLabelsOf, builtinRoleOf, normalizeLabel } from "@/lib/parser/dictionary";
import { DEDUCTION_CATEGORIES, EARNING_CATEGORIES } from "@/types/payroll";
import type { HeadcountSetting } from "@/lib/wage-statement";

export function SettingsClient() {
  const owner = useOwner();
  if (!owner) return <p className="text-muted-foreground">불러오는 중…</p>;
  return (
    <div className="flex flex-col gap-6">
      {/* key: 테스트로 사업주를 바꾸면 펼친 칸을 처음 상태로 */}
      <WorkplacesCard key={owner.login} owner={owner} />
      <ItemLinkCard login={owner.login} links={owner.business.itemLinks} />
    </div>
  );
}

// ---------- ① 내 사업장 ----------

const BIZ_NO = /^\d{3}-\d{2}-\d{5}$/;

/** 숫자만 받아 000-00-00000 모양으로 */
function formatBizNo(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
}

const HEADCOUNT_SHORT: Record<HeadcountSetting, string> = { 자동: "상시근로자 자동", "5이상": "상시 5명 이상", "5미만": "상시 5명 미만" };

function WorkplacesCard({ owner }: { owner: Owner }) {
  const settings = settingsStore.use();
  // 사업장이 한 곳이면 정보를 바로 펼쳐 둔다
  const [open, setOpen] = useState<string | null>(owner.workplaces.length === 1 ? owner.login : null);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<string | null>(null);

  function remove(c: JaberCompany) {
    const ok = window.confirm(
      `'${c.name}'을(를) 내 사업장에서 뺄까요?\n그 사업장의 설정과 직원 명부는 지우지 않아요. 다시 추가하면 그대로 돌아와요.`,
    );
    if (ok) removeWorkplace(c.code);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">① 내 사업장 {owner.workplaces.length > 1 && <span className="text-muted-foreground">{owner.workplaces.length}곳</span>}</CardTitle>
        <CardDescription>
          사업자등록을 여러 개 갖고 있으면 사업장마다 등록해 두세요. 사업장마다 명세서에 들어갈 정보와 상시근로자 수를 따로 정하고, 급여대장 한
          파일에 여러 사업장이 들어 있으면 상호를 보고 사업장별로 나눠 읽어요. 직원은 임직원 관리에서 사업장을 골라 등록해요.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col divide-y rounded-xl border">
          {owner.workplaces.map((c) => {
            const main = c.code === owner.login;
            const isOpen = open === c.code;
            return (
              <li key={c.code} className="flex flex-col">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold">{c.name}</span>
                      {main && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600">가입 사업장</span>}
                      {!isJaberCompany(c.code) && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">새로 등록</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {c.bizRegNo} · 대표 {c.owner}
                      {c.industry ? ` · ${c.industry}` : ""} · {HEADCOUNT_SHORT[headcountOf(settings, c.code)]}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : c.code)}>
                      {isOpen ? "닫기" : "정보 수정"}
                      <ChevronDown className={`size-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                    </Button>
                    {!main && (
                      <button type="button" aria-label={`${c.name} 빼기`} onClick={() => remove(c)} className="p-1 text-neutral-400 hover:text-red-600">
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                </div>
                {isOpen && (
                  <div className="flex flex-col gap-6 border-t bg-neutral-50/60 px-4 py-4">
                    <ProfileForm company={c} />
                    <HeadcountPicker code={c.code} current={headcountOf(settings, c.code)} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {added && <p className="text-sm text-emerald-700">&lsquo;{added}&rsquo;을(를) 추가했어요.</p>}
        {adding ? (
          <AddWorkplaceForm
            owner={owner}
            onDone={(name) => {
              setAdding(false);
              setAdded(name);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <div>
            <Button
              variant="outline"
              onClick={() => {
                setAdding(true);
                setAdded(null);
              }}
            >
              <Plus className="size-4" /> 사업장 추가
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
function AddWorkplaceForm({ owner, onDone, onCancel }: { owner: Owner; onDone: (name: string) => void; onCancel: () => void }) {
  const main = owner.workplaces[0];
  const [draft, setDraft] = useState<CompanyProfile>({
    name: "",
    owner: main?.owner ?? "",
    bizRegNo: "",
    industry: "",
    address: "",
    ownerPhone: main?.ownerPhone ?? "",
    payrollWriter: main?.payrollWriter ?? "세무사",
    payrollOffice: main?.payrollOffice ?? "",
  });
  const set = <K extends keyof CompanyProfile>(k: K, v: CompanyProfile[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const mine = owner.workplaces.find((c) => c.bizRegNo === draft.bizRegNo);
  // 자버에 이미 가입된 사업자등록번호면 그 사업장을 불러온다 (직원 명부도 같이 따라온다)
  const listed = !mine && BIZ_NO.test(draft.bizRegNo) ? jaberCompanies.find((c) => c.bizRegNo === draft.bizRegNo) : undefined;
  const bizOk = BIZ_NO.test(draft.bizRegNo);
  const ok = !mine && (listed || (bizOk && draft.name.trim() && draft.owner.trim()));

  function submit() {
    if (!ok) return;
    if (listed) {
      addWorkplace({ code: listed.code });
      onDone(listed.name);
      return;
    }
    const company: CompanyProfile = {
      ...draft,
      name: draft.name.trim(),
      owner: draft.owner.trim(),
      industry: draft.industry?.trim() || undefined,
      address: draft.address?.trim() || undefined,
      ownerPhone: draft.ownerPhone?.trim() || undefined,
      payrollOffice: draft.payrollWriter === "사장" ? undefined : draft.payrollOffice?.trim() || undefined,
    };
    addWorkplace({ company });
    onDone(company.name);
  }

  const box = "rounded-lg border bg-white px-3 py-2 text-sm";
  const field = "flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground";
  const others = jaberCompanies.filter((c) => !owner.workplaces.some((w) => w.code === c.code));
  return (
    <div className="flex flex-col gap-4 rounded-xl bg-neutral-50 p-4">
      <p className="text-sm font-semibold">새 사업장 추가</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={field}>
          사업자등록번호 *
          <input
            inputMode="numeric"
            placeholder="000-00-00000"
            value={draft.bizRegNo}
            onChange={(e) => set("bizRegNo", formatBizNo(e.target.value))}
            className={box}
          />
          {mine && <span className="font-normal text-red-600">이미 내 사업장에 있는 번호예요 ({mine.name})</span>}
          {listed && <span className="font-normal text-indigo-700">자버에 가입된 사업장이에요: {listed.name}. 가입 정보와 직원 명부를 그대로 불러와요.</span>}
        </label>
        {!listed && (
          <>
            <label className={field}>
              상호 *
              <input value={draft.name} placeholder="예: 윤슬바삭치킨 봉천점" onChange={(e) => set("name", e.target.value)} className={box} />
            </label>
            <label className={field}>
              대표자 *
              <input value={draft.owner} onChange={(e) => set("owner", e.target.value)} className={box} />
            </label>
            <label className={field}>
              업종
              <input value={draft.industry ?? ""} placeholder="예: 음식점업(치킨 전문점)" onChange={(e) => set("industry", e.target.value)} className={box} />
            </label>
            <label className={`${field} sm:col-span-2`}>
              사업장 주소
              <input value={draft.address ?? ""} onChange={(e) => set("address", e.target.value)} className={box} />
            </label>
            <label className={field}>
              급여대장 작성
              <select value={draft.payrollWriter} onChange={(e) => set("payrollWriter", e.target.value as CompanyProfile["payrollWriter"])} className={box}>
                <option value="세무사">세무사</option>
                <option value="노무사">노무사</option>
                <option value="사장">사장 (직접 작성)</option>
              </select>
            </label>
            <label className={field}>
              급여대장 작성 사무소
              <input
                value={draft.payrollOffice ?? ""}
                disabled={draft.payrollWriter === "사장"}
                placeholder={draft.payrollWriter === "사장" ? "직접 작성하면 비워 둬요" : "예: 여울담세무회계"}
                onChange={(e) => set("payrollOffice", e.target.value)}
                className={`${box} disabled:bg-neutral-100`}
              />
            </label>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* 테스트 데이터로 여러 사업장을 바로 만들어 보려고 둔 지름길 (로그인이 붙으면 뺀다) */}
        <label className="flex items-center gap-2 rounded-lg border border-dashed border-neutral-300 px-2 py-1 text-[11px] text-muted-foreground">
          테스트: 자버 가입 사업장 불러오기
          <select
            value=""
            onChange={(e) => {
              const c = others.find((x) => x.code === e.target.value);
              if (!c) return;
              addWorkplace({ code: c.code });
              onDone(c.name);
            }}
            className="rounded-md border bg-white px-1.5 py-1 text-xs text-foreground"
          >
            <option value="">고르기…</option>
            {others.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>
            취소
          </Button>
          <Button disabled={!ok} onClick={submit}>
            {listed ? "불러와서 추가" : "추가"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------- 사업장 한 곳의 정보·상시근로자 수 (내 사업장 목록에서 펼친다) ----------

const PROFILE_FIELDS: { key: keyof CompanyProfile; label: string; placeholder?: string; wide?: boolean }[] = [
  { key: "name", label: "상호" },
  { key: "owner", label: "대표자" },
  { key: "bizRegNo", label: "사업자등록번호", placeholder: "000-00-00000" },
  { key: "industry", label: "업종" },
  { key: "ownerPhone", label: "대표자 휴대전화", placeholder: "010-0000-0000" },
  { key: "address", label: "사업장 주소", wide: true },
];

function ProfileForm({ company }: { company: JaberCompany }) {
  const [draft, setDraft] = useState<CompanyProfile>(() => ({
    name: company.name,
    owner: company.owner,
    bizRegNo: company.bizRegNo,
    industry: company.industry,
    address: company.address,
    ownerPhone: company.ownerPhone,
    payrollWriter: company.payrollWriter,
    payrollOffice: company.payrollOffice,
  }));
  const [saved, setSaved] = useState(false);
  const changed = (Object.keys(draft) as (keyof CompanyProfile)[]).some((k) => (draft[k] ?? "") !== (company[k] ?? ""));
  const ok = draft.name.trim().length > 0;

  function set<K extends keyof CompanyProfile>(k: K, v: CompanyProfile[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
    setSaved(false);
  }
  function save() {
    if (!ok) return;
    // 처음 등록한 정보(자버 가입 정보 또는 기본 관리에서 새로 등록한 정보)와 달라진 칸만 남긴다
    const base = baseCompany(company.code);
    const profile: Partial<CompanyProfile> = {};
    for (const k of Object.keys(draft) as (keyof CompanyProfile)[]) {
      const v = typeof draft[k] === "string" ? (draft[k] as string).trim() : draft[k];
      if (v !== (base?.[k] ?? "")) (profile as Record<string, unknown>)[k] = v || undefined;
    }
    updateBusiness(company.code, (b) => ({ ...b, profile }));
    setSaved(true);
  }

  const box = "rounded-lg border bg-white px-3 py-2 text-sm";
  const field = "flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground";
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold">사업장 정보</h3>
        <p className="text-sm text-muted-foreground">명세서 머리글과 직원 안내에 쓰는 정보예요. 처음 등록할 때 넣은 값이 들어 있고, 바뀐 게 있으면 고쳐 주세요.</p>
        <p className="text-sm text-muted-foreground">
          사업장코드 <span className="font-mono text-foreground">{company.code}</span> · {isJaberCompany(company.code) ? "자버 가입일" : "등록일"}{" "}
          {company.joinedAt}
        </p>
      </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {PROFILE_FIELDS.map((f) => (
            <label key={f.key} className={`${field} ${f.wide ? "sm:col-span-2" : ""}`}>
              {f.label}
              <input value={(draft[f.key] as string | undefined) ?? ""} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} className={box} />
            </label>
          ))}
          <label className={field}>
            급여대장 작성
            <select value={draft.payrollWriter} onChange={(e) => set("payrollWriter", e.target.value as CompanyProfile["payrollWriter"])} className={box}>
              <option value="세무사">세무사</option>
              <option value="노무사">노무사</option>
              <option value="사장">사장 (직접 작성)</option>
            </select>
          </label>
          <label className={field}>
            급여대장 작성 사무소
            <input
              value={draft.payrollOffice ?? ""}
              disabled={draft.payrollWriter === "사장"}
              placeholder={draft.payrollWriter === "사장" ? "직접 작성하면 비워 둬요" : "예: 솔결세무회계"}
              onChange={(e) => set("payrollOffice", e.target.value)}
              className={`${box} disabled:bg-neutral-50`}
            />
          </label>
        </div>
        <div className="flex items-center justify-end gap-3">
          {saved && !changed && <span className="text-sm text-emerald-700">저장했어요</span>}
          {!ok && <span className="text-sm text-red-600">상호는 비울 수 없어요</span>}
          <Button disabled={!changed || !ok} onClick={save}>
            저장
          </Button>
        </div>
    </section>
  );
}


const HEADCOUNT_OPTIONS: { value: HeadcountSetting; title: string; text: string }[] = [
  { value: "자동", title: "자동 (급여대장 인원으로 추정)", text: "올린 급여대장의 직원 수(일용·단시간 포함, 사업소득자 제외)로 달마다 판단해요" },
  { value: "5이상", title: "상시 5명 이상", text: "연장·야간·휴일 50% 가산율, 법정 연차수당, 공휴일 유급휴일이 적용돼요" },
  { value: "5미만", title: "상시 5명 미만", text: "가산·연차·공휴일 유급은 법정 의무가 아니에요. 주휴수당은 똑같이 적용돼요" },
];

function HeadcountPicker({ code, current }: { code: string; current: HeadcountSetting }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold">상시근로자 수</h3>
        <p className="text-sm text-muted-foreground">
          임금명세서를 주는 의무와 기재사항은 사업장 규모와 상관없이 같아요. 다만 상시 5명 미만이면 연장·야간·휴일 가산율과 법정 연차수당을 적을 필요가
          없어서, 명세서의 계산방법과 확인 메모가 달라져요. 상시근로자 수는 전 1개월 연인원을 가동일수로 나눠 세므로 달마다 바뀔 수 있어요.
        </p>
      </div>
        <div role="radiogroup" aria-label="상시근로자 수" className="grid gap-3 sm:grid-cols-3">
          {HEADCOUNT_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={current === o.value}
              onClick={() => updateBusiness(code, (b) => ({ ...b, headcount: o.value }))}
              className={`flex flex-col gap-1 rounded-2xl px-4 py-3 text-left ring-1 transition-colors ${
                current === o.value ? "bg-neutral-900 text-white ring-neutral-900" : "bg-white ring-neutral-200 hover:bg-neutral-50"
              }`}
            >
              <span className="font-semibold">{o.title}</span>
              <span className={`text-xs ${current === o.value ? "text-neutral-300" : "text-muted-foreground"}`}>{o.text}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          동거하는 친족만 쓰는 사업장과 가사사용인에게는 근로기준법 자체가 적용되지 않아요(근로기준법 제11조 제1항 단서).
        </p>
    </section>
  );
}

// ---------- ② 엑셀 항목 연결 (내 사업장 전체) ----------

function ItemLinkCard({ login, links }: { login: string; links: ItemLink[] }) {
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<ItemLink["category"]>("기본급");
  const [taxFree, setTaxFree] = useState(false);
  const key = normalizeLabel(label);
  const dup = links.some((l) => normalizeLabel(l.label) === key);
  const builtin = key ? builtinRoleOf(label) : undefined;
  const builtinText =
    builtin && (builtin.kind === "earning" || builtin.kind === "deduction")
      ? `기본으로 '${builtin.category}'${builtin.kind === "earning" && builtin.taxFree ? "(비과세)" : ""}(으)로 읽는 표기예요. 연결하면 이 설정이 먼저 적용돼요.`
      : builtin
        ? "기본으로 금액이 아닌 열로 읽는 표기예요. 연결하면 이 설정이 먼저 적용돼요."
        : null;
  const ok = key.length > 0 && !dup;

  function add() {
    if (!ok) return;
    const link: ItemLink = { label: label.trim(), category, ...(taxFree && isEarning(category) ? { taxFree: true } : {}) };
    updateBusiness(login, (b) => ({ ...b, itemLinks: [...b.itemLinks, link] }));
    setLabel("");
    setTaxFree(false);
  }
  function remove(i: number) {
    updateBusiness(login, (b) => ({ ...b, itemLinks: b.itemLinks.filter((_, n) => n !== i) }));
  }
  function change(i: number, c: ItemLink["category"]) {
    // 공제·금액 아님으로 바꾸면 비과세 표시는 의미가 없어서 지운다
    updateBusiness(login, (b) => ({
      ...b,
      itemLinks: b.itemLinks.map((l, n) => (n === i ? { label: l.label, category: c, ...(l.taxFree && isEarning(c) ? { taxFree: true } : {}) } : l)),
    }));
  }
  function toggleTaxFree(i: number, on: boolean) {
    updateBusiness(login, (b) => ({
      ...b,
      itemLinks: b.itemLinks.map((l, n) => (n === i ? { label: l.label, category: l.category, ...(on ? { taxFree: true } : {}) } : l)),
    }));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">② 엑셀 항목 연결</CardTitle>
        <CardDescription>
          급여대장 엑셀의 열 이름을 어떤 수당·공제 항목으로 읽을지 정해요. 사무소마다 쓰는 이름이 달라서 자동으로 못 읽는 항목을 여기서 연결하면, 다음
          업로드부터 바로 그 항목으로 들어가요. 내 사업장 모두에 같이 적용돼요. 연구활동비·보육수당 같은 비과세 수당은 &lsquo;비과세&rsquo;에 체크해 주세요.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2 rounded-xl bg-neutral-50 p-3 sm:flex-row sm:items-start">
          <div className="flex flex-1 flex-col gap-1">
            <input
              aria-label="엑셀 항목 이름"
              placeholder="엑셀 항목 이름 (예: 근속수당)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              className="rounded-lg border bg-white px-3 py-2 text-sm"
            />
            {dup && <span className="text-xs text-red-600">이미 연결한 항목이에요.</span>}
            {!dup && builtinText && <span className="text-xs text-muted-foreground">{builtinText}</span>}
          </div>
          <span className="hidden pt-2 text-neutral-400 sm:block">→</span>
          <CategorySelect value={category} onChange={setCategory} className="sm:w-48" />
          <TaxFreeCheck checked={taxFree} disabled={!isEarning(category)} onChange={setTaxFree} className="sm:pt-2" />
          <Button onClick={add} disabled={!ok}>
            연결 추가
          </Button>
        </div>

        {links.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 직접 연결한 항목이 없어요. 아래 기본 표기만으로 읽고 있어요.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="pb-1 font-normal">엑셀 항목</th>
                <th className="pb-1 font-normal">연결할 수당·공제 항목</th>
                <th className="pb-1 font-normal">비과세</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {links.map((l, i) => (
                <tr key={`${l.label}-${i}`} className="border-t">
                  <td className="py-2 font-medium">{l.label}</td>
                  <td className="py-2">
                    <CategorySelect value={l.category} onChange={(c) => change(i, c)} className="w-48" />
                  </td>
                  <td className="py-2">
                    <TaxFreeCheck
                      checked={!!l.taxFree}
                      disabled={!isEarning(l.category)}
                      onChange={(on) => toggleTaxFree(i, on)}
                      ariaLabel={`${l.label} 비과세`}
                    />
                  </td>
                  <td className="py-2 text-right">
                    <button type="button" aria-label={`${l.label} 연결 삭제`} onClick={() => remove(i)} className="text-neutral-400 hover:text-red-600">
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">기본으로 읽는 표기 보기</summary>
          <div className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {[...EARNING_CATEGORIES, ...DEDUCTION_CATEGORIES].map((c) => (
              <p key={c} className="flex gap-2 py-0.5">
                <span className="w-24 shrink-0 font-medium">{c}</span>
                <span className="text-muted-foreground">
                  {builtinLabelsOf(c)
                    .map((l) => {
                      const r = builtinRoleOf(l);
                      return r?.kind === "earning" && r.taxFree ? `${l}(비과세)` : l;
                    })
                    .join(", ") || "-"}
                </span>
              </p>
            ))}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

const isEarning = (c: ItemLink["category"]) => (EARNING_CATEGORIES as readonly string[]).includes(c);

/** 지급 항목을 비과세로 읽을지. 공제·금액 아님일 때는 끈다 */
function TaxFreeCheck({
  checked,
  disabled,
  onChange,
  ariaLabel = "비과세",
  className = "",
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (on: boolean) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <label
      className={`flex items-center gap-1.5 whitespace-nowrap text-sm ${disabled ? "text-neutral-300" : "text-neutral-700"} ${className}`}
      title={disabled ? "지급(수당) 항목일 때만 고를 수 있어요" : "비과세 수당이면 체크 (검산 때 과세 금액에서 빠지고 명세서에 '비과세'로 표시돼요)"}
    >
      <input
        type="checkbox"
        aria-label={ariaLabel}
        checked={checked && !disabled}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4"
      />
      비과세
    </label>
  );
}

function CategorySelect({
  value,
  onChange,
  className = "",
}: {
  value: ItemLink["category"];
  onChange: (c: ItemLink["category"]) => void;
  className?: string;
}) {
  return (
    <select
      aria-label="연결할 수당·공제 항목"
      value={value}
      onChange={(e) => onChange(e.target.value as ItemLink["category"])}
      className={`rounded-lg border bg-white px-2 py-2 text-sm ${className}`}
    >
      <optgroup label="지급(수당)">
        {EARNING_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </optgroup>
      <optgroup label="공제">
        {DEDUCTION_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </optgroup>
      <optgroup label="기타">
        <option value="무시">금액 아님(읽지 않음)</option>
      </optgroup>
    </select>
  );
}
