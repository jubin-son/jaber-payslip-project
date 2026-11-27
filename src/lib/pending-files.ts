// 첫 화면에 놓은 파일을 업로드 화면으로 넘기는 자리.
// File은 sessionStorage에 넣을 수 없어서, 화면 이동(클라이언트 이동) 동안 살아 있는 변수에 잠깐 둔다.
// 새로고침하면 사라지는데, 그때는 업로드 화면에서 다시 고르면 된다.

let pending: File[] = [];

export function setPendingFiles(files: File[]) {
  pending = files;
}

/** 넘겨받은 파일을 꺼내고 비운다(한 번만 쓰인다) */
export function takePendingFiles(): File[] {
  const files = pending;
  pending = [];
  return files;
}
