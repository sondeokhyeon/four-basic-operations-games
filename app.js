// 사칙연산 놀이터 - 단일 페이지 정적 웹앱
(() => {
  'use strict';

  // ===== 상수 / 유틸 =====
  const STORAGE_KEY = 'math-practice-history-v1';
  const SETTINGS_KEY = 'math-practice-settings-v1';
  const HISTORY_LIMIT = 200;
  const OP_LABEL = { '+': '+', '-': '−', '*': '×', '/': '÷' };
  const DEFAULT_SETTINGS = {
    ops: ['+'],
    r1: { min: 0, max: 10 },
    r2: { min: 0, max: 10 },
    count: 10,
    result: { enabled: false, min: 0, max: 100 },
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const pad2 = (n) => String(n).padStart(2, '0');
  const localDateKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const todayKey = () => localDateKey(new Date());
  const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fmtRange = (r) => {
    if (r == null) return '?';
    if (typeof r === 'number') return `0~${r}`;
    return `${r.min}~${r.max}`;
  };

  // 깊은 병합(딱 1단계만): 누락된 키만 기본값으로 채워주는 용도
  function mergeDefaults(target, defaults) {
    const out = { ...defaults, ...target };
    for (const k of Object.keys(defaults)) {
      if (defaults[k] && typeof defaults[k] === 'object' && !Array.isArray(defaults[k])) {
        out[k] = { ...defaults[k], ...(target?.[k] || {}) };
      }
    }
    return out;
  }

  // ===== 상태 =====
  const state = {
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
    problems: [],
    answers: [],
    startedAt: 0,
    currentId: null,
    currentEntry: null,
    cal: { year: 0, month: 0, selectedDate: null }, // month: 0-11
    historyFilterDate: null,
  };

  // ===== Settings persistence =====
  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return null;
      // ops 가 배열 + 1개 이상이어야
      if (!Array.isArray(obj.ops) || obj.ops.length === 0) obj.ops = DEFAULT_SETTINGS.ops.slice();
      return mergeDefaults(obj, DEFAULT_SETTINGS);
    } catch {
      return null;
    }
  }
  function persistSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch {}
  }

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
  // r1, r2: { min, max } 객체. result: { enabled, min, max } (선택)
  function genProblem(ops, r1, r2, result) {
    const op = ops[randInt(0, ops.length - 1)];
    const inResult = (v) => !result.enabled || (v >= result.min && v <= result.max);

    if (op === '+') {
      for (let i = 0; i < 200; i++) {
        const a = randInt(r1.min, r1.max);
        const b = randInt(r2.min, r2.max);
        const ans = a + b;
        if (inResult(ans)) return { a, op, b, answer: ans };
      }
      return null;
    }
    if (op === '*') {
      for (let i = 0; i < 200; i++) {
        const a = randInt(r1.min, r1.max);
        const b = randInt(r2.min, r2.max);
        const ans = a * b;
        if (inResult(ans)) return { a, op, b, answer: ans };
      }
      return null;
    }
    if (op === '-') {
      // a - b >= 0 보장. result 옵션 켜진 경우 추가 제약.
      for (let i = 0; i < 300; i++) {
        const a = randInt(r1.min, r1.max);
        let bLo = r2.min;
        let bHi = Math.min(r2.max, a);            // a - b >= 0
        if (result.enabled) {
          bLo = Math.max(bLo, a - result.max);    // a - b <= result.max  =>  b >= a - result.max
          bHi = Math.min(bHi, a - result.min);    // a - b >= result.min  =>  b <= a - result.min
        }
        if (bLo <= bHi) {
          const b = randInt(bLo, bHi);
          return { a, op, b, answer: a - b };
        }
      }
      return null;
    }
    if (op === '/') {
      // divisor 는 양수만 (0 제외). dividend = divisor * quotient, 정수 결과.
      const dvLo = Math.max(1, r2.min);
      const dvHi = r2.max;
      if (dvHi < dvLo) return null;
      for (let attempt = 0; attempt < 300; attempt++) {
        const divisor = randInt(dvLo, dvHi);
        let qLo = Math.ceil(r1.min / divisor);
        let qHi = Math.floor(r1.max / divisor);
        if (result.enabled) {
          qLo = Math.max(qLo, result.min);
          qHi = Math.min(qHi, result.max);
        }
        if (qLo > qHi) continue;
        const quotient = randInt(qLo, qHi);
        const dividend = divisor * quotient;
        if (dividend >= r1.min && dividend <= r1.max) {
          return { a: dividend, op, b: divisor, answer: quotient };
        }
      }
      return null;
    }
    return null;
  }
  function genProblems(settings) {
    const out = [];
    for (let i = 0; i < settings.count; i++) {
      let p = null;
      // 한 op 가 현재 범위에서 불가능할 수 있으니 몇 번 재시도(다른 op 가 뽑힐 기회)
      for (let attempt = 0; attempt < 8 && !p; attempt++) {
        p = genProblem(settings.ops, settings.r1, settings.r2, settings.result);
      }
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
  function applySettingsToUI() {
    const s = state.settings;
    $$('#opGrid .op-card').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(s.ops.includes(btn.dataset.op)));
    });
    $('#r1Min').value = String(s.r1.min);
    $('#r1Max').value = String(s.r1.max);
    $('#r2Min').value = String(s.r2.min);
    $('#r2Max').value = String(s.r2.max);
    $$('#countRow .chip').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(Number(btn.dataset.c) === s.count));
    });
    $('#resultEnabled').checked = !!s.result.enabled;
    $('#resultRangeRow').hidden = !s.result.enabled;
    $('#resultMin').value = String(s.result.min);
    $('#resultMax').value = String(s.result.max);
  }

  function bindRangeInput(selector, setter) {
    const el = $(selector);
    el.addEventListener('input', () => {
      const v = parseInt(el.value, 10);
      if (Number.isFinite(v)) {
        setter(v);
        persistSettings();
      }
    });
    el.addEventListener('blur', () => {
      // 빈 값/유효하지 않은 값은 0으로 복구
      if (el.value === '' || !Number.isFinite(parseInt(el.value, 10))) {
        el.value = '0';
        setter(0);
        persistSettings();
      }
    });
  }

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
        persistSettings();
      });
    });

    // 범위 직접 입력
    bindRangeInput('#r1Min', (v) => { state.settings.r1.min = v; });
    bindRangeInput('#r1Max', (v) => { state.settings.r1.max = v; });
    bindRangeInput('#r2Min', (v) => { state.settings.r2.min = v; });
    bindRangeInput('#r2Max', (v) => { state.settings.r2.max = v; });
    bindRangeInput('#resultMin', (v) => { state.settings.result.min = v; });
    bindRangeInput('#resultMax', (v) => { state.settings.result.max = v; });

    // 결과값 범위 토글
    $('#resultEnabled').addEventListener('change', (e) => {
      state.settings.result.enabled = e.target.checked;
      $('#resultRangeRow').hidden = !e.target.checked;
      persistSettings();
    });

    // 문제 수 칩
    $$('#countRow .chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.settings.count = Number(btn.dataset.c);
        $$('#countRow .chip').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
        persistSettings();
      });
    });

    $('#startBtn').addEventListener('click', startQuiz);
    $('#goHistoryBtn').addEventListener('click', openHistory);
  }

  function validateSettings(s) {
    if (!Array.isArray(s.ops) || s.ops.length === 0) return '연산을 한 개 이상 골라주세요';
    if (!Number.isFinite(s.r1.min) || !Number.isFinite(s.r1.max) || s.r1.min > s.r1.max) {
      return '첫째 수 범위가 올바르지 않아요 (최소 ≤ 최대)';
    }
    if (!Number.isFinite(s.r2.min) || !Number.isFinite(s.r2.max) || s.r2.min > s.r2.max) {
      return '둘째 수 범위가 올바르지 않아요 (최소 ≤ 최대)';
    }
    if (s.ops.includes('/') && s.r2.max < 1) {
      return '나누기는 둘째 수 최대값이 1 이상이어야 해요';
    }
    if (s.result.enabled) {
      if (!Number.isFinite(s.result.min) || !Number.isFinite(s.result.max) || s.result.min > s.result.max) {
        return '결과값 범위가 올바르지 않아요 (최소 ≤ 최대)';
      }
    }
    return null;
  }

  function startQuiz() {
    const err = validateSettings(state.settings);
    if (err) { toast(err); return; }
    persistSettings();
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
      const userRaw = String(state.answers[i] ?? '').trim();
      const correct = gradeOne(p, userRaw);
      return { ...p, user: userRaw, originalAnswer: userRaw, correct, fixed: false, edited: false };
    });
    const score = graded.filter((g) => g.correct).length;
    const durationSec = Math.max(0, Math.round((Date.now() - state.startedAt) / 1000));
    const entry = {
      id: newId(),
      date: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ops: state.settings.ops.slice(),
      r1: { min: state.settings.r1.min, max: state.settings.r1.max },
      r2: { min: state.settings.r2.min, max: state.settings.r2.max },
      result: state.settings.result.enabled
        ? { min: state.settings.result.min, max: state.settings.result.max }
        : null,
      count: state.settings.count,
      score,
      durationSec,
      regraded: false,
      problems: graded,
    };
    saveResult(entry);
    state.currentId = entry.id;
    state.currentEntry = entry;
    renderResult(entry);
    showScreen('result');
    if (score >= Math.ceil(graded.length * 0.7)) launchConfetti();
  }

  // ===== 결과 화면 =====
  function isTodayEntry(entry) {
    return localDateKey(new Date(entry.date)) === todayKey();
  }

  function renderResult(entry) {
    state.currentEntry = entry;
    const editable = isTodayEntry(entry);
    const canRegrade = editable && !entry.regraded && entry.problems.some((p) => !p.correct && !p.fixed);
    $('#scoreTitle').textContent = `${entry.count}문제 중 ${entry.score}개 맞았어요! 🎉`;
    const fixedCount = entry.problems.filter((p) => p.fixed).length;
    const sub = [
      `걸린 시간 ${Math.floor(entry.durationSec / 60)}분 ${entry.durationSec % 60}초`,
      `${entry.ops.map((o) => OP_LABEL[o]).join(' ')} · ${fmtRange(entry.r1)} & ${fmtRange(entry.r2)}`,
    ];
    if (entry.result) sub.push(`결과 ${fmtRange(entry.result)}`);
    if (fixedCount > 0) sub.push(`⭐ 수정해서 맞춘 ${fixedCount}개`);
    $('#scoreSub').textContent = sub.join(' · ');
    $('#editableNote').hidden = !canRegrade;
    $('#regradeRow').hidden = !canRegrade;

    const list = $('#resultList');
    list.innerHTML = '';
    entry.problems.forEach((p, i) => {
      const li = document.createElement('li');
      // 우선순위: fixed > correct > wrong
      const stateClass = p.fixed ? 'fixed' : (p.correct ? 'correct' : 'wrong');
      const badge = p.fixed ? '⭐' : (p.correct ? '✅' : '❌');
      li.className = 'problem ' + stateClass;
      // "처음 답 / 정답" 칩 노출 규칙: 재채점 후 수정한 문항(맞췄든 못 맞췄든)에만
      // - 처음부터 맞춘 문제: 숨김
      // - 수정해서 맞춘(fixed) 문제: 노출
      // - 수정했지만 여전히 틀린 문제(edited): 노출
      // - 수정 안 한 오답: 숨김
      const showPills = p.fixed || (!p.correct && p.edited === true);
      const original = (p.originalAnswer ?? '');
      const originalShown = (original === '' || original == null) ? '?' : original;
      li.innerHTML = `
        <span class="num">${i + 1}.</span>
        <span class="expr">${p.a} ${OP_LABEL[p.op]} ${p.b} =</span>
        <input type="text" inputmode="numeric" pattern="-?[0-9]*" autocomplete="off" data-i="${i}">
        <span class="badge">${badge}</span>
        <div class="answer-shown" data-pill ${showPills ? '' : 'hidden'}>
          <span class="ans-pill ans-mine"><span class="ans-label">처음 답</span><b>${originalShown}</b></span>
          <span class="ans-pill ans-correct"><span class="ans-label">정답</span><b>${p.answer}</b></span>
        </div>
      `;
      const input = li.querySelector('input');
      input.value = p.user || '';
      // 수정 가능 조건: 오늘 회차 + 재채점 전 + (처음에 틀림 && 아직 수정해서 맞추지 않음)
      const canEdit = editable && !entry.regraded && !p.correct && !p.fixed;
      input.disabled = !canEdit;
      if (!canEdit) input.readOnly = true;
      if (canEdit) {
        input.addEventListener('input', (ev) => onResultInput(entry, i, ev));
      }
      list.appendChild(li);
    });
  }

  // 입력 이벤트: 즉시 채점하지 않고 사용자가 적은 값만 임시 보존(저장은 재채점 시)
  function onResultInput(entry, i, ev) {
    const sanitized = ev.target.value.replace(/[^\d-]/g, '');
    if (sanitized !== ev.target.value) ev.target.value = sanitized;
    entry.problems[i].user = ev.target.value.trim();
  }

  function regradeEntry(entry) {
    if (!entry || entry.regraded) return;
    for (const p of entry.problems) {
      if (p.correct || p.fixed) continue; // 처음 정답/이미 fixed 는 스킵
      const original = String(p.originalAnswer ?? '');
      const current = String(p.user ?? '');
      if (current !== original && current !== '') {
        p.edited = true;
        if (gradeOne(p, current)) {
          p.fixed = true; // correct 는 그대로 false 유지 (최초 점수 보존)
        }
      } else {
        p.edited = false;
      }
    }
    entry.regraded = true;
    entry.updatedAt = new Date().toISOString();
    saveResult(entry);
    const fixedNow = entry.problems.filter((p) => p.fixed).length;
    if (fixedNow > 0) toast(`수정해서 맞춘 문제 ${fixedNow}개! ⭐`);
    renderResult(entry);
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
    const tail = e.result ? ` · 결과 ${fmtRange(e.result)}` : '';
    return `${ops} · ${fmtRange(e.r1)} & ${fmtRange(e.r2)} · ${e.count}문제${tail}`;
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
        state.currentEntry = e;
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
    $('#regradeBtn').addEventListener('click', () => regradeEntry(state.currentEntry));
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
    const saved = loadSettings();
    if (saved) state.settings = saved;
    setupHome();
    applySettingsToUI();
    bindGlobal();
  });
})();
