"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, FileSpreadsheet, FileText, Trash2, Upload, X } from "lucide-react";
import { readFile, type RawFile } from "@/lib/parser/read-file";
import { extractFiles } from "@/lib/parser/extract";
import { saveParseResult } from "@/lib/store";
import { Button } from "@/components/ui/button";

const ACCEPT = ".xlsx,.xls,.csv,.pdf";

type Item = { id: string; status: "reading" | "done" | "error"; file?: RawFile; name: string; size: number; error?: string };

export function UploadClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    const pending: Item[] = list.map((f, i) => ({
      id: `${Date.now()}-${i}-${f.name}`,
      name: f.name.normalize("NFC"),
      size: f.size,
      status: "reading",
    }));
    setItems((prev) => [...prev, ...pending]);
    await Promise.all(
      list.map(async (f, i) => {
        const id = pending[i].id;
        try {
          const raw = await readFile(f);
          setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: "done", file: raw } : it)));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: "error", error: msg } : it)));
        }
      }),
    );
  }, []);

  const done = items.filter((i) => i.status === "done");
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
        <div className="flex justify-end">
          <Button
            size="lg"
            disabled={done.length === 0 || done.length !== items.length}
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
  const Icon = kind === "pdf" ? FileText : FileSpreadsheet;
  return (
    <li className={`flex items-center gap-4 px-5 py-4 transition-colors ${checked ? "bg-indigo-50/60" : "hover:bg-neutral-50"}`}>
      <input
        type="checkbox"
        className="size-4 shrink-0 accent-neutral-900"
        checked={checked}
        onChange={onToggle}
        aria-label={`${item.name} 선택`}
      />
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
          kind === "pdf" ? "bg-rose-50 text-rose-500" : kind === "csv" ? "bg-sky-50 text-sky-600" : "bg-emerald-50 text-emerald-600"
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
          {item.status === "error" && <span className="text-destructive">· 읽지 못했어요: {item.error}</span>}
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
