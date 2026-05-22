# LinkVault 랜딩 페이지 — 배포 가이드

이 폴더에는 배포에 필요한 모든 파일이 들어 있습니다.

```
index.html          ← 랜딩 페이지 (LinkVault 브랜드 + Supabase 연동)
supabase_setup.sql   ← Supabase 테이블 생성 SQL
vercel.json          ← Vercel 배포 설정
README.md            ← 이 문서
```

배포는 보안상 직접 진행하셔야 합니다(계정/자격 증명이 필요한 작업). 아래 순서를 그대로 따라 하시면 약 15분이면 완료됩니다.

---

## 1단계 — Supabase 프로젝트 만들기 (약 5분)

1. https://supabase.com 접속 → 본인 계정으로 로그인 → **New project** 생성
2. 프로젝트가 만들어지면 좌측 메뉴 **SQL Editor** 클릭
3. `supabase_setup.sql` 파일 내용을 전부 복사해 붙여넣고 **RUN**
   - `waitlist` 테이블이 생성되고, 익명 사용자가 등록만 가능하도록 보안 정책이 적용됩니다
4. 좌측 메뉴 **Project Settings → API** 로 이동해 두 값을 복사해 둡니다
   - **Project URL** (예: `https://abcdxyz.supabase.co`)
   - **anon public** 키 (브라우저에 노출되어도 안전한 공개 키입니다)

> ⚠️ `service_role` 키는 절대 복사하지 마세요. 프론트엔드에 넣으면 안 됩니다.

---

## 2단계 — index.html에 키 넣기 (약 1분)

`index.html` 파일을 열고, 하단 `<script>` 안의 두 줄을 1단계에서 복사한 값으로 교체합니다.

```javascript
const SUPABASE_URL = 'YOUR_SUPABASE_PROJECT_URL';   // ← Project URL 붙여넣기
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'; // ← anon public 키 붙여넣기
```

저장합니다. (키를 안 넣어도 페이지는 "데모 모드"로 동작하지만, 이메일이 저장되지 않습니다.)

---

## 3단계 — Vercel로 배포 (약 5분)

### 방법 A — 가장 간단 (드래그앤드롭)

1. https://vercel.com 접속 → 로그인
2. **Add New → Project → Deploy** 화면에서, 이 폴더(`index.html`, `vercel.json` 포함)를 통째로 드래그앤드롭
3. **Deploy** 클릭 → 1분 내 `https://(프로젝트명).vercel.app` 주소가 생성됩니다

### 방법 B — GitHub 연동 (지속 배포 권장)

1. 이 폴더를 GitHub 레포지토리로 푸시
2. Vercel에서 **Add New → Project → Import** 로 해당 레포 선택
3. 별도 빌드 설정 없이 **Deploy** (정적 사이트라 프레임워크 자동 감지)
4. 이후 GitHub에 push할 때마다 자동 재배포됩니다

---

## 4단계 — 동작 확인

1. 배포된 주소 접속
2. 사전 등록 버튼 → 이메일 입력 → 등록
3. Supabase 대시보드 → **Table Editor → waitlist** 에서 방금 등록한 이메일이 들어왔는지 확인

정상적으로 행(row)이 쌓이면 완료입니다.

---

## 자주 묻는 것

**Q. anon 키가 코드에 그대로 보이는데 괜찮나요?**
네. anon 키는 공개를 전제로 설계된 키입니다. 보안은 코드가 아니라 Supabase의 RLS(행 수준 보안) 정책으로 지켜집니다. 우리가 적용한 정책은 익명 사용자에게 "등록(insert)"만 허용하고 조회·수정·삭제는 막아두었기 때문에, 다른 사람의 이메일을 읽거나 데이터를 훼손할 수 없습니다.

**Q. 커스텀 도메인을 연결하고 싶어요.**
Vercel 프로젝트 → Settings → Domains 에서 보유 도메인을 추가하면 됩니다.

**Q. 등록자 수 카운터가 실제 숫자인가요?**
아니요. 현재 카운터는 시각적 연출용 시작값(1,284)에서 +1씩 올라가는 표시일 뿐입니다. 실제 등록 수와 연동하려면 별도 작업이 필요합니다. 원하시면 실제 카운트를 불러오도록 추가해 드릴 수 있습니다.

**Q. 등록자에게 자동으로 환영 메일을 보내고 싶어요.**
Supabase Edge Function + 메일 발송 서비스(Resend 등) 연동이 필요합니다. 별도로 요청해 주시면 구성해 드리겠습니다.
