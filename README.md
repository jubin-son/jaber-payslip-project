# 자버 급여명세서 시제품

세무사·노무사가 보낸 급여대장 파일 하나로, 직원별 급여명세서 발송까지 끝내는 웹 도구.

흐름: ① 업로드 → ② AI가 지급·공제 항목과 금액을 데이터로 정리 → ③ 담당자가 확인·수정 → ④ 직원별 명세서 생성 → ⑤ 발송(시연)

작업 보드·데이터 스키마·작업 규칙은 팀 노션 '자버 급여명세서 개발 프로젝트' 페이지에 있다.

## 처음 실행하기

필요한 것: Node.js 20 이상, Git

```bash
git clone https://github.com/jubin-son/jaber-payslip-project.git
cd jaber-payslip-project
npm install
cp .env.example .env.local   # ANTHROPIC_API_KEY 값 채우기 (AI 기능 쓸 때만)
npm run dev
```

브라우저에서 http://localhost:3000 을 연다.

## 화면

| 경로 | 내용 | 담당 |
|---|---|---|
| `/upload` | 급여대장 업로드 | 주빈 |
| `/review` | AI 정리 결과 확인·수정 | 현지 |
| `/payslips` | 직원별 급여명세서 목록 | 현지 |
| `/send` | 발송(알림톡 미리보기) | 현지 |
| `/p/[id]` | 직원이 링크로 여는 모바일 명세서 | 현지 |

## 폴더와 담당

```
src/
  app/upload/         주빈
  app/review/         현지
  app/payslips/       현지
  app/send/           현지
  app/p/[id]/         현지
  lib/parser/         주빈  급여대장 읽기, 검산
  lib/ai/             주빈  Claude API 호출
  types/payroll.ts    같이  데이터 스키마 (PR로 상대 승인 후에만 변경)
  components/ui/      shadcn/ui 컴포넌트
  components/common/  공통 컴포넌트
samples/              화면 개발용 샘플 JSON
```

## 작업 규칙

- `main`에 직접 올리지 않는다. 작업마다 브랜치를 만들고 PR로 상대가 확인한 뒤 merge한다.
- 브랜치 이름: `feat/…`, `fix/…`, `design/…`
- `src/types/payroll.ts`를 바꾸면 노션 스키마 페이지의 변경 기록에도 한 줄 적는다.
- API 키는 `.env.local`에만 둔다. 커밋하지 않는다.
- 노션 작업 보드 카드에 PR 링크를 붙인다.

## 기술 스택

Next.js(App Router, TypeScript) · Tailwind CSS · shadcn/ui · SheetJS · Claude API · Vercel
