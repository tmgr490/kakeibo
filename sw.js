/* 家計簿 — Service Worker
 *
 * ▼ ここだけは手で直すこと
 *   index.html を更新したら、下の CACHE の文字列を必ず変える。
 *   変え忘れると、オフライン用に取っておいた古い版が出続ける。
 *   日付を入れておくと、古いかどうかが一目で分かる。
 *
 * ▼ 方針: stale-while-revalidate（キャッシュ優先で即表示 → 裏で取得）
 *   cache-first にすると、直して公開しても古い画面が出続けて
 *   「直したのに反映されない」になる。SWR ならすぐ表示できて、
 *   新しい版が用意できたら画面側でお知らせを出せる。
 *
 * ▼ GitHub Pages の注意
 *   Pages は Cache-Control: max-age=600 を返すので、登録側で
 *   updateViaCache:'none' を付けないと、最大10分このファイル自体が
 *   古いまま見えることがある。
 */
const CACHE = "kakeibo-2026-09-17d";

const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
];

self.addEventListener("install", e => {
  // skipWaiting はここでは呼ばない。待機状態のままにしておき、
  // 画面側で「新しいバージョンがあります」を出してから切り替える
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {
      /* 1つでも取れないと addAll ごと失敗するので、取れたぶんだけ入れ直す */
      return caches.open(CACHE).then(c =>
        Promise.all(SHELL.map(u => c.add(u).catch(() => null))));
    })
  );
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", e => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // 祝日APIなど他サイトへの通信は素通しする。キャッシュすると
  // 取得できたのかどうかが分からなくなる
  if (url.origin !== location.origin) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });

    const fromNet = fetch(req).then(res => {
      if (res && res.ok && res.type === "basic") cache.put(req, res.clone());
      return res;
    }).catch(() => null);

    // キャッシュがあれば即返し、裏で最新を取りに行く
    if (cached){ e.waitUntil(fromNet); return cached; }

    const net = await fromNet;
    if (net) return net;

    return new Response(
      "<!doctype html><meta charset=utf-8><body style=\"font-family:sans-serif;padding:24px\">" +
      "<h1 style=\"font-size:18px\">オフラインです</h1>" +
      "<p style=\"font-size:13px;color:#555\">一度オンラインで開くと、次からはオフラインでも使えます。</p>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
  })());
});
