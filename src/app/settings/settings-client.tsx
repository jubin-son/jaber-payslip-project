"use client";
// 기본 관리: 사업주 본인이 ① 내 사업장 정보 ② 소득 구분 ③ 엑셀 항목 연결(+ 비과세)을 정하는 화면.
// 값은 로그인한 사업주(지금은 테스트용으로 고른 사업장)의 것만 보이고 고쳐진다.
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { JaberCompany } from "@/lib/jaber-db";
import { jaberCompanies } from "@/lib/jaber-db";
import { updateMyBusiness, useOwner, type CompanyProfile, type IncomeType, type ItemLink } from "@/lib/hr-store";
import { builtinLabelsOf, builtinRoleOf, normalizeLabel } from "@/lib/parser/dictionary";
import { DEDUCTION_CATEGORIES, EARNING_CATEGORIES } from "@/types/payroll";

const INCOME_TYPES: IncomeType[] = ["근로소득", "사업소득"];

export function SettingsClient() {
  const owner = useOwner();
  if (!owner) return <p className="text-muted-foreground">불러오는 중…</p>;
  return (
    <div className="flex flex-col gap-6">
      {/* key: 테스트로 사업주를 바꾸면 입력 칸을 새 사업장 값으로 다시 채운다 */}
      <ProfileCard key={owner.code} company={owner.company} />
      <IncomeTypeCard current={owner.business.incomeType} />
      <ItemLinkCard links={owner.business.itemLinks} />
    </div>
  );
}

// ---------- ① 내 사업장 정보 ----------

const PROFILE_FIELDS: { key: keyof CompanyProfile; label: string; placeholder?: string; wide?: boolean }[] = [
  { key: "name", label: "상호" },
  { key: "owner", label: "대표자" },
  { key: "bizRegNo", label: "사업자등록번호", placeholder: "000-00-00000" },
  { key: "industry", label: "업종" },
  { key: "ownerPhone", label: "대표자 휴대전화", placeholder: "010-0000-0000" },
  { key: "address", label: "사업장 주소", wide: true },
];

function ProfileCard({ company }: { company: JaberCompany }) {
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
    // 자버 가입 정보와 달라진 칸만 남긴다
    const base = jaberCompanies.find((c) => c.code === company.code);
    const profile: Partial<CompanyProfile> = {};
    for (const k of Object.keys(draft) as (keyof CompanyProfile)[]) {
      const v = typeof draft[k] === "string" ? (draft[k] as string).trim() : draft[k];
      if (v !== (base?.[k] ?? "")) (profile as Record<string, unknown>)[k] = v || undefined;
    }
    updateMyBusiness((b) => ({ ...b, profile }));
    setSaved(true);
  }

  const box = "rounded-lg border bg-white px-3 py-2 text-sm";
  const field = "flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">① 내 사업장 정보</CardTitle>
        <CardDescription>명세서 머리글과 직원 안내에 쓰는 정보예요. 자버에 가입할 때 넣은 값이 들어 있고, 바뀐 게 있으면 고쳐 주세요.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          사업장코드 <span className="font-mono text-foreground">{company.code}</span> · 자버 가입일 {company.joinedAt}
        </p>
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
      </CardContent>
    </Card>
  );
}

// ---------- ② 소득 구분 ----------

function IncomeTypeCard({ current }: { current: IncomeType }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">② 소득 구분</CardTitle>
        <CardDescription>
          직원에게 주는 돈이 근로소득(4대보험·근로소득세)인지 사업소득(3.3% 원천징수)인지 정해요. 사업소득으로 정하면 명세서 제목이 &lsquo;사업소득
          지급명세서&rsquo;로 나가요.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div role="radiogroup" aria-label="소득 구분" className="grid gap-3 sm:grid-cols-2">
          {INCOME_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={current === t}
              onClick={() => updateMyBusiness((b) => ({ ...b, incomeType: t }))}
              className={`flex flex-col gap-1 rounded-2xl px-4 py-3 text-left ring-1 transition-colors ${
                current === t ? "bg-neutral-900 text-white ring-neutral-900" : "bg-white ring-neutral-200 hover:bg-neutral-50"
              }`}
            >
              <span className="font-semibold">{t}</span>
              <span className={`text-xs ${current === t ? "text-neutral-300" : "text-muted-foreground"}`}>
                {t === "근로소득" ? "4대보험·근로소득세를 떼는 직원 (대부분)" : "프리랜서·강사처럼 3.3%를 떼는 경우"}
              </span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- ③ 엑셀 항목 연결 ----------

function ItemLinkCard({ links }: { links: ItemLink[] }) {
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
    updateMyBusiness((b) => ({ ...b, itemLinks: [...b.itemLinks, link] }));
    setLabel("");
    setTaxFree(false);
  }
  function remove(i: number) {
    updateMyBusiness((b) => ({ ...b, itemLinks: b.itemLinks.filter((_, n) => n !== i) }));
  }
  function change(i: number, c: ItemLink["category"]) {
    // 공제·금액 아님으로 바꾸면 비과세 표시는 의미가 없어서 지운다
    updateMyBusiness((b) => ({
      ...b,
      itemLinks: b.itemLinks.map((l, n) => (n === i ? { label: l.label, category: c, ...(l.taxFree && isEarning(c) ? { taxFree: true } : {}) } : l)),
    }));
  }
  function toggleTaxFree(i: number, on: boolean) {
    updateMyBusiness((b) => ({
      ...b,
      itemLinks: b.itemLinks.map((l, n) => (n === i ? { label: l.label, category: l.category, ...(on ? { taxFree: true } : {}) } : l)),
    }));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">③ 엑셀 항목 연결</CardTitle>
        <CardDescription>
          급여대장 엑셀의 열 이름을 어떤 수당·공제 항목으로 읽을지 정해요. 사무소마다 쓰는 이름이 달라서 자동으로 못 읽는 항목을 여기서 연결하면, 다음
          업로드부터 바로 그 항목으로 들어가요. 연구활동비·보육수당 같은 비과세 수당은 &lsquo;비과세&rsquo;에 체크해 주세요.
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
