/* 家計簿 — Service Worker
 *
 * ▼ ここだけは手で直すこと
 *   アプリを更新したら、下の RELEASES のいちばん上に新しい項目を足す。
 *   ・notes に書いた文章は、そのままアプリの「更新のお知らせ」に出る。
 *     利用者が読む文章なので、何ができるようになったかを書く
 *   ・キャッシュ名（CACHE）はこの version から作るので、別に直す必要はない
 *   ・ブラウザは「sw.js の中身が1バイトでも変わったとき」だけ更新に気づく。
 *     ここに書き足すこと自体が、お知らせを出す引き金になっている。
 *     逆に言うと、index.html だけ直してここを放っておくと、
 *     利用者の端末はいつまでも古いままになる
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
const RELEASES = [
  { version:"2026-10-17a", date:"2026-10-17", notes:[
    "設定 → その他 に「ご意見・ご要望」を作りました。作っている人に直接届きます",
    "家計のデータ（金額・用途・メモ）は送りません。送る中身は画面に全部出しています",
    "送れなかったときは、書いた文章を消さずに残してやり直せるようにしました",
  ]},
  { version:"2026-10-15e", date:"2026-10-15", notes:[
    "記録画面で「閉じる」などのボタンに Enter を押すと、保存されてしまっていたのを直しました",
    "予算を入れて Enter を押しても画面の数字が変わらなかったのを直しました",
    "予算合計が、ホームの「あと使えるお金」と食い違うことがあったのを直しました",
    "円グラフから用途をタップしたとき、前の絞り込みが残っていたのを直しました",
    "用途や支払方法を全部消すと、記録画面から追加できなくなっていたのを直しました",
    "登録した「よく使う入力」を、同じボタンで外せるようにしました",
    "「初期状態にリセット」したあと、端末にデータの控えが残っていたのをやめました",
    "存在しない日付の休業日を登録できてしまい、登録しても効かなかったのを直しました",
  ]},
  { version:"2026-10-15d", date:"2026-10-15", notes:[
    "記録画面の「よく使う入力」を、メモと金額ではなく 用途 ・ 支払方法 で表示するようにしました",
    "タップすると用途と支払方法だけが入ります。打ちかけの金額やメモは消えません",
    "メモ違いで同じ組み合わせが並んでいたのを、1つにまとめました",
  ]},
  { version:"2026-10-15c", date:"2026-10-15", notes:[
    "貯金・投資（振替）の入力をやめました。種別は 支出・立替・収入 の3つです",
    "これまで「貯蓄・投資」として記録していたぶんは、ふつうの支出にまとめました。記録は1件も消していません",
    "定期の「積立」の区別もやめ、支払いの合計を1本にしました",
  ]},
  { version:"2026-10-15b", date:"2026-10-15", notes:[
    "スクロールすると下のタブが一瞬ついてくる不具合を直しました",
    "下に引っ張ったときにページが再読み込みされてしまうのをやめました",
    "PCで PageDown・スペースキーでもスクロールできるようにしました",
  ]},
  { version:"2026-10-15a", date:"2026-10-15", notes:[
    "更新のお知らせに、何が変わったのかを表示するようにしました",
    "設定 → その他 から、これまでの更新履歴を読めるようにしました",
    "Android で開いたときの見た目と操作感を、端末に合わせて調整しました",
    "Android の「戻る」で、入力シートが閉じるようにしました",
  ]},
  { version:"2026-10-04a", date:"2026-10-04", notes:[
    "記録の金額を、端末標準の数字キーボードで打てるようにしました（自前のテンキーは廃止）",
    "用途と支払方法をプルダウンから選ぶようにしました。末尾の「＋ 新しく追加…」でその場で増やせます",
    "削除済みの用途で記録した取引を編集すると、画面の表示と保存される値がずれていたのを直しました",
  ]},
  { version:"2026-09-24c", date:"2026-09-24", notes:[
    "定期・積立の「月あたりの支払」を、ならした平均と、その月に実際に出ていく額の2つに分けました",
    "定期に「3ヶ月おき」「2週間おき」のような間隔を指定できるようにしました",
    "機能の置き場所を整理しました（16箇所 → 11箇所）",
  ]},
  { version:"2026-09-17b", date:"2026-09-17", notes:[
    "積立NISAなどを「振替」として、支出とは別に集計するようにしました。貯蓄率も出ます",
    "毎月の積立を、定期として登録できるようにしました",
    "一通り精査して、見つかった7件の不具合を直しました",
  ]},
  { version:"2026-09-17a", date:"2026-09-17", notes:[
    "家計簿アプリを作り直しました。古いデータは自動で引き継がれます",
    "ホーム画面に追加すると、オフラインでも使えます",
  ]},
];

const CACHE = "kakeibo-" + RELEASES[0].version;

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
  const d = e.data;
  if (d === "SKIP_WAITING"){ self.skipWaiting(); return; }

  /* 画面側から「あなたは何版で、何が変わったのか」を聞かれたときの返事。
     待機中のワーカー（＝新しい版）に聞けば、まだ表示されていない更新の
     内容が分かるので、お知らせに中身を出せる。 */
  if (d && d.type === "VERSION"){
    const reply = { type:"VERSION", version:RELEASES[0].version, releases:RELEASES };
    if (e.ports && e.ports[0]) e.ports[0].postMessage(reply);
    else if (e.source && e.source.postMessage) e.source.postMessage(reply);
  }
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
