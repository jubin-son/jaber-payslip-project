"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, CheckCircle2, FileQuestion, FileSpreadsheet, FileText, Info, Trash2, Upload, X } from "lucide-react";
import { detectKind, readFile, type RawFile } from "@/lib/parser/read-file";
import { extractFiles } from "@/lib/parser/extract";
import { saveParseResult } from "@/lib/store";
import { Button } from "@/components/ui/button";

const ACCEPT = ".xlsx,.xls,.csv,.pdf";

// unsupported: xlsx·csv·pdf가 아니라 읽지 않은 파일, error: 읽다가 실패한 파일
type Item = {
  id: string;
  status: "reading" | "done" | "error" | "unsupported";
  file?: RawFile;
  name: string;
  size: number;
  error?: string;
};

/** 같은 파일인지: 이름과 크기가 모두 같으면 같은 파일로 본다 */
const fileKey = (name: string, size: number) => `${name.normalize("NFC")}::${size}`;

export function UploadClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const [notice, setNotice] = useState<string | null>(null);
  // addFiles 안에서 최신 목록으로 중복을 확인하려고 둔다
  const itemsRef = useRef<Item[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const seen = new Set(itemsRef.current.map((it) => fileKey(it.name, it.size)));
    const skipped: string[] = [];
    const list = Array.from(files).filter((f) => {
      const key = fileKey(f.name, f.size);
      if (seen.has(key)) {
        skipped.push(f.name.normalize("NFC"));
        return false;
      }
      seen.add(key);
      return true;
    });
    setNotice(skipped.length ? `이미 올린 파일이라 빼 두었어요: ${skipped.join(", ")}` : null);
    if (list.length === 0) return;

    const pending: Item[] = list.map((f, i) => {
      const name = f.name.normalize("NFC");
      return {
        id: `${Date.now()}-${i}-${name}`,
        name,
        size: f.size,
        status: detectKind(name) === "unknown" ? "unsupported" : "reading",
      };
    });
    setItems((prev) => [...prev, ...pending]);
    await Promise.all(
      list.map(async (f, i) => {
        const { id, status } = pending[i];
        if (status === "unsupported") return;
        try {
          const raw = await readFile(f);
          setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: "done", file: raw } : it)));
        } catch (e) {
          const msg = readErrorMessage(e);
          setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: "error", error: msg } : it)));
        }
      }),
    );
  }, []);

  const done = items.filter((i) => i.status === "done");
  const reading = items.filter((i) => i.status === "reading");
  const problems = items.filter((i) => i.status === "error" || i.status === "unsupported");
  const canOrganize = done.length > 0 && reading.length === 0 && problems.length === 0;
  const blockReason =
    reading.length > 0
      ? `파일 ${reading.length}개를 읽는 중이에요. 잠시만 기다려 주세요.`
      : problems.length > 0
        ? `정리할 수 없는 파일 ${problems.length}개를 빼야 다음 단계로 갈 수 있어요.`
        : null;
  const allSelected = items.length > 0 && selected.size === items.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function remove(ids: Set<string>) {
    setItems((prev) => prev.filter((p) => !ids.has(p.id)));
    setSelected((prev) => new Set([...prev].filter((id) => !ids.has(id))));
  }

  return (
    <div className="flex flex-col gap-6">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-3xl border-2 border-dashed bg-white p-12 text-center transition-colors ${
          dragging ? "border-indigo-500 bg-indigo-50" : "border-neutral-300 hover:border-indigo-400 hover:bg-indigo-50/40"
        }`}
      >
        <span className="mb-2 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-300 text-white">
          <Upload className="size-7" />
        </span>
        <span className="text-lg font-semibold">급여대장 파일을 끌어다 놓거나 눌러서 고르세요</span>
        <span className="text-sm text-muted-foreground">엑셀(xlsx), CSV, PDF · 여러 파일 한 번에 가능</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {notice && (
        <div role="status" className="flex items-start gap-3 rounded-2xl bg-sky-50 px-5 py-4 text-sm text-sky-800">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span className="flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="안내 닫기" className="text-sky-600 hover:text-sky-900">
            <X className="size-4" />
          </button>
        </div>
      )}

      {items.length > 0 && (
        <section className="overflow-hidden rounded-3xl bg-white shadow-[0_4px_24px_rgba(0,0,0,0.05)] ring-1 ring-neutral-200/70">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-5 py-4">
            <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold">
              <input
                type="checkbox"
                className="size-4 accent-neutral-900"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)))}
                aria-label="전체 선택"
              />
              올린 파일 {items.length}개
              {selected.size > 0 && <span className="font-medium text-indigo-600">· {selected.size}개 선택</span>}
            </label>
            <Button variant="outline" size="sm" disabled={selected.size === 0} onClick={() => remove(selected)}>
              <Trash2 /> 선택 삭제
            </Button>
          </div>

          <ul className="divide-y divide-neutral-100">
            {items.map((it) => (
              <FileRow
                key={it.id}
                item={it}
                checked={selected.has(it.id)}
                onToggle={() => toggle(it.id)}
                onRemove={() => remove(new Set([it.id]))}
              />
            ))}
          </ul>
        </section>
      )}

      {items.length > 0 && (
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
          {blockReason && (
            <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-2 text-sm sm:justify-end">
              <span className={`flex items-center gap-1.5 ${problems.length > 0 && reading.length === 0 ? "text-destructive" : "text-muted-foreground"}`}>
                <AlertCircle className="size-4 shrink-0" />
                {blockReason}
              </span>
              {problems.length > 0 && reading.length === 0 && (
                <Button variant="outline" size="sm" onClick={() => remove(new Set(problems.map((p) => p.id)))}>
                  문제 있는 파일 빼기
                </Button>
              )}
            </div>
          )}
          <Button
            size="lg"
            disabled={!canOrganize}
            onClick={() => {
              saveParseResult(extractFiles(done.map((i) => i.file!)));
              router.push("/organize");
            }}
          >
            AI로 정리하기 <ArrowRight />
          </Button>
        </div>
      )}
    </div>
  );
}

function FileRow({
  item,
  checked,
  onToggle,
  onRemove,
}: {
  item: Item;
  checked: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const f = item.file;
  const kind = f?.kind ?? kindFromName(item.name);
  const bad = item.status === "error" || item.status === "unsupported";
  const Icon = item.status === "unsupported" ? FileQuestion : kind === "pdf" ? FileText : FileSpreadsheet;
  return (
    <li className={`flex items-center gap-4 px-5 py-4 transition-colors ${bad ? "bg-red-50/70" : checked ? "bg-indigo-50/60" : "hover:bg-neutral-50"}`}>
      <input
        type="checkbox"
        className="size-4 shrink-0 accent-neutral-900"
        checked={checked}
        onChange={onToggle}
        aria-label={`${item.name} 선택`}
      />
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
          bad ? "bg-red-100 text-red-500" : kind === "pdf" ? "bg-rose-50 text-rose-500" : kind === "csv" ? "bg-sky-50 text-sky-600" : "bg-emerald-50 text-emerald-600"
        }`}
      >
        <Icon className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-semibold" title={item.name}>
          {item.name}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
          <span>{kind.toUpperCase()}</span>
          <span>· {formatSize(item.size)}</span>
          {item.status === "reading" && <span>· 읽는 중…</span>}
          {item.status === "unsupported" && (
            <span className="font-medium text-destructive">· 올릴 수 없는 형식이에요 (엑셀·CSV·PDF만 가능)</span>
          )}
          {item.status === "error" && <span className="font-medium text-destructive">· {item.error}</span>}
          {f && f.kind !== "pdf" && <span>· 시트 {f.sheets.length}개</span>}
          {f?.encoding && <span>· {encodingLabel(f.encoding)}</span>}
          {f?.warnings.map((w) => (
            <span key={w} className="text-amber-600">
              · {w}
            </span>
          ))}
        </span>
      </div>
      {item.status === "done" && <CheckCircle2 className="hidden size-5 shrink-0 text-indigo-500 sm:block" aria-label="읽기 완료" />}
      <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`${item.name} 삭제`}>
        <X />
      </Button>
    </li>
  );
}

/** 읽기 실패 이유를 담당자가 알아들을 말로 바꾼다 (원문은 콘솔에 남긴다) */
function readErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  console.warn("파일 읽기 실패:", raw);
  // 엑셀 암호 파일은 SheetJS가 "File is password-protected"로 알려준다. 깨진 ZIP의 "encryption" 오류와 구분한다
  if (/password/i.test(raw)) return "암호가 걸린 파일이에요. 암호를 풀고 다시 올려 주세요";
  return "파일이 손상됐거나 내용을 읽을 수 없어요";
}

function kindFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ext === "xls" ? "xlsx" : ext;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function encodingLabel(e: NonNullable<RawFile["encoding"]>): string {
  return e === "cp949" ? "한글 CSV (CP949)" : e === "utf-8-bom" ? "UTF-8 (BOM)" : "UTF-8";
}
