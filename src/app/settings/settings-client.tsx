"use client";
// 기본 관리: ① 사업장별 소득 구분(근로소득/사업소득) ② 엑셀 항목 → 연결할 수당·공제 항목 (+ 비과세 여부)
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { jaberCompanies } from "@/lib/jaber-db";
import { settingsStore, incomeTypeOf, type IncomeType, type ItemLink } from "@/lib/hr-store";
import { builtinLabelsOf, builtinRoleOf, normalizeLabel } from "@/lib/parser/dictionary";
import { DEDUCTION_CATEGORIES, EARNING_CATEGORIES } from "@/types/payroll";

const INCOME_TYPES: IncomeType[] = ["근로소득", "사업소득"];

export function SettingsClient() {
  const settings = settingsStore.use();
  if (!settings) return <p className="text-muted-foreground">불러오는 중…</p>;
  return (
    <div className="flex flex-col gap-6">
      <IncomeTypeCard />
      <ItemLinkCard links={settings.itemLinks} />
    </div>
  );
}

// ---------- ① 소득 구분 ----------

function IncomeTypeCard() {
  const settings = settingsStore.use();
  function setType(code: string, t: IncomeType) {
    settingsStore.set((s) => ({ ...s, incomeType: { ...s.incomeType, [code]: t } }));
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">① 소득 구분</CardTitle>
        <CardDescription>
          직원에게 주는 돈이 근로소득(4대보험·근로소득세)인지 사업소득(3.3% 원천징수)인지 정해요. 사업소득으로 정한 사업장은 명세서 제목이
          &lsquo;사업소득 지급명세서&rsquo;로 나가요.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y rounded-xl border">
          {jaberCompanies.map((c) => {
            const cur = incomeTypeOf(settings, c.code);
            return (
              <li key={c.code} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{c.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {c.code} · {c.industry ?? "업종 없음"}
                  </span>
                </span>
                <span role="radiogroup" aria-label={`${c.name} 소득 구분`} className="flex rounded-full bg-neutral-100 p-0.5">
                  {INCOME_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={cur === t}
                      onClick={() => setType(c.code, t)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                        cur === t ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-900"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

// ---------- ② 엑셀 항목 연결 ----------

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
    settingsStore.set((s) => ({ ...s, itemLinks: [...s.itemLinks, link] }));
    setLabel("");
    setTaxFree(false);
  }
  function remove(i: number) {
    settingsStore.set((s) => ({ ...s, itemLinks: s.itemLinks.filter((_, n) => n !== i) }));
  }
  function change(i: number, c: ItemLink["category"]) {
    // 공제·금액 아님으로 바꾸면 비과세 표시는 의미가 없어서 지운다
    settingsStore.set((s) => ({
      ...s,
      itemLinks: s.itemLinks.map((l, n) => (n === i ? { label: l.label, category: c, ...(l.taxFree && isEarning(c) ? { taxFree: true } : {}) } : l)),
    }));
  }
  function toggleTaxFree(i: number, on: boolean) {
    settingsStore.set((s) => ({
      ...s,
      itemLinks: s.itemLinks.map((l, n) => (n === i ? { label: l.label, category: l.category, ...(on ? { taxFree: true } : {}) } : l)),
    }));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">② 엑셀 항목 연결</CardTitle>
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
