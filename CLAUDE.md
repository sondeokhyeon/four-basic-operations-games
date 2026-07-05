# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 개요

저학년 초등학생용 사칙연산 연습 정적 웹앱. **빌드 도구·프레임워크·의존성·테스트 없음.** `index.html` + `styles.css` + `app.js` 세 파일이 전부이며, 브라우저에서 바로 실행된다. 모든 UI 텍스트는 한국어.

## 개발 명령어

```bash
# 로컬 실행 (저장소 루트에서)
python3 -m http.server 8000   # http://localhost:8000
```

- **배포**: `main` 브랜치에 push 하면 `.github/workflows/deploy.yml`이 저장소 루트 전체를 GitHub Pages로 배포한다. 빌드 단계 없이 정적 파일을 그대로 올림.
- 린트·테스트·번들러 없음. 변경 검증은 브라우저에서 직접 확인.

## 아키텍처

### 화면 전환 (SPA, 라우터 없음)
`index.html`에 4개 `<section class="screen">`(`home`/`quiz`/`result`/`history`)이 모두 존재하고, `showScreen(name)`이 `document.body.dataset.screen`을 바꾸면 CSS가 해당 섹션만 보여준다. URL·history API 사용 안 함.

### 전역 상태
`app.js`의 IIFE 안 단일 `state` 객체가 진실의 원천(settings, problems, answers, currentEntry, 캘린더 상태, 기록 필터). 함수들이 이 객체를 직접 읽고 변형한 뒤 렌더 함수를 호출하는 명령형 스타일.

### localStorage (2개 키, 스키마 버전 포함)
- `math-practice-settings-v1` — 홈 화면 설정. 입력할 때마다 `persistSettings()`로 즉시 저장. 로드 시 `mergeDefaults()`로 누락 키를 기본값 보강(1단계 깊이 병합).
- `math-practice-history-v1` — 풀이 기록 배열. `writeHistory()`가 날짜 내림차순 정렬 후 최근 `HISTORY_LIMIT`(200)개만 유지.

### 문제 생성 (`genProblem` / `genProblems`)
핵심 제약을 **거부 샘플링(rejection sampling)**으로 만족시킨다 — 랜덤 생성 후 조건 통과할 때까지 최대 N회 반복, 실패 시 `null`.
- 뺄셈: 결과 `a - b >= 0` 보장.
- 나눗셈: 나머지 없는 정수 나눗셈만. `dividend = divisor × quotient` 방식으로 역산해 생성(divisor는 1 이상).
- 선택적 "결과값 범위" 옵션이 켜지면 답이 범위 안에 들도록 추가 제약.
- `genProblems`는 3단계 폴백으로 문제 중복을 회피: (1) 미사용 && 직전과 다름 → (2) 직전과만 다름 → (3) 아무거나. 설정이 극단적이면(가능한 조합이 매우 적으면) `null`을 반환할 수 있고, 호출부는 이때 사용자에게 안내한다.

### 채점 & "오늘 회차 재채점" 규칙 (가장 미묘한 부분)
- 최초 채점: 각 문제에 `{ correct, user, originalAnswer, fixed, edited }` 필드 부여. `score`는 최초 정답 수로 **고정**.
- **오늘 푼 회차에 한해** 틀린 문제 입력칸을 다시 고쳐 `regradeEntry()`로 1회 재채점 가능. 이때:
  - `score`(최초 점수)는 절대 바뀌지 않는다.
  - 고쳐서 맞춘 문제는 `correct=false`를 유지한 채 `fixed=true`로 표시(⭐).
  - `entry.regraded`가 true가 되면 재채점 불가(1회 제한).
- 결과 화면의 "처음 답 / 정답" 칩 노출 규칙과 입력칸 활성화 조건은 `renderResult()` 안 주석에 명시된 상태 우선순위(`fixed > correct > wrong`)를 따른다. 이 로직 수정 시 주석의 규칙표를 먼저 확인할 것.

### 기록 & 캘린더
`groupByLocalDate()`로 기록을 로컬 날짜별로 묶어 월간 캘린더 셀에 회차 수(1/2/3+ 단계 색상)를 표시. 날짜 셀 클릭 → `historyFilterDate`로 목록 필터 토글.

## 주의사항

- **날짜는 항상 로컬 타임존 기준.** `localDateKey()`(YYYY-MM-DD)를 캘린더·그룹핑의 키로 쓴다. UTC ISO 문자열(`entry.date`)과 혼동 금지 — 저장은 ISO, 그룹핑/비교는 `localDateKey()`.
- **정적 자산 캐시 무력화**: `index.html`이 `styles.css?v=N`, `app.js?v=N`로 참조한다. CSS/JS를 의미 있게 바꾸면 두 곳의 `?v=` 값을 함께 올려야 브라우저가 새 파일을 받는다(커밋 히스토리 참고: `?v=3`, `?v=5` 등).
- 숫자 입력은 정수만 허용(`/^-?\d+$/`), 입력 중 비허용 문자는 실시간 sanitize.
- 사용자 확인이 필요한 곳은 `confirm()`(퀴즈 중단, 빈칸 채점, 기록 삭제)을 쓴다.
