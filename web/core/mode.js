// 라이트/다크 모드. 저장소가 막혀 있어도 동작해야 한다.
export const MODE_KEY = 'vr-mode';

export function initialMode(storage, prefersDark) {
  try {
    const v = storage?.getItem(MODE_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    // 저장소 접근 불가: 시스템 설정을 따른다.
  }
  return prefersDark ? 'dark' : 'light';
}

export function createModeController({ root, storage, prefersDark }) {
  let mode = initialMode(storage, prefersDark);
  root.dataset.mode = mode;
  return {
    get: () => mode,
    toggle() {
      mode = mode === 'dark' ? 'light' : 'dark';
      root.dataset.mode = mode;
      try {
        storage?.setItem(MODE_KEY, mode);
      } catch {
        // 저장 실패는 무시한다.
      }
      return mode;
    },
  };
}
