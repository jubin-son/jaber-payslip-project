"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Upload } from "lucide-react";
import { setPendingFiles } from "@/lib/pending-files";

const ACCEPT = ".xlsx,.xls,.csv,.pdf";

/**
 * 첫 화면 업로드 상자. 파일을 놓거나 고르면 업로드 화면으로 넘어가 바로 변환을 시작한다.
 * 상자 밖(첫 화면 어디든)에 놓아도 받는다.
 */
export function LandingDropzone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [going, setGoing] = useState(false);

  useEffect(() => {
    router.prefetch("/upload");
  }, [router]);

  function go(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setGoing(true);
    setPendingFiles(list);
    router.push("/upload?from=home");
  }
  const goRef = useRef(go);
  goRef.current = go;

  // 첫 화면 어디에 놓아도 받기. 파일을 끌고 들어오면 상자를 강조한다
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth += 1;
      setDragging(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      if (e.dataTransfer?.files.length) goRef.current(e.dataTransfer.files);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  return (
    <div className="mx-auto mt-9 max-w-xl">
      <label
        className={`group flex cursor-pointer flex-col items-center gap-3 rounded-[1.75rem] border-2 border-dashed px-6 py-8 transition-all ${
          dragging
            ? "scale-[1.02] border-[#4FE38E] bg-[#E9FFF2] shadow-[0_20px_50px_rgba(79,227,142,0.30)]"
            : "border-neutral-300 bg-white shadow-[0_14px_40px_rgba(0,0,0,0.06)] hover:border-[#111]"
        }`}
      >
        <span
          className={`flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4FE38E] via-[#75FBA2] to-[#C9FFE0] text-[#111] transition-transform ${
            dragging ? "-translate-y-1" : "group-hover:-translate-y-0.5"
          }`}
        >
          <Upload className="size-7" />
        </span>
        <span className="text-lg font-bold text-[#111] sm:text-xl">
          {going ? (
            "파일을 여는 중이에요…"
          ) : dragging ? (
            "여기에 놓으면 바로 시작해요"
          ) : (
            <>
              {/* 휴대폰은 끌어다 놓기가 없어서 문구를 바꾼다 */}
              <span className="pointer-coarse:hidden">급여대장 파일을 여기에 놓으세요</span>
              <span className="hidden pointer-coarse:inline">급여대장 파일을 올려 주세요</span>
            </>
          )}
        </span>
        <span className="text-sm text-neutral-500">엑셀·CSV·PDF · 여러 파일 한 번에</span>
        <span className="mt-1 inline-flex items-center gap-2 rounded-full bg-[#111] px-7 py-3 font-semibold text-white transition-colors group-hover:bg-neutral-700">
          파일 고르기
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          disabled={going}
          onChange={(e) => {
            if (e.target.files?.length) go(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      <p className="mt-4 text-sm text-neutral-500">
        파일이 없나요?{" "}
        <Link href="/upload?sample=1" className="inline-flex items-center gap-1 font-semibold text-[#111] underline decoration-[#4FE38E] decoration-2 underline-offset-4 hover:decoration-[#111]">
          샘플로 해보기 <ArrowRight className="size-3.5" />
        </Link>
      </p>
    </div>
  );
}
