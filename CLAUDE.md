# 프로젝트 개요

- **앱 이름**: 노크 순공타이머 (Nock Study Timer)
- **플랫폼**: 웹 PWA + iOS 네이티브 (Capacitor)
- **기술 스택**:
  - Next.js 14.2.5 (App Router)
  - React 18
  - Capacitor 8 (iOS WKWebView 래핑)
  - Notion API (`@notionhq/client`) — 사용자 데이터 소스
  - Supabase — 구독/결제 상태 저장
  - PortOne (`@portone/browser-sdk`) — 웹 카드 빌링키 결제
  - Apple IAP — iOS 인앱 결제 (NockIAP Swift 플러그인)
  - Framer Motion — 바텀시트/애니메이션
  - Recharts — 통계 차트

---

# 파일 구조

```
.
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── callback/route.js
│   │   │   ├── ios-session/route.js
│   │   │   ├── logout/route.js
│   │   │   ├── notion/route.js
│   │   │   └── session/route.js
│   │   ├── cron/
│   │   │   └── billing/route.js
│   │   ├── databases/
│   │   │   ├── [id]/properties/route.js
│   │   │   ├── properties/route.js
│   │   │   ├── route.js
│   │   │   └── status-options/route.js
│   │   ├── goals/route.js
│   │   ├── log/route.js
│   │   ├── payments/
│   │   │   ├── apple-iap/
│   │   │   │   ├── verify/route.js
│   │   │   │   └── webhook/route.js
│   │   │   └── portone/
│   │   │       ├── billing-auth/route.js
│   │   │       ├── billing-auth-callback/route.js
│   │   │       ├── cancel/route.js
│   │   │       └── webhook/route.js
│   │   ├── reports/
│   │   │   ├── [id]/route.js
│   │   │   └── route.js
│   │   ├── subscription/route.js
│   │   ├── test/route.js
│   │   └── todos/
│   │       ├── [id]/route.js
│   │       └── route.js
│   ├── lib/
│   │   ├── basePath.js
│   │   ├── credentials.js
│   │   ├── credsMode.js
│   │   ├── dateUtils.js
│   │   ├── dayWindow.js
│   │   ├── featureFlags.js
│   │   ├── fetchWithTimeout.js
│   │   ├── fields.js
│   │   ├── getUserKey.js
│   │   ├── hasNotionAuth.js
│   │   ├── i18n.js
│   │   ├── localCustomerKey.js
│   │   ├── localTodosStore.js
│   │   ├── mergeDatabases.js
│   │   ├── notion-oauth-redirect.js
│   │   ├── notion-session.js
│   │   ├── notion.js
│   │   ├── notionDbListPoll.js
│   │   ├── notionFieldExpectations.js
│   │   ├── notionGoalDb.js
│   │   ├── portone.js
│   │   ├── supabase.js
│   │   ├── supportEmail.js
│   │   ├── timeblockRelation.js
│   │   ├── timelineLayout.js
│   │   ├── todoAccum.js
│   │   └── todoReportLink.js
│   ├── billing-result/page.js
│   ├── ios-auth/page.js
│   ├── error.js
│   ├── globals.css
│   ├── layout.js
│   └── page.js
├── components/
│   ├── lib/
│   │   ├── apiClient.js
│   │   ├── haptics.js
│   │   ├── nativeForm.js
│   │   ├── notionLoadErrors.js
│   │   ├── payment.js
│   │   ├── sheetFieldScroll.js
│   │   ├── sheetMotion.js
│   │   ├── useKeyboardAware.js
│   │   └── useTimer.js
│   ├── ActionPopover.js
│   ├── AddTodoSheet.js
│   ├── App.js
│   ├── ChromeBottomSheet.js
│   ├── DayWindowDropdown.js
│   ├── DbPicker.js
│   ├── FeedbackSheet.js
│   ├── FullscreenModal.js
│   ├── GoalStatusPickerBlock.js
│   ├── HomeTab.js
│   ├── HomeTopDatePopover.js
│   ├── HourWheelPicker.js
│   ├── InlineDropdown.js
│   ├── LogTab.js
│   ├── NockPopover.js
│   ├── NotionFieldMapRow.js
│   ├── NotionLoadingOverlay.js
│   ├── NotionMark.js
│   ├── NotionPropertyTypeIcon.js
│   ├── Onboarding.js
│   ├── PopupDialog.js
│   ├── SettingsOptionSheet.js
│   ├── SettingsTab.js
│   ├── StatsPeriodSheet.js
│   ├── SubscribeSheet.js
│   ├── TimeBlockIslandIcon.js
│   ├── TimetableTaskPickPopover.js
│   ├── TimeWheelPicker.js
│   └── WelcomeSheet.js
├── docs/
│   ├── migrations/
│   │   └── add_trial_started_at.sql
│   ├── PRODUCT-SPEC.md
│   └── TYPOGRAPHY-GUIDE.md
├── ios/                          # Capacitor iOS 네이티브 프로젝트
│   └── App/App/
│       ├── AppDelegate.swift
│       └── NockIAPPlugin.swift
├── .github/workflows/
│   └── billing-cron.yml
└── capacitor.config.ts
```

---

# 주요 파일 역할

| 파일 | 역할 |
|------|------|
| `app/layout.js` | 루트 레이아웃. viewport 설정(`viewportFit: cover`, `maximumScale: 1`), 화면 깜빡임 방지 인라인 CSS |
| `app/globals.css` | 전역 스타일. `--app-shell-height-px`, `--TAB-H`, `safe-area-inset-*` 등 레이아웃 CSS 변수 집중 관리 |
| `app/page.js` | 진입점. `<App />` 렌더링 |
| `components/App.js` | 탭 전환(`timer / timetable / log / settings`), 하단 네비게이션 바, `--app-shell-height-px` 동적 계산 |
| `components/HomeTab.js` | 타이머 + 타임블록 탭 UI |
| `components/LogTab.js` | 학습 기록/통계 탭 |
| `components/SettingsTab.js` | 설정 탭 (Notion 연동, 구독 관리 등) |
| `components/SubscribeSheet.js` | 멤버십 바텀시트. 결제/취소/상태 표시 |
| `components/Onboarding.js` | 최초 온보딩 흐름 (Notion 연동, DB 선택) |
| `components/lib/payment.js` | PortOne 빌링키 발급 / Apple IAP 결제 클라이언트 로직 |
| `components/lib/useKeyboardAware.js` | `visualViewport` 기반 키보드 높이 추적 훅 |
| `components/lib/useTimer.js` | 타이머 상태 관리 훅 |
| `components/lib/apiClient.js` | API URL 해석 (`resolveApiUrl`) |
| `app/lib/notion.js` | Notion API 서버사이드 호출 래퍼 |
| `app/lib/notion-session.js` | 세션 쿠키에서 Notion 인증 정보 추출 |
| `app/lib/portone.js` | PortOne 서버사이드 유틸 (결제 요청 body 빌더, 결제 확인) |
| `app/lib/supabase.js` | Supabase Admin 클라이언트 생성 |
| `app/lib/featureFlags.js` | 기능 플래그 관리 |
| `app/lib/getUserKey.js` | customerKey 계산 (`nock-{workspace_id}`) |
| `app/api/subscription/route.js` | 구독 상태 조회 API |
| `app/api/payments/portone/billing-auth/route.js` | PC 팝업 빌링키 발급 후 즉시 결제 처리 |
| `app/api/payments/portone/billing-auth-callback/route.js` | 모바일 리다이렉트 후 결제 처리 |
| `app/api/payments/portone/cancel/route.js` | 구독 취소 (`status → cancelled`, `next_charge_at` 유지) |
| `app/api/payments/apple-iap/verify/route.js` | Apple IAP 영수증 서버 검증 |
| `app/api/cron/billing/route.js` | Vercel Cron 자동 결제 갱신 (매일 1회) |
| `ios/App/App/NockIAPPlugin.swift` | iOS 네이티브 IAP Capacitor 플러그인 |

---

# 개발 원칙

- **Notion API는 서버사이드에서만 호출** — 클라이언트에서 직접 Notion API를 호출하지 않는다. 반드시 `app/api/` 라우트를 경유한다.
- **Edge Runtime 사용** — API 라우트에 `export const runtime = 'edge'`를 명시한다.
- **외부 API 호출은 캐싱 레이어 경유** — `fetch` 직접 호출 시 `cache: 'no-store'` 또는 적절한 revalidate 옵션을 명시한다.
- **HTTP 헤더에 한글 사용 금지** — 헤더 값에 한글이 포함될 경우 반드시 `encodeURIComponent`로 인코딩한다.
- **Notion relation 필드는 페이지 생성 후 별도로 연결** — Notion API 제약으로 인해 페이지 생성(create) 시 relation을 함께 설정할 수 없다. 생성 완료 후 별도 update 호출로 relation을 연결한다.
