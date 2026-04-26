// 사칙연산 놀이터 - 단일 페이지 정적 웹앱
(() => {
  'use strict';

  // ===== 상수 / 유틸 =====
  const STORAGE_KEY = 'math-practice-history-v1';
  const HISTORY_LIMIT = 200;
  const OP_LABEL = { '+': '+', '-': '−', '*': '×', '/': '÷' };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const pad2 = (n) => String(n).padStart(2, '0');
  const localDateKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const todayKey = () => localDateKey(new Date());
  const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // ===== 상태 =====
  const state = {
    settings: { ops: ['+'], r1: 10, r2: 10, count: 10 },
    problems: [],
    answers: [],
    startedAt: 0,
    currentId: null,
    cal: { year: 0, month: 0, selectedDate: null }, // month: 0-11
    historyFilterDate: null,
  };

  // ===== localStorage =====
  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  function writeHistory(arr) {
    try {
      const trimmed = arr
        .slice()
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, HISTORY_LIMIT);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (e) {
      console.warn('localStorage write failed', e);
    }
  }
  function saveResult(entry) {
    const list = loadHistory();
    const i = list.findIndex((e) => e.id === entry.id);
    if (i >= 0) list[i] = entry;
    else list.unshift(entry);
    writeHistory(list);
  }
  function clearHistory() {
    localStorage.removeItem(STORAGE_KEY);
  }
  function groupByLocalDate(history) {
    const map = {};
    for (const entry of history) {
      const key = localDateKey(new Date(entry.date));
      (map[key] ||= []).push(entry);
    }
    return map;
  }

  // ===== 문제 생성 =====
  function genProblem(ops, r1max, r2max) {
    const op = ops[randInt(0, ops.length - 1)];
    if (op === '+') {
      const a = randInt(0, r1max);
      const b = randInt(0, r2max);
      return { a, op, b, answer: a + b };
    }
    if (op === '-') {
      // a 는 [0, r1max], b 는 [0, min(r2max, a)] — 항상 0 <= b <= a, b <= r2max
      const a = randInt(0, r1max);
      const b = randInt(0, Math.min(r2max, a));
      return { a, op, b, answer: a - b };
    }
    if (op === '*') {
      const a = randInt(0, r1max);
      const b = randInt(0, r2max);
      return { a, op, b, answer: a * b };
    }
    if (op === '/') {
      // divisor: 1..r2max, quotient: 0..floor(r1max / divisor)
      for (let attempt = 0; attempt < 80; attempt++) {
        const divisor = randInt(1, Math.max(1, r2max));
        const qMax = Math.floor(r1max / divisor);
        if (qMax < 0) continue;
        const quotient = randInt(0, qMax);
        const dividend = divisor * quotient;
        if (dividend <= r1max) {
          return { a: dividend, op, b: divisor, answer: quotient };
        }
      }
      // 비현실적 조합 — 호출 측에서 처리
      return null;
    }
    return null;
  }
  function genProblems(settings) {
    const out = [];
    for (let i = 0; i < settings.count; i++) {
      const p = genProblem(settings.ops, settings.r1, settings.r2);
      if (!p) return null;
      out.push(p);
    }
    return out;
  }

  // ===== 채점 =====
  function gradeOne(problem, userRaw) {
    const trimmed = String(userRaw ?? '').trim();
    if (trimmed === '' || !/^-?\d+$/.test(trimmed)) return false;
    return parseInt(trimmed, 10) === problem.answer;
  }

  // ===== Toast =====
  let toastTimer = null;
  function toast(msg, ms = 1800) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }

  // ===== 화면 전환 =====
  function showScreen(name) {
    document.body.dataset.screen = name;
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  // ===== 홈 화면 =====
  function setupHome() {
    // 연산 다중 선택
    $$('#opGrid .op-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        const op = btn.dataset.op;
        const idx = state.settings.ops.indexOf(op);
        if (idx >= 0) {
          if (state.settings.ops.length === 1) {
            toast('적어도 하나는 골라야 해요!');
            return;
          }
          state.settings.ops.splice(idx, 1);
        } else {
          state.settings.ops.push(op);
        }
        btn.setAttribute('aria-pressed', String(state.settings.ops.includes(op)));
      });
    });

    // 단일 선택 칩 그룹
    function bindSingle(rowSel, dataAttr, fieldKey, parseFn = Number) {
      $$(`${rowSel} .chip`).forEach((btn) => {
        btn.addEventListener('click', () => {
          const v = parseFn(btn.dataset[dataAttr]);
          state.settings[fieldKey] = v;
          $$(`${rowSel} .chip`).forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
        });
      });
    }
    bindSingle('#r1Row', 'r', 'r1');
    bindSingle('#r2Row', 'r', 'r2');
    bindSingle('#countRow', 'c', 'count');

    $('#startBtn').addEventListener('click', startQuiz);
    $('#goHistoryBtn').addEventListener('click', openHistory);
  }

  function startQuiz() {
    if (state.settings.ops.length === 0) {
      toast('연산을 한 개 이상 골라주세요');
      return;
    }
    const problems = genProblems(state.settings);
    if (!problems) {
      toast('이 설정으로 문제를 만들기 어려워요. 범위를 바꿔보세요 🙏');
      return;
    }
    state.problems = problems;
    state.answers = problems.map(() => '');
    state.startedAt = Date.now();
    state.currentId = null;
    renderQuiz();
    showScreen('quiz');
  }

  // ===== 퀴즈 화면 =====
  function renderQuiz() {
    const list = $('#problemList');
    list.innerHTML = '';
    state.problems.forEach((p, i) => {
      const li = document.createElement('li');
      li.className = 'problem';
      li.innerHTML = `
        <span class="num">${i + 1}.</span>
        <span class="expr">${p.a} ${OP_LABEL[p.op]} ${p.b} =</span>
        <input type="text" inputmode="numeric" pattern="-?[0-9]*" autocomplete="off" data-i="${i}" aria-label="${i + 1}번 답">
      `;
      const input = li.querySelector('input');
      input.value = state.answers[i] || '';
      input.addEventListener('input', (ev) => {
        const sanitized = ev.target.value.replace(/[^\d-]/g, '');
        if (sanitized !== ev.target.value) ev.target.value = sanitized;
        state.answers[i] = ev.target.value;
        updateProgress();
      });
      list.appendChild(li);
    });
    updateProgress();
  }
  function updateProgress() {
    const filled = state.answers.filter((v) => String(v).trim() !== '').length;
    const total = state.problems.length;
    $('#progress').textContent = `${filled} / ${total} 답 적음`;
  }

  function submitQuiz() {
    const blanks = state.answers.filter((v) => String(v).trim() === '').length;
    if (blanks > 0) {
      const proceed = confirm(`아직 ${blanks}개 비었어요. 그래도 채점할까요?`);
      if (!proceed) return;
    }
    const graded = state.problems.map((p, i) => {
      const userRaw = state.answers[i] ?? '';
      const correct = gradeOne(p, userRaw);
      return { ...p, user: String(userRaw).trim(), correct, fixed: false };
    });
    const score = graded.filter((g) => g.correct).length;
    const durationSec = Math.max(0, Math.round((Date.now() - state.startedAt) / 1000));
    const entry = {
      id: newId(),
      date: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ops: state.settings.ops.slice(),
      r1: state.settings.r1,
      r2: state.settings.r2,
      count: state.settings.count,
      score,
      durationSec,
      problems: graded,
    };
    saveResult(entry);
    state.currentId = entry.id;
    renderResult(entry);
    showScreen('result');
    if (score >= Math.ceil(graded.length * 0.7)) launchConfetti();
  }

  // ===== 결과 화면 =====
  function isTodayEntry(entry) {
    return localDateKey(new Date(entry.date)) === todayKey();
  }

  function renderResult(entry) {
    const editable = isTodayEntry(entry);
    $('#scoreTitle').textContent = `${entry.count}문제 중 ${entry.score}개 맞았어요! 🎉`;
    const fixedCount = entry.problems.filter((p) => p.fixed).length;
    const sub = [
      `걸린 시간 ${Math.floor(entry.durationSec / 60)}분 ${entry.durationSec % 60}초`,
      `${entry.ops.map((o) => OP_LABEL[o]).join(' ')} · 0~${entry.r1} ${entry.ops.length === 1 ? OP_LABEL[entry.ops[0]] : '·'} 0~${entry.r2}`,
    ];
    if (fixedCount > 0) sub.push(`⭐ 고친 정답 ${fixedCount}개`);
    $('#scoreSub').textContent = sub.join(' · ');
    $('#editableNote').hidden = !editable;

    const list = $('#resultList');
    list.innerHTML = '';
    entry.problems.forEach((p, i) => {
      const li = document.createElement('li');
      li.className = 'problem ' + (p.correct ? (p.fixed ? 'fixed' : 'correct') : 'wrong');
      const badge = p.correct ? (p.fixed ? '⭐' : '✅') : '🐤';
      const userShown = (p.user === '' || p.user == null) ? '?' : p.user;
      const showAnswer = !p.correct
        ? `<span class="answer-shown">내 답: <b>${userShown}</b> · 정답: <b>${p.answer}</b></span>`
        : '';
      li.innerHTML = `
        <span class="num">${i + 1}.</span>
        <span class="expr">${p.a} ${OP_LABEL[p.op]} ${p.b} =</span>
        <input type="text" inputmode="numeric" pattern="-?[0-9]*" autocomplete="off" data-i="${i}">
        <span class="badge">${badge}</span>
        ${showAnswer}
      `;
      const input = li.querySelector('input');
      input.value = p.user || '';
      // 수정 가능 조건: 오늘 회차 + 오답
      const canEdit = editable && !p.correct;
      input.disabled = !canEdit;
      if (p.correct) input.readOnly = true;
      if (canEdit) {
        input.addEventListener('input', (ev) => onResultInput(entry, i, ev));
      }
      list.appendChild(li);
    });
  }

  function onResultInput(entry, i, ev) {
    const sanitized = ev.target.value.replace(/[^\d-]/g, '');
    if (sanitized !== ev.target.value) ev.target.value = sanitized;
    const raw = ev.target.value;
    entry.problems[i].user = raw.trim();
    if (gradeOne(entry.problems[i], raw)) {
      entry.problems[i].correct = true;
      entry.problems[i].fixed = true;
      entry.score = entry.problems.filter((p) => p.correct).length;
      entry.updatedAt = new Date().toISOString();
      saveResult(entry);
      renderResult(entry); // 카드 색상/배지 갱신, 수정한 입력은 잠김
      // 포커스를 다음 오답으로 이동
      const next = entry.problems.findIndex((p, idx) => idx > i && !p.correct);
      if (next >= 0) {
        const sel = $(`#resultList li:nth-child(${next + 1}) input`);
        if (sel && !sel.disabled) sel.focus();
      }
    } else {
      // 즉시 저장 (오답 유지 상태로 user 갱신)
      entry.updatedAt = new Date().toISOString();
      saveResult(entry);
    }
  }

  // ===== Confetti =====
  function launchConfetti() {
    const root = $('#confetti');
    root.innerHTML = '';
    const colors = ['#7ED9C8', '#FFB59E', '#C8B6FF', '#FFE08A', '#FF8A5C', '#4FC38A'];
    const N = 60;
    for (let i = 0; i < N; i++) {
      const piece = document.createElement('i');
      piece.style.left = Math.random() * 100 + 'vw';
      piece.style.background = colors[i % colors.length];
      piece.style.animationDuration = 2 + Math.random() * 2 + 's';
      piece.style.animationDelay = Math.random() * 0.6 + 's';
      piece.style.transform = `translateY(-20px) rotate(${Math.random() * 360}deg)`;
      root.appendChild(piece);
    }
    setTimeout(() => { root.innerHTML = ''; }, 4500);
  }

  // ===== 기록 / 캘린더 =====
  function openHistory() {
    const now = new Date();
    state.cal.year = now.getFullYear();
    state.cal.month = now.getMonth();
    state.cal.selectedDate = null;
    state.historyFilterDate = null;
    renderHistory();
    showScreen('history');
  }

  function renderHistory() {
    const history = loadHistory();
    const map = groupByLocalDate(history);
    renderCalendar(state.cal.year, state.cal.month, map);
    renderHistoryList(history);
  }

  function renderCalendar(year, month, mapByDate) {
    $('#calTitle').textContent = `${year}.${pad2(month + 1)}`;
    const grid = $('#calGrid');
    grid.innerHTML = '';
    const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = todayKey();
    for (let i = 0; i < firstDow; i++) {
      const empty = document.createElement('div');
      empty.className = 'cal-cell empty';
      grid.appendChild(empty);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const cell = document.createElement('div');
      const key = `${year}-${pad2(month + 1)}-${pad2(day)}`;
      const entries = mapByDate[key] || [];
      const cnt = entries.length;
      cell.className = 'cal-cell';
      if (cnt >= 3) cell.classList.add('has-3');
      else if (cnt === 2) cell.classList.add('has-2');
      else if (cnt === 1) cell.classList.add('has-1');
      if (key === today) cell.classList.add('today');
      if (key === state.cal.selectedDate) cell.classList.add('selected');
      cell.textContent = day;
      if (cnt > 0) {
        const mark = document.createElement('span');
        mark.className = 'count-mark';
        mark.textContent = cnt > 9 ? '9+' : String(cnt);
        cell.appendChild(mark);
        cell.addEventListener('click', () => {
          if (state.historyFilterDate === key) {
            state.historyFilterDate = null;
            state.cal.selectedDate = null;
          } else {
            state.historyFilterDate = key;
            state.cal.selectedDate = key;
          }
          renderHistory();
        });
      } else {
        cell.style.cursor = 'default';
      }
      grid.appendChild(cell);
    }
  }

  function fmtDateLabel(iso) {
    const d = new Date(iso);
    return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  function summarizeEntry(e) {
    const ops = e.ops.map((o) => OP_LABEL[o]).join('');
    return `${ops} · 0~${e.r1} & 0~${e.r2} · ${e.count}문제`;
  }

  function renderHistoryList(history) {
    const ul = $('#historyList');
    const empty = $('#historyEmpty');
    const label = $('#histFilterLabel');
    const clearBtn = $('#histClearFilter');
    ul.innerHTML = '';

    let list = history.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    if (state.historyFilterDate) {
      list = list.filter((e) => localDateKey(new Date(e.date)) === state.historyFilterDate);
      label.textContent = `${state.historyFilterDate} 회차 (${list.length})`;
      clearBtn.hidden = false;
    } else {
      label.textContent = `전체 회차 (${history.length})`;
      clearBtn.hidden = true;
    }

    if (list.length === 0) {
      empty.hidden = false;
      empty.textContent = state.historyFilterDate
        ? '이 날에는 푼 문제가 없어요.'
        : '아직 기록이 없어요. 한 회차 풀어볼까요? 🐤';
    } else {
      empty.hidden = true;
    }

    list.forEach((e) => {
      const li = document.createElement('li');
      const fixedTag = e.problems.some((p) => p.fixed) ? ' ⭐' : '';
      li.innerHTML = `
        <div class="hist-meta">
          <div class="hist-date">${fmtDateLabel(e.date)}${fixedTag}</div>
          <div class="hist-summary">${summarizeEntry(e)}</div>
        </div>
        <div class="hist-score">${e.score}<small>/${e.count}</small></div>
      `;
      li.addEventListener('click', () => {
        state.currentId = e.id;
        renderResult(e);
        showScreen('result');
      });
      ul.appendChild(li);
    });
  }

  // ===== 이벤트 바인딩 =====
  function bindGlobal() {
    $('#submitBtn').addEventListener('click', submitQuiz);
    $('#submitBtn2').addEventListener('click', submitQuiz);
    $('#quizBackBtn').addEventListener('click', () => {
      if (confirm('퀴즈를 그만둘까요? 입력한 답이 사라져요.')) showScreen('home');
    });
    $('#retryBtn').addEventListener('click', startQuiz);
    $('#resultHomeBtn').addEventListener('click', () => showScreen('home'));
    $('#resultHistoryBtn').addEventListener('click', openHistory);
    $('#historyBackBtn').addEventListener('click', () => showScreen('home'));
    $('#clearHistoryBtn').addEventListener('click', () => {
      if (!confirm('정말로 모든 기록을 지울까요?')) return;
      clearHistory();
      state.historyFilterDate = null;
      state.cal.selectedDate = null;
      renderHistory();
      toast('기록을 모두 지웠어요');
    });
    $('#calPrev').addEventListener('click', () => {
      if (--state.cal.month < 0) { state.cal.month = 11; state.cal.year--; }
      renderHistory();
    });
    $('#calNext').addEventListener('click', () => {
      if (++state.cal.month > 11) { state.cal.month = 0; state.cal.year++; }
      renderHistory();
    });
    $('#calToday').addEventListener('click', () => {
      const now = new Date();
      state.cal.year = now.getFullYear();
      state.cal.month = now.getMonth();
      renderHistory();
    });
    $('#histClearFilter').addEventListener('click', () => {
      state.historyFilterDate = null;
      state.cal.selectedDate = null;
      renderHistory();
    });
  }

  // ===== Init =====
  document.addEventListener('DOMContentLoaded', () => {
    setupHome();
    bindGlobal();
  });
})();
