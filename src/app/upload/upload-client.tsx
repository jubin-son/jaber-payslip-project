"use client";

import { useCallback, useRef, useState } from "react";
import { readFile, type RawFile, type RawSheet } from "@/lib/parser/read-file";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import * as XLSX from "xlsx";

const ACCEPT = ".xlsx,.xls,.csv,.pdf";
const PREVIEW_ROWS = 12;

type Item = { id: string; status: "reading" | "done" | "error"; file?: RawFile; name: string; error?: string };

export function UploadClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    const pending: Item[] = list.map((f, i) => ({
      id: `${Date.now()}-${i}-${f.name}`,
      name: f.name.normalize("NFC"),
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
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
          dragging ? "border-primary bg-muted" : "border-border hover:bg-muted/50"
        }`}
      >
        <span className="text-lg font-medium">급여대장 파일을 끌어다 놓거나 눌러서 고르세요</span>
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
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            파일 {items.length}개 · 시트 {done.reduce((n, i) => n + (i.file?.sheets.length ?? 0), 0)}개 읽음
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setItems([])}>
              모두 지우기
            </Button>
            <Button size="sm" disabled title="2단계(AI 정리)를 만든 뒤 켜져요">
              AI로 정리하기
            </Button>
          </div>
        </div>
      )}

      <ul className="flex flex-col gap-4">
        {items.map((it) => (
          <li key={it.id}>
            <FileCard item={it} onRemove={() => setItems((prev) => prev.filter((p) => p.id !== it.id))} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function FileCard({ item, onRemove }: { item: Item; onRemove: () => void }) {
  const f = item.file;
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="truncate text-base">{item.name}</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2">
            {item.status === "reading" && <span>읽는 중…</span>}
            {item.status === "error" && <span className="text-destructive">읽지 못했어요: {item.error}</span>}
            {f && (
              <>
                <Badge variant="secondary">{f.kind.toUpperCase()}</Badge>
                {f.encoding && <Badge variant="outline">{encodingLabel(f.encoding)}</Badge>}
                {f.kind !== "pdf" && <span>시트 {f.sheets.length}개</span>}
                {f.kind === "pdf" && <span>PDF는 2단계에서 AI가 직접 읽어요</span>}
                {f.warnings.map((w) => (
                  <span key={w} className="text-amber-600">
                    {w}
                  </span>
                ))}
              </>
            )}
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={onRemove}>
          빼기
        </Button>
      </CardHeader>
      {f && f.sheets.length > 0 && (
        <CardContent className="flex flex-col gap-4">
          {f.sheets.map((s) => (
            <SheetPreview key={s.name} sheet={s} />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

function SheetPreview({ sheet }: { sheet: RawSheet }) {
  const [open, setOpen] = useState(false);
  const rows = open ? sheet.rows : sheet.rows.slice(0, PREVIEW_ROWS);
  const cols = Math.min(sheet.colCount, 40);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">
          {sheet.name} <span className="text-muted-foreground">· {sheet.rowCount}행 × {sheet.colCount}열</span>
        </span>
        {sheet.rowCount > PREVIEW_ROWS && (
          <Button variant="link" size="sm" onClick={() => setOpen((o) => !o)}>
            {open ? "접기" : `전체 ${sheet.rowCount}행 보기`}
          </Button>
        )}
      </div>
      <div className="max-h-96 overflow-auto rounded-md border">
        <table className="border-collapse text-xs">
          <thead className="sticky top-0 bg-muted">
            <tr>
              <th className="border px-2 py-1 text-muted-foreground" />
              {Array.from({ length: cols }, (_, c) => (
                <th key={c} className="border px-2 py-1 font-normal text-muted-foreground">
                  {XLSX.utils.encode_col(sheet.origin.col + c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                <td className="border bg-muted px-2 py-1 text-right text-muted-foreground">
                  {sheet.origin.row + r + 1}
                </td>
                {row.slice(0, cols).map((v, c) => (
                  <td
                    key={c}
                    className={`max-w-48 truncate whitespace-nowrap border px-2 py-1 ${
                      typeof v === "number" ? "text-right tabular-nums" : ""
                    }`}
                    title={v === null ? "" : String(v)}
                  >
                    {formatCell(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isInteger(v) ? v.toLocaleString("ko-KR") : String(v);
  return String(v);
}

function encodingLabel(e: NonNullable<RawFile["encoding"]>): string {
  return e === "cp949" ? "한글 CSV (CP949)" : e === "utf-8-bom" ? "UTF-8 (BOM)" : "UTF-8";
}
