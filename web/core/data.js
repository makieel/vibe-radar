// data/ 아래 JSON 읽기. 실패하면 예외를 던진다(app.js가 안내 문구를 보여 준다).
async function getJson(url, fetchFn) {
  const res = await fetchFn(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

export function loadIndex(fetchFn = fetch) {
  return getJson('data/index.json', fetchFn);
}

export function loadDay(date, fetchFn = fetch) {
  return getJson(date ? `data/days/${date}.json` : 'data/latest.json', fetchFn);
}
