# 순공타이머 타이포 가이드 (읽기용)

폰트 숫자를 만질 때 **「페이지별로 맞춰 달라」**와 **「전역 규격을 먼저」** 중 어디서 막히지 않도록, 우리 앱 기준으로만 정리한 문서예요.

---

## 이 문서를 언제 보나요

- 디자인 수정 전에 **“역할 이름”부터 말하고 싶을 때** (예: “섹션 머리만 14로” 대신 `--type-section-heading-size` 로).
- 새 화면을 만들거나, Cursor에게 **“토큰만 쓰라”**고 시킬 때 참고표로.

코드 진실 원천은 항상 `app/globals.css` 의 `:root` 와 유틸 클래스(`.ui-type-*`)예요.

---

## 추천하는 작업 순서 (하나만 고르지 않아도 됨)

많이 타는 순서예요.

1. **표로 단계부터 고정**  
   아래 「한눈에 보는 단계표」처럼, “무슨 역할 = 어떤 토큰”만 먼저 한 줄이라도 적어 두기.
2. **홈 화면을 레퍼런스로 맞춤**  
   가장 보는 화면이라 위계 검증하기 좋음. 바꾼 숫자는 **표/토큰**에 바로 반영.
3. **다른 탭은 “같은 역할이면 같은 토큰”만 검사**  
   “홈이랑 똑같이”가 아니라 “같은 **역할**이면 같은 토큰”이면 전체가 자동으로 같이 움직여요.

**피하면 좋은 패턴**: 홈만 `17px` 인라인으로 두고 다른 곳만 클래스로 두기 → 홈 디테일 수정할 때마다 문서 없이 재작업하기 쉬움.

---

## 한눈에 보는 단계표

| 역할 (말하기 좋은 이름) | 언제 쓰나 | 크기 · 굵기(기본값) | 색(토큰) | 코드에서 보통 |
|-------------------------|-----------|---------------------|----------|----------------|
| 설정/앱 타이틀 | 설정 맨 위 큰 제목 | 34px · bold · primary | primary | `--font-size-large-title`, `.settings-page h1.page-title` |
| 시트 상단바 제목 | 멤버십 시트 가운데 제목 | 20px · bold · primary | primary | `--sheet-title-font-size` (= iOS Title 3) |
| 숫자 히어로 | 홈 상단 오늘 합계 큰 숫자 | 56px · bold | primary | `--font-size-display-num` 등 |
| **날짜 네비 한 줄** (홈 가운데) | 오늘·어제·달력 줄 | **17px · bold** · primary | primary | **`--font-size-headline`** (인라인이 많음) |
| 리스트 행 제목 · 본문 | 할 일 이름, 행 레이블 | 17px · regular | 보통 primary | `--type-body-row-title-*`, `--font-size-body` |
| 카드 속 큰 숫자 | 기록 탭 통계 카드 값 | 22px · bold | primary | `--font-size-title2`, `.ui-stat-card-value` |
| 콜아웃 / 플랜 제목 줄 | 멤버십 설명 카드 안 굵은 줄 등 | 16px · bold 위주로 쓰이는 경우 있음 | primary | `--font-size-callout`, 구독 시트 일부 인라인 |
| **섹션 머리** | 「오늘」 위 작은 줄, 설정 `sec-label`, 기록 필터·그래프 축 쪽 같은 축 | **15px · medium** | **secondary** | **`--type-section-heading-*`**, `.ui-type-section-heading` |
| 서브헤드 | 타임블록 힌트 한 줄 등 | 15px · medium | secondary | `--font-size-subhead` 등 |
| 캡션 보조 통일안 | 카드 라벨(총 집중 등), 플랜 서브 라인 등 | **14px · regular** | **aux-desc** | **`--type-caption-aux-*`**, `--color-text-aux-desc` |
| 풋노트 | 짧은 법무·안내 줄 | 13px | 종종 tertiary | `--font-size-footnote` |
| 캡션 | 아주 작은 보조 | 12px | 보통 tertiary | `--font-size-caption` |
| 리스트 줄에서 강조 라벨 | 플랜 카드 이름(월간/연간 등) | 18px · bold · primary | primary | `--list-row-label-size`, `.subscribe-plan-option-title` |

색 이름은 코드에서 **`--color-text-primary` / `secondary` / `tertiary` / `aux-desc`** 로 통일되어 있어요. 다크 모드는 같은 변수명으로 알아서 바뀝니다.

---

## 홈에서 특히 헷갈리는 한 쌍

- **넓은 날짜 바** (좌우 화살표 사이 「오늘」): 보통 **`--font-size-headline`(17px) + bold`** → 시선 최상단.
- **그 아래 목록 블록 머리** (`.home-todo-section-label`의 「오늘」): **`--type-section-heading`(15px) + secondary** → “섹션 구분선” 역할.

둘이 **같은 말이라도 크기가 다르게 잡혀 있는 것은 의도된 위계일 수 있어요.** 나중에 맞추고 싶으면 “역할을 합칠지 / 위계만 유지할지”를 먼저 정하면 됩니다.

---

## 수정할 때 짧은 체크리스트

- [ ] 픽셀을 컴포넌트에 직접 넣지 않고, **가능하면 `:root` 토큰**을 바꿨는지.
- [ ] “섹션 머리”로 보이면 **먼저** `--type-section-heading-*` 를 봤는지.
- [ ] 회색 안내 줄이면 **`tertiary` vs `aux-desc`** 중 어디에 속하는지 한 번만 고름 (`aux-desc` 가 조금 더 읽히게 켜진 색).
- [ ] 새 화면이면 「한눈에 보는 단계표」에 **한 줄 추가**해서 미래의 나에게 남김.

---

## Cursor / 팀에게 붙여 넣기 좋은 한 문장

> 타이포는 `app/globals.css` 의 토큰과 `.ui-type-*` 만 사용하고, 페이지별 픽셀 하드코딩은 줄이세요. 새 텍스트는 위 단계표의 **역할**에 맞는 토큰을 선택하세요.

이 문서만으로 스펙이 전부인 건 아니고, **“말하기·맡기기”용 골격**이에요. 숫자를 바꾼 날에는 표의 해당 행만 함께 고쳐 주면 다음 작업이 훨씬 편해요.
