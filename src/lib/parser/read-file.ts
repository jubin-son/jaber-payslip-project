// 1단계: 올린 파일을 '시트 → 셀 표' 형태로 읽는다. 브라우저와 Node 둘 다에서 돈다.
// 여기서는 내용을 해석하지 않는다. 헤더 찾기·표 나누기·항목 분류는 다음 단계에서 한다.
import * as XLSX from "xlsx";

export type FileKind = "xlsx" | "csv" | "pdf" | "unknown";

export type CellValue = string | number | boolean | null;

export type RawSheet = {
  name: string;
  /** rows[r][c]. 엑셀 기준 r=0이 1행, c=0이 A열. 빈 칸은 null */
  rows: CellValue[][];
  /** 시트가 실제로 시작하는 위치(빈 앞줄·앞열을 건너뛴 경우). 셀 주소 계산에 쓴다 */
  origin: { row: number; col: number };
  rowCount: number;
  colCount: number;
};

export type RawFile = {
  fileName: string;
  kind: FileKind;
  /** CSV일 때만: 실제로 읽은 인코딩 */
  encoding?: "utf-8" | "utf-8-bom" | "cp949";
  sheets: RawSheet[];
  /** PDF 원본 바이트. 글자 PDF는 sheets에 쪽마다 셀 표로도 들어 있다(pdf-table.ts) */
  pdfBytes?: Uint8Array;
  warnings: string[];
};

export function detectKind(fileName: string): FileKind {
  const ext = fileName.toLowerCase().split(".").pop();
  if (ext === "xlsx" || ext === "xls") return "xlsx";
  if (ext === "csv") return "csv";
  if (ext === "pdf") return "pdf";
  return "unknown";
}

/** CSV 바이트를 글자로 바꾼다. BOM이 있으면 UTF-8, 없으면 UTF-8로 엄격하게 시도하고 실패하면 CP949 */
export function decodeCsv(bytes: Uint8Array): { text: string; encoding: NonNullable<RawFile["encoding"]> } {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(bytes.subarray(3)), encoding: "utf-8-bom" };
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8" };
  } catch {
    // 한국 세무 프로그램 CSV는 대부분 CP949. 브라우저·Node에서 'euc-kr' 디코더가 CP949를 처리한다
    return { text: new TextDecoder("euc-kr").decode(bytes), encoding: "cp949" };
  }
}

function sheetToRaw(name: string, ws: XLSX.WorkSheet): RawSheet {
  const ref = ws["!ref"];
  if (!ref) return { name, rows: [], origin: { row: 0, col: 0 }, rowCount: 0, colCount: 0 };
  const range = XLSX.utils.decode_range(ref);
  // 병합된 칸은 왼쪽 위 칸에만 값이 있다. 나중에 헤더를 찾기 쉽게 그대로 둔다(채우지 않음)
  const rows = XLSX.utils.sheet_to_json<CellValue[]>(ws, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  });
  const colCount = range.e.c - range.s.c + 1;
  for (const r of rows) while (r.length < colCount) r.push(null);
  return {
    name,
    rows,
    origin: { row: range.s.r, col: range.s.c },
    rowCount: rows.length,
    colCount,
  };
}

/** 엑셀 주소 "E7" 만들기. r, c는 rows 배열 기준 */
export function cellAddress(sheet: RawSheet, r: number, c: number): string {
  return XLSX.utils.encode_cell({ r: sheet.origin.row + r, c: sheet.origin.col + c });
}

/** 엑셀·CSV는 바로, PDF는 글자를 꺼내 셀 표로 만든다. 화면과 확인용 스크립트 모두 이것을 쓴다 */
export async function readBytesAsync(rawName: string, bytes: Uint8Array): Promise<RawFile> {
  const file = readBytes(rawName, bytes);
  if (file.kind !== "pdf") return file;
  const { readPdfSheets } = await import("./pdf-table");
  const sheets = await readPdfSheets(bytes);
  if (sheets.length === 0) file.warnings.push("글자를 찾지 못했어요. 스캔한 PDF는 아직 읽지 못해요.");
  return { ...file, sheets };
}

/** 엑셀·CSV 읽기(동기). PDF는 셀 표 없이 원본만 담는다 → readBytesAsync를 쓸 것 */
export function readBytes(rawName: string, bytes: Uint8Array): RawFile {
  // macOS는 한글 파일명을 자모 분리(NFD)로 넘길 때가 있다. 화면·비교용으로 합쳐 둔다
  const fileName = rawName.normalize("NFC");
  const kind = detectKind(fileName);
  const warnings: string[] = [];

  if (kind === "pdf") {
    return { fileName, kind, sheets: [], pdfBytes: bytes, warnings };
  }

  if (kind === "csv") {
    const { text, encoding } = decodeCsv(bytes);
    // raw: 모든 칸을 글자 그대로 받는다(SheetJS가 날짜를 엑셀 일련번호로 바꾸는 것을 막음).
    // 그다음 금액처럼 생긴 글자("2,920,000", "-1200")만 숫자로 바꾼다. 날짜·생년월일은 글자로 남는다.
    const wb = XLSX.read(text, { type: "string", raw: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const sheet = sheetToRaw("CSV", ws);
    sheet.rows = sheet.rows.map((row) => row.map(toNumberIfAmount));
    return { fileName, kind, encoding, sheets: [sheet], warnings };
  }

  if (kind === "xlsx") {
    // cellDates: 날짜 칸을 "2026-12-10" 같은 글자로 받기 위해 dateNF와 함께 쓴다
    const wb = XLSX.read(bytes, { type: "array", cellDates: true, dateNF: "yyyy-mm-dd" });
    const sheets = wb.SheetNames.map((n) => {
      const s = sheetToRaw(n, wb.Sheets[n]);
      // cellDates로 받은 날짜 칸(Date)을 "yyyy-mm-dd" 글자로 바꾼다
      s.rows = s.rows.map((row) => row.map((v: unknown) => (v instanceof Date ? toIsoDate(v) : (v as CellValue))));
      return s;
    });
    if (wb.Workbook?.Sheets?.some((s) => s.Hidden)) warnings.push("숨김 시트가 있어요.");
    return { fileName, kind, sheets, warnings };
  }

  return { fileName, kind, sheets: [], warnings: ["지원하지 않는 파일 형식이에요 (xlsx, csv, pdf만 가능)."] };
}

const AMOUNT = /^-?\d{1,3}(,\d{3})+(\.\d+)?$|^-?\d+(\.\d+)?$/;

/** "2,920,000" → 2920000. 0으로 시작하는 코드("0123"), 귀속월("202611"), 8자리 이상 숫자(날짜 20261125 등)는 글자로 둔다 */
export function toNumberIfAmount(v: CellValue): CellValue {
  if (typeof v !== "string") return v;
  const s = v.trim();
  if (s === "") return null;
  if (!AMOUNT.test(s)) return v;
  if (/^-?0\d/.test(s)) return v;
  if (/^(19|20)\d{2}(0[1-9]|1[0-2])$/.test(s)) return v; // 귀속월 "202611"
  const digits = s.replace(/[^\d]/g, "");
  if (!s.includes(",") && !s.includes(".") && digits.length >= 8) return v;
  return Number(s.replace(/,/g, ""));
}

function toIsoDate(d: Date): string {
  // SheetJS가 만든 Date는 현지 시간대 기준. 날짜만 쓴다
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 브라우저에서 <input type="file">로 받은 파일 읽기 */
export async function readFile(file: File): Promise<RawFile> {
  const buf = new Uint8Array(await file.arrayBuffer());
  return readBytesAsync(file.name, buf);
}
