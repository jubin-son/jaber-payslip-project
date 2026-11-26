-- 직원에게 보낸 급여명세서 (다른 기기에서 링크로 열기용)
-- Supabase 대시보드 > SQL Editor에 붙여 넣고 Run 한 번이면 된다. 여러 번 실행해도 괜찮다.
create table if not exists public.shared_payslips (
  id text primary key,                          -- 링크에 들어가는 추측하기 어려운 주소
  signature text not null,                      -- 어떤 급여대장 파일에서 만든 명세서인지
  employee_id text not null,                    -- 앱 안 직원 id
  payload jsonb not null,                       -- 명세서 한 장을 그리는 데 필요한 값 (본인 확인 뒤에만 내려준다)
  secret_births text[] not null default '{}',   -- 본인 확인용 생년월일 8자리 (브라우저로 내려가지 않는다)
  secret_phone_tails text[] not null default '{}', -- 본인 확인용 휴대폰 뒤 4자리
  failed_attempts int not null default 0,       -- 비밀번호를 틀린 횟수. 너무 많으면 잠근다
  created_at timestamptz not null default now(),
  opened_at timestamptz                         -- 직원이 처음 연 시각
);

-- 브라우저용 공개 키(anon)로는 아무것도 읽고 쓸 수 없게 막는다.
-- 앱 서버(Next.js API)만 비밀 키로 접근한다.
alter table public.shared_payslips enable row level security;
