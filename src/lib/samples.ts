// 파서가 완성되기 전까지 화면 개발에 쓰는 샘플 데이터.
// 실제 파서가 붙으면(연결 단계) 이 파일 대신 파서 결과를 쓴다.
import type { PayrollBatch } from "@/types/payroll";
import normal from "../../samples/normal.json";
import withIssues from "../../samples/with-issues.json";
import large from "../../samples/large.json";

export const samples = {
  normal: normal as PayrollBatch, // 새하얀결세탁소 4명, 검산 다 맞음
  withIssues: withIssues as PayrollBatch, // 카페소라결 6명, 오류·경고 7종
  large: large as PayrollBatch, // 책여울스터디카페 12명
} satisfies Record<string, PayrollBatch>;

export type SampleName = keyof typeof samples;
