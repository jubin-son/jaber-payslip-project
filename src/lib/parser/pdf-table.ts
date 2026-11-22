// PDF 급여대장 읽기: 글자가 들어 있는 PDF(세무·급여 프로그램 출력본)에서
// 글자와 위치를 꺼내 엑셀 시트와 같은 '셀 표'(RawSheet)로 다시 만든다.
// 금액은 PDF에 적힌 글자를 그대로 쓴다(AI가 읽지 않음). 스캔본처럼 글자가 없는 PDF는 빈 결과를 돌려준다.
import { toNumberIfAmount, type CellValue, type RawSheet } from "./read-file";

/** PDF 한 쪽 안의 글자 조각. x·y는 왼쪽 아래 기준 좌표, y는 글자 아래선 */
export type PdfTextItem = { str: string; x: number; y: number; w: number; h: number };

type Line = { y: number; items: PdfTextItem[] };

/** 같은 줄로 볼 y 차이 */
const SAME_LINE = 2;
/** 표 줄로 볼 최소 글자 조각 수(제목·안내 문구 줄은 이보다 적다) */
const TABLE_LINE_MIN_ITEMS = 5;

/** 글자 조각 → 셀 표. 순수 함수라 테스트하기 쉽다 */
export function itemsToSheet(name: string, raw: PdfTextItem[]): RawSheet {
  const items = raw.filter((i) => i.str.trim() !== "");
  if (items.length === 0) return { name, rows: [], origin: { row: 0, col: 0 }, rowCount: 0, colCount: 0 };

  // 1) 줄 나누기: 위에서 아래로
  const lines: Line[] = [];
  for (const it of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.find((l) => Math.abs(l.y - it.y) <= SAME_LINE);
    if (line) line.items.push(it);
    else lines.push({ y: it.y, items: [it] });
  }
  lines.sort((a, b) => b.y - a.y);

  // 2) 열 나누기: 표 줄의 글자 칸 가로 범위를 겹치는 것끼리 합친다
  const tableItems = lines.filter((l) => l.items.length >= TABLE_LINE_MIN_ITEMS).flatMap((l) => l.items);
  const columns = mergeRanges((tableItems.length ? tableItems : items).map((i) => [i.x, i.x + Math.max(i.w, 1)]));
  const colOf = (it: PdfTextItem) => {
    const mid = it.x + Math.max(it.w, 1) / 2;
    let best = 0;
    let bestDist = Infinity;
    columns.forEach(([a, b], c) => {
      // 표 밖의 긴 문구는 시작 위치로, 표 안 글자는 가운데로 고른다
      const p = it.w > (b - a) * 2 ? it.x : mid;
      const d = p < a ? a - p : p > b ? p - b : 0;
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    });
    return best;
  };

  // 3) 여러 줄로 나뉜 머리글 합치기: 줄 간격이 보통 간격의 절반보다 좁으면 한 행으로 본다
  //    (예: "연장근로" / "수당" → "연장근로수당")
  const gaps = lines.slice(1).map((l, i) => lines[i].y - l.y);
  const usual = median(gaps) ?? 0;
  const groups: Line[][] = [];
  lines.forEach((l, i) => {
    if (i > 0 && usual > 0 && lines[i - 1].y - l.y < usual * 0.5) groups[groups.length - 1].push(l);
    else groups.push([l]);
  });

  // 4) 셀 채우기
  const rows: CellValue[][] = groups.map((g) => {
    const cells: string[] = Array(columns.length).fill("");
    for (const l of g) {
      for (const it of [...l.items].sort((a, b) => a.x - b.x)) {
        const c = colOf(it);
        const text = it.str.trim();
        // 머리글 조각은 붙여 쓰고(근로+일수), 같은 줄의 다른 조각은 띄어 쓴다
        cells[c] = cells[c] ? (g.length > 1 && l !== g[0] ? cells[c] + text : `${cells[c]} ${text}`) : text;
      }
    }
    return cells.map((s) => (s === "" ? null : toNumberIfAmount(s)));
  });

  return { name, rows, origin: { row: 0, col: 0 }, rowCount: rows.length, colCount: columns.length };
}

function mergeRanges(ranges: number[][]): [number, number][] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + 0.5) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

function median(ns: number[]): number | undefined {
  if (!ns.length) return undefined;
  const s = [...ns].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** PDF 바이트 → 쪽마다 셀 표 하나. 글자가 하나도 없으면 빈 배열 */
export async function readPdfSheets(bytes: Uint8Array): Promise<RawSheet[]> {
  const pdfjs = await loadPdfjs();
  // pdf.js가 버퍼를 넘겨받아 비우므로 복사본을 넘긴다(원본은 pdfBytes로 보관)
  // 브라우저에서는 미리 띄워 둔 일꾼을 같이 쓴다(doc.destroy()가 남이 넘긴 일꾼은 끄지 않는다). Node는 일꾼 없이 돈다
  const worker = typeof window === "undefined" ? undefined : await sharedWorker();
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: true, isEvalSupported: false, worker }).promise;
  const sheets: RawSheet[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items: PdfTextItem[] = [];
      for (const it of content.items) {
        if (!("str" in it)) continue;
        items.push({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width, h: it.height });
      }
      const sheet = itemsToSheet(`${p}쪽`, items);
      if (sheet.rowCount > 0) sheets.push(sheet);
    }
  } finally {
    await doc.destroy();
  }
  return sheets;
}

type Pdfjs = typeof import("pdfjs-dist");
type PdfWorker = InstanceType<Pdfjs["PDFWorker"]>;

let pdfjsPromise: Promise<Pdfjs> | null = null;
let workerPromise: Promise<PdfWorker> | null = null;

/**
 * 브라우저: PDF 읽기 도구와 일꾼(worker)을 미리 띄워 둔다. 업로드 화면에 들어올 때 부른다.
 * 처음 한 번만 실제로 불러오고, 이후 PDF는 같은 일꾼을 다시 쓴다.
 */
export async function preloadPdfReader(): Promise<void> {
  if (typeof window === "undefined") return;
  await sharedWorker();
}

function sharedWorker(): Promise<PdfWorker> {
  workerPromise ??= loadPdfjs()
    .then(async (pdfjs) => {
      const worker = new pdfjs.PDFWorker();
      await worker.promise;
      return worker;
    })
    .catch((e) => {
      // 실패하면 다음에 다시 시도할 수 있게 비워 둔다
      workerPromise = null;
      throw e;
    });
  return workerPromise;
}

function loadPdfjs(): Promise<Pdfjs> {
  pdfjsPromise ??= importPdfjs().catch((e) => {
    pdfjsPromise = null;
    throw e;
  });
  return pdfjsPromise;
}

async function importPdfjs(): Promise<Pdfjs> {
  if (typeof window === "undefined") {
    // Node(확인용 스크립트): 일꾼(worker) 없이 도는 legacy 빌드
    return (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as Pdfjs;
  }
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  }
  return pdfjs;
}
