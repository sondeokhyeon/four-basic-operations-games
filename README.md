# 사칙연산 놀이터 🐰

저학년 초등학생이 모바일에서 부담 없이 사칙연산을 연습할 수 있는 정적 웹앱입니다.

## 주요 기능
- 더하기 / 빼기 / 곱하기 / 나누기 — **여러 개 섞어서** 풀기 가능
- 첫째·둘째 수의 크기를 **0~10 / 0~100 / 0~1000** 중 따로 선택
- 한 번에 **10~60문제** 선택
- 모든 답을 **자유롭게 수정**한 뒤 한 번에 채점
- **오늘 푼 회차**는 채점 후에도 틀린 문제 입력칸을 다시 고치면 즉시 재채점 (⭐ 마커로 표시)
- 결과는 자동으로 로컬에 저장 (브라우저 localStorage)
- **캘린더**로 날짜별 풀이 기록 한눈에 보기
- 나누기는 **나머지 없는 정수 나눗셈**만 출제

## 로컬에서 실행

빌드 도구가 필요 없습니다.

```bash
# 저장소 루트에서
python3 -m http.server 8000
```

브라우저에서 `http://localhost:8000` 접속.

## GitHub Pages 배포

1. 이 저장소를 main 브랜치에 머지하면 `.github/workflows/deploy.yml`이 자동으로 배포합니다.
2. **최초 1회**: 저장소의 `Settings → Pages → Build and deployment → Source`를 **`GitHub Actions`** 로 변경해 주세요.
3. 배포가 끝나면 `https://<user>.github.io/four-basic-operations-games/` 에서 접속할 수 있습니다.

## 파일 구조
- `index.html` — 단일 페이지 (홈/퀴즈/결과/기록 섹션)
- `styles.css` — 모바일 우선 캐주얼 디자인
- `app.js` — 상태 / 문제 생성 / 채점 / 캘린더 / localStorage
- `.github/workflows/deploy.yml` — GitHub Pages 배포 워크플로
- `.nojekyll` — Jekyll 처리 비활성화
