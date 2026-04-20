# 노크 순공타이머 ⏱️

> 집중한 시간이 쌓이는 곳 — Notion 연동 순공시간 측정 앱

## 기능

- 📋 **홈 탭** — 오늘 To-do 목록, 실시간 타이머 (앱 꺼도 유지), 집중시간 합산
- 📊 **Log 탭** — 일간/주간/월간/연간 집중시간 그래프, 타임블록 플래너 보기
- ⚙️ **설정 탭** — 노션 연결 관리, DB 속성명 커스텀, 언어 설정
- 🌍 **다국어** — 한국어 / 영어 (시스템 언어 자동)
- 🌙 **다크모드** — 시스템 설정 자동 반영
- 📱 **iOS 네이티브 느낌** — 바텀 시트, FAB, 탭 바

## Notion DB 구조

### To-do DB
| 속성명 | 타입 | 설명 |
|--------|------|------|
| 이름 | 제목 | 할 일 제목 |
| 날짜 | 날짜 | 예정일 |
| 완료 | 체크박스 | 완료 여부 |
| 누적(분) | 숫자 | ← 앱이 업데이트하는 필드 |
| 데일리 리포트 | 관계형 | Daily Report DB 연결 |

### Daily Report DB
| 속성명 | 타입 | 설명 |
|--------|------|------|
| 날짜 | 날짜 (제목) | 날짜 식별자 |
| 한줄리뷰 | 텍스트 | 피드백 저장 |
| To-do List | 관계형 | To-do DB 연결 |
| 오늘 순공시간(분) | 숫자 | 하루 총 집중시간 |

## 빠른 시작

### 1. 저장소 클론
```bash
git clone https://github.com/your-username/nock-study-timer.git
cd nock-study-timer
npm install
npm run dev
```

### 2. Notion Integration 생성
1. https://www.notion.so/my-integrations 접속
2. **새 인테그레이션** 생성 → Internal
3. **Integration Token** 복사 (`secret_xxx...`)
4. 사용할 DB에 인테그레이션 **연결** (DB 우측 상단 `...` → 연결)

### 3. 앱 설정
앱 첫 실행 → 온보딩 화면에서:
1. Integration Token 입력
2. To-do DB, Daily Report DB 선택
3. 속성명 확인/수정

## Vercel 배포

```bash
# Vercel CLI
npm i -g vercel
vercel --prod
```

또는 GitHub 저장소를 Vercel에 연결하면 자동 배포됩니다.

## 기술 스택

- **Next.js 14** App Router
- **Notion API** (Integration Token 방식)
- **localStorage** — 타이머 상태, 자격증명, 설정 저장
- **Vercel** 배포
- 서버사이드 의존성 없음 (API Key는 클라이언트 헤더로만 전달)

## localStorage 키

| 키 | 내용 |
|----|------|
| `nock_study_creds` | `{ token, dbTodo, dbReport }` |
| `nock_study_settings` | `{ lang, todoFields, reportFields }` |
| `nock_timer_state` | `{ todoId, startedAt, baseAccum }` |
| `nock_session_log` | 오늘의 세션 기록 (플래너용) |

## 프로젝트 구조

```
nock-study-timer/
├── app/
│   ├── api/
│   │   ├── databases/          # DB 목록 & 속성 조회
│   │   ├── todos/              # To-do CRUD
│   │   ├── reports/            # Daily Report 조회/수정
│   │   └── log/                # 기간별 기록 조회
│   ├── lib/
│   │   ├── credentials.js      # 헤더에서 자격증명 추출
│   │   ├── fields.js           # 속성명 기본값/헤더 빌더
│   │   ├── i18n.js             # 한국어/영어 번역
│   │   └── notion.js           # Notion 클라이언트 헬퍼
│   ├── globals.css             # iOS 스타일 디자인 시스템
│   ├── layout.js
│   └── page.js
├── components/
│   ├── App.js                  # 루트 앱, 상태 관리
│   ├── Onboarding.js           # 온보딩 플로우
│   ├── HomeTab.js              # 홈 (타이머)
│   ├── LogTab.js               # 기록 (그래프/플래너)
│   ├── SettingsTab.js          # 설정
│   ├── AddTodoSheet.js         # 할 일 추가 시트
│   ├── FeedbackSheet.js        # 피드백 입력 시트
│   └── lib/
│       ├── apiClient.js        # API 요청 헬퍼
│       └── useTimer.js         # 타이머 훅 (localStorage 기반)
└── vercel.json
```

## 로드맵

- [ ] Log 플래너 보기 고도화 (타임블록 시각화)
- [ ] 피드백에 사진/카메라 첨부
- [ ] 위젯 지원 (PWA)
- [ ] 목표(Goal) 연동
