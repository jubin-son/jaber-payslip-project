# lib/parser (담당: 주빈)

급여대장 파일(xlsx·csv)을 읽어 `PayrollBatch`로 바꾼다.

- 시트·표 구조 감지(헤더 행, 표 여러 개, 월별 시트)
- AI가 만든 매핑표대로 셀에서 금액을 그대로 가져오고 `source`(시트·셀) 기록
- 검산 규칙으로 `issues` 생성
