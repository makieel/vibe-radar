// 얇은 DOM 연결부: 설정 → 테마 로드 → 데이터 로드 → 그리기. 로직은 다른 모듈에 있다.
import config from '../site.config.js';
import { createModeController } from './mode.js';
import { parseRoute, toHash } from './router.js';
import { loadIndex, loadDay } from './data.js';
import * as fmt from './format.js';

const app = document.getElementById('app');
const root = document.documentElement;

function safeStorage() {
  try { return window.localStorage; } catch { return null; }
}

const modeCtl = createModeController({
  root,
  storage: safeStorage(),
  prefersDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
});

const state = { theme: null, index: null, route: null, notice: null, report: null };
const cache = new Map();

function showMessage(text) {
  app.innerHTML = `<p role="alert" style="padding:24px;font:16px system-ui,sans-serif">${fmt.esc(text)}</p>`;
}

async function loadTheme(name) {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`잘못된 테마 이름: ${name}`);
  const mod = await import(`../themes/${name}/render.js`);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `themes/${name}/theme.css`;
  document.head.append(link);
  return mod.default;
}

function paint() {
  const { theme, index, route, notice, report } = state;
  app.innerHTML = theme.render({ report, index, route, mode: modeCtl.get(), notice, fmt });
}

async function show() {
  const { route, notice } = parseRoute(location.hash, state.index.dates);
  state.route = route;
  state.notice = notice;
  try {
    const key = route.date ?? 'latest';
    if (!cache.has(key)) cache.set(key, await loadDay(route.date));
    state.report = cache.get(key);
  } catch {
    showMessage('데이터를 불러오지 못했어요');
    return;
  }
  paint();
}

function navigate(route) {
  const h = toHash(route);
  if (location.hash === h) show();
  else location.hash = h;
}

app.addEventListener('click', (e) => {
  const el = e.target instanceof Element ? e.target.closest('[data-action="toggle-mode"]') : null;
  if (!el) return;
  modeCtl.toggle();
  if (state.report) paint();
});

app.addEventListener('change', (e) => {
  const el = e.target instanceof Element ? e.target.closest('select[data-date-select]') : null;
  if (!el || !state.route) return;
  const date = el.value === state.index.latest ? null : el.value;
  navigate({ ...state.route, date });
});

async function start() {
  try {
    state.theme = await loadTheme(config.theme);
  } catch {
    showMessage(`테마 '${config.theme}'를 불러오지 못했어요`);
    return;
  }
  try {
    state.index = await loadIndex();
  } catch {
    showMessage('데이터를 불러오지 못했어요');
    return;
  }
  if (!state.index.latest) {
    showMessage('아직 수집된 데이터가 없어요');
    return;
  }
  window.addEventListener('hashchange', show);
  await show();
}

start();
