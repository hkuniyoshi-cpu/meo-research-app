let turnstileToken = "";
let tokenWaiters = [];
window.onTurnstile = (t) => { turnstileToken = t; const w = tokenWaiters; tokenWaiters = []; w.forEach(fn => fn(t)); };

/* ===== i18n（日本語／英語／한국어／繁體中文） ===== */
let LANG = (() => {
  let saved = "";
  try { saved = localStorage.getItem("meo_lang") || ""; } catch (e) {}
  if (saved === "ja" || saved === "en" || saved === "ko" || saved === "zh") return saved;
  try {
    const nl = (navigator.language || "").toLowerCase();
    if (nl.startsWith("ja")) return "ja";
    if (nl.startsWith("ko")) return "ko";
    if (nl.startsWith("zh")) return "zh";
    if (nl) return "en";
  } catch (e) {}
  return "ja";
})();

const T = {
  ja: {
    /* 静的（data-i18n） */
    hdr_tag: "Googleマップ 無料診断",
    lp_label: "SEARCHMANIA ・ MEO診断",
    hero_catch_html: '<span class="hc-q">まだ「検索順位」を気にしていませんか？</span><span class="hc-a">今のGoogleは、<b>見る人ごとに結果が変わる</b>。</span>',
    hero_h1_html: 'あなたのお店は、<br><span class="grad">Googleでどう見えて</span>いる？',
    hero_sub: "事業名＋住所で、Googleマップ整備度をその場で無料診断。整備スコア・競合比較・改善プランをレポート化します。",
    ph_name: "事業名（例：サンプル商店）",
    ph_area: "住所 / エリア（例：那覇市牧志）",
    compare_opt: "競合比較もする（任意）",
    go_btn: "無料でMEO診断する",
    trust1_t: "完全無料", trust1_s: "登録不要",
    trust2_t: "競合比較", trust2_s: "近隣と相対評価",
    trust3_t: "即レポート", trust3_s: "その場で表示",
    load_prep: "解析を準備中…",
    policy_link: "プライバシーポリシー・ご利用上の注意",
    lang_label: "EN",

    /* ローディング */
    load_steps: ["店舗をGoogleマップで特定中…", "基本情報（NAP）を照合中…", "写真・口コミ・属性を解析中…", "近隣の競合を取得・比較中…", "整備スコア＆知名度を算出中…", "レポートを生成中…"],
    load_done: "完了！",
    load_almost: "もうすぐ完了…",
    load_eta: (v) => `残り 約${v.sec}秒`,

    /* カテゴリ短縮ラベル */
    cat_nap: "基本情報", cat_category: "カテゴリ", cat_reviews: "口コミ", cat_photos: "写真", cat_hours: "最新性", cat_extras: "付加情報",

    /* エラー */
    err_input: "事業名と住所/エリアを入力してください",
    err_comm: "通信に失敗しました。時間をおいて再度お試しください",
    err_not_found: "該当する店舗が見つかりませんでした。事業名や住所を見直してください",
    err_rate_limited: "本日の診断上限に達しました。明日また試せます",
    err_bot_check_failed: "ボット判定をやり直しました。もう一度「無料でMEO診断する」を押してください",
    err_missing_fields: "入力が不足しています",
    err_upstream_error: "データ取得に失敗しました。時間をおいて再度お試しください",
    err_default: "診断に失敗しました",

    /* ランク */
    rank_excellent: "卓越", rank_good: "良好", rank_almost: "あと一歩", rank_improve: "要改善", rank_action: "要対策",
    /* 健康度 */
    health_great: "絶好調", health_almost: "あと一歩", health_action: "要対策",
    /* バッジ */
    badge_high: "最優先", badge_mid: "推奨", badge_info: "ヒント",

    /* 総評 */
    verdict_90: "非常に良く整備されています。この高水準を維持しましょう。",
    verdict_75: "良好な状態です。あと少しの改善で上位表示が狙えます。",
    verdict_60: "合格ラインまであと一歩。弱い項目を埋めていきましょう。",
    verdict_45: "改善の余地が大きい状態です。基本項目から着実に整えましょう。",
    verdict_0: "早急な対策が必要です。まずは基本情報の整備から始めましょう。",
    verdict_tail: (v) => `特に「${v.weak}」が弱点です。ここを強化すると全体が底上げされます。`,

    /* レポート */
    report_title: "診断結果レポート",
    report_sub: (v) => `${v.name} ／ ${v.addr}`,
    report_date: (v) => `📅 調査日 ${v.date}（最新調査サイクルの結果）`,
    rh_date_sub: "（最新調査サイクル）",
    freshness_note: "※「直近クチコミ」など最新の動きは、データ更新の都合で数日〜数週間前の状態を表示する場合があります（Googleの各種レポートと同様）。最新の実状況はGoogleマップでご確認ください。",
    obj_note: "この診断結果は、検索履歴・現在地・ログイン状態など個人に紐づく要素を除いた、第三者視点での客観的なデータです。自分のスマホでGoogleマップを開くと、閲覧履歴や現在地の影響で自店が実際より上位に表示されることがあります。この診断ではその「ゆがみ」を取り除いてご確認いただけます。",
    part1_t: "整備度", part1_s: "あなたのGoogleプロフィールの「完成度」を採点します",
    part2_t: "エリア内ランキング（知名度）", part2_s: "近隣の同業の中での、あなたの順位（口コミ・評価などから算出）",
    score_head: "総合スコア（整備度）",
    per100: "/ 100",
    rank_suffix: (v) => `${v.l}ランク`,
    health_head: "MEO健康度",
    bench_simple: (v) => `🏆 近隣同業 ${v.total}店中 <b>${v.rank}位</b>`,
    verdict_head: "診断総評",
    balance_head: "対策バランス",
    balance_note: (v) => `特に「${v.weak}」の対策が不足しています。ここを強化すると全体の底上げが期待できます。`,
    plan_head: "今後のアクションプラン",
    plan_more: (v) => `＋ほか${v.n}項目の改善で、さらに上位が狙えます`,
    plan_mail_cta: "整った詳細レポートをメールで受け取る",

    /* チップ */
    chip_verified: "✓ オーナー認証済み",
    chip_unverified: "未認証の可能性",
    chip_photos: (v) => `📷 写真 ${v.n}枚${v.ok ? " ✓" : `（推奨${v.rec}枚〜）`}`,
    chip_reviews: (v) => `🔎 直近クチコミ 最新${v.days}日前${v.pace != null ? ` / 月${v.pace}件ペース` : ""}`,

    /* 強み */
    str_head: "あなたの店の強み",
    str_owner: "オーナー認証済み", str_photos: "写真が充実", str_reviews: "クチコミが新しい",
    str_note: "これらは維持しつつ、クチコミ・投稿で積極的にアピールすると効果的です。",

    /* 予測 */
    pred_head: "今後の見通し（予測）",
    pred_note: "あなたの店の現状データから算出した目安です（実際の結果を保証するものではありません）。",
    pred_gap_name: (v) => `「${v.cat}」（+${v.gain}点）`,
    pred_score_gaps: (v) => `<b>整備スコアの伸びしろ：+${v.gain}点</b>（${v.cur}点 → <b>${v.pot}点</b>）<br>特に伸びるのは ${v.names}。ここを埋めるのが最短ルートです。`,
    pred_score_plain: (v) => `<b>整備スコアの伸びしろ：+${v.gain}点</b>（${v.cur}点 → <b>${v.pot}点</b>）まで引き上げられる見込みです。`,
    pred_score_top_keep: (v) => `<b>整備度は上位水準</b>：現在${v.cur}点。この水準を維持すれば優位を保ちやすい状態です。`,
    pred_score_top_lift: (v) => `<b>整備度は上位水準（土台は万全）</b>：現在${v.cur}点。あとはクチコミ・評価を伸ばして知名度（順位）を上げるのが次の一手です。`,
    pred_rank: (v) => `<b>順位アップの射程：あと知名度${v.gap}ポイント</b><br>現在 近隣同業${v.total}店中${v.rank}位。1つ上の店との知名度差は${v.gap}pt${v.pace ? `。月${v.pace}件のクチコミ獲得を続ければ射程圏内です。` : "。クチコミと最新情報の強化で詰められます。"}`,
    pred_review6m: (v) => `<b>クチコミの将来予測</b>：現在${v.now}件・月${v.pace}件ペース → <b>半年後 約${v.in6m}件</b>${v.milestone && v.months != null ? `。この調子なら<b>約${v.months}ヶ月で${v.milestone}件の大台</b>に到達します。` : "。"}`,
    pred_review_goal: (v) => `<b>クチコミの目標設定</b>：現在${v.now}件。次の節目は<b>${v.milestone}件</b>。月◯件の獲得計画を立てると到達時期が見えてきます。`,

    /* リスク */
    risk_head: "放置した場合のリスク（シミュレーション）",
    risk_note: "更新を怠ると、整備スコアと集客力は時間とともに下がっていきます（現状データからの目安）。",
    risk_legend_up: "改善を続けた場合", risk_legend_dn: "放置した場合",
    risk_x: ["現在", "3ヶ月後", "6ヶ月後", "12ヶ月後"],
    risk_pts: (v) => `${v.n}点`,
    risk_item_hours_t: "最新情報の投稿をやめる",
    risk_item_hours_d: (v) => `「最新性」が約${v.n}点低下。情報が古いと判断され、表示機会が減っていきます。`,
    risk_item_rev_t: "クチコミ獲得を止める",
    risk_item_rev_d: (v) => `鮮度の低下で口コミ評価が約${v.n}点目減り。新しいクチコミを集める競合に追い抜かれやすくなります。`,
    risk_item_misc_t: "写真・営業時間・付加情報を放置する",
    risk_item_misc_d: "情報の信頼性が下がり、来店判断の材料が減って機会損失につながります。",
    risk_item_join: "と…",
    risk_warn: (v) => `このまま放置すると <b>12ヶ月で最大 −${v.decline}点</b>。改善した場合との差は <b>${v.diff}点</b> にも広がります。<b>早く動くほど有利</b>です。`,

    /* シミュレーター */
    sim_head: "効果シミュレーター",
    sim_note: "改善したい項目をチェックすると、想定スコアがその場で変わります。",
    sim_score_label: "想定スコア",
    sim_opt: (v) => `${v.cat}を改善`,

    /* ランキング */
    ranking_head: (v) => `検索評価（想定）— 近隣${v.total}件中 <span class="bench-rank">${v.rank}位</span>`,
    ranking_note_full: "※整備スコア(/100)とは別の指標です。口コミ数・評価などから算出した「近隣同業内での知名度の相対値」を示します。各競合は「整備度を調査」ボタンで、TOPに戻らず整備スコアを調べて比較できます。<br>※順位はGoogleマップの検索で取得した近隣店舗をもとに算出します。Googleの検索結果は時間帯・更新状況で変動するため、対象に含まれる店舗の顔ぶれや件数が毎回わずかに変わり、順位が数ランク前後する場合があります（おおよその立ち位置の目安としてご覧ください）。",
    ranking_head_plain: "検索評価（想定）",
    ranking_note_plain: "※整備スコア(/100)とは別の指標です。口コミ数・評価などから算出した知名度の相対値です。",
    comp_you_badge: "調査対象",
    comp_diag_btn: "🔍 この店舗を調査",
    comp_report_head: (v) => `📋 ${v.name} の調査結果`,
    comp_index: (v) => `知名度 ${v.n}`,
    comp_reviews: (v) => `クチコミ${v.n}件`,

    /* 整備度くらべ */
    cmp_head: "整備度くらべ（調査した施設）",
    cmp_note: "「整備度を調査」した店舗を、整備スコアの高い順に並べています。自店の客観的な立ち位置が分かります。",
    cmp_diag_loading: "調査中…",
    cmp_diag_done: "✓ 調査済み（下の比較に追加）",

    /* CTA */
    cta_high_head: "今が動きどきです。",
    cta_high_sub: (v) => `現在 <b>${v.t}点</b>。検索で「見つけてもらう機会」を逃しているサインです。正しいMEO対策で巻き返せます。`,
    cta_mid_head: "あと一歩で上位圏。",
    cta_mid_sub: (v) => `<b>${v.t}点</b>は惜しい水準。プロの仕上げで、競合との差がはっきりつきます。`,
    cta_low_head: "この強みを、独走に。",
    cta_low_sub: (v) => `<b>${v.t}点</b>は上位水準。維持・拡大には継続的な運用が鍵。さらに上を狙えます。`,
    cta_btn: "この結果を無料でプロに相談する",
    cta_by: "MEO/SEOのプロ集団 <b>SearchMania</b> が、最短ルートをご提案します",
    cta_gap: (v) => `近隣同業${v.total}店中 <b>${v.rank}位</b>。${v.gap ? `1つ上の店との知名度差は <b>${v.gap}pt</b>。` : ""}この差は<b>正しいMEO対策で詰められます</b>。`,
    cta_gap_link: "差を埋める方法を相談する →",
    vs_head: "自分で対策 vs プロに任せる",
    vs_self: "自分で", vs_pro: "SearchMania",
    vs_r1_h: "時間・手間", vs_r1_self: "大（試行錯誤）", vs_r1_pro: "おまかせ",
    vs_r2_h: "専門知識", vs_r2_self: "学習が必要", vs_r2_pro: "不要",
    vs_r3_h: "継続運用", vs_r3_self: "続けにくい", vs_r3_pro: "自動運用",
    vs_r4_h: "成果", vs_r4_self: "不確実", vs_r4_pro: "実績に基づく",
    fc_head: "この診断結果、<br>プロと一緒に改善しませんか？",
    fc_sub: "SearchManiaが「何から手をつけるべきか」を<b>無料</b>でご提案します。",
    fc_benefit1: "✓ 専門知識は不要", fc_benefit2: "✓ 時間をかけずに", fc_benefit3: "✓ 成果にこだわる",
    fc_primary: "無料相談・お問い合わせ",
    fc_line: "LINEで相談", fc_tel: "電話で相談", fc_mail: "メールで相談",
    fc_mail_subject: "MEO診断の相談",

    /* シェア */
    share_head: "結果をシェア",
    share_native: "スマホ / SNSで共有",
    share_img: "画像で保存", share_line: "LINE", share_x: "ポスト", share_copy: "リンクをコピー",
    toast_copied: "リンクをコピーしました",
    toast_copy_failed: "コピーに失敗しました",
    toast_img_saved: "画像を保存しました",

    /* ナビ・フッター */
    nav_re: "🔍 別の店舗を再調査",
    nav_top: "🏠 TOPへ戻る",
    hdr_top: "🏠 TOPへ戻る",
    foot_html: 'Supervised &amp; Powered by <a href="https://search-mania.net/" target="_blank" rel="noopener">SearchMania</a> ・ <a href="https://search-mania.net/" target="_blank" rel="noopener">もっと詳しく改善したい方はこちら</a>',

    /* シェア文・画像 */
    share_title: "MEO無料診断",
    share_text: (v) => `${v.name} のMEO診断結果：整備スコア ${v.total}点（${v.l}ランク）｜SearchMania MEO無料診断`,
    img_title: "MEO診断結果レポート",
    img_rank: (v) => `${v.l}ランク ${v.label}`,
    img_bench: (v) => `近隣同業${v.total}店中 ${v.rank}位`,
    img_verified: "✓ オーナー認証済み",
    img_photos: (v) => `📷 写真 ${v.n}枚`,
    img_reviews: (v) => `🔎 直近クチコミ ${v.days}日前`,
    img_share_title: "MEO診断結果",
    img_filename: "MEO診断",
  },
  en: {
    /* static */
    hdr_tag: "Free Google Maps Check",
    lp_label: "SEARCHMANIA ・ MEO CHECK",
    hero_catch_html: '<span class="hc-q">Still chasing "search rankings"?</span><span class="hc-a">Today, Google shows <b>different results to every person</b>.</span>',
    hero_h1_html: 'How does <span class="grad">your business appear</span><br>on Google?',
    hero_sub: "Enter your business name and address for a free, instant Google Maps profile-completeness check — with score, competitor comparison, and an improvement plan.",
    ph_name: "Business name (e.g., Sample Shop)",
    ph_area: "Address / area (e.g., Naha, Makishi)",
    compare_opt: "Include competitor comparison (optional)",
    go_btn: "Run my free MEO check",
    trust1_t: "Completely free", trust1_s: "No sign-up",
    trust2_t: "Competitor check", trust2_s: "Relative to nearby",
    trust3_t: "Instant report", trust3_s: "Shown on the spot",
    load_prep: "Preparing the analysis…",
    policy_link: "Privacy Policy & Terms of Use",
    lang_label: "日本語",

    /* loading */
    load_steps: ["Locating the business on Google Maps…", "Matching basic info (NAP)…", "Analyzing photos, reviews, and attributes…", "Fetching and comparing nearby competitors…", "Calculating completeness & prominence…", "Generating the report…"],
    load_done: "Done!",
    load_almost: "Almost done…",
    load_eta: (v) => `About ${v.sec}s left`,

    /* category labels */
    cat_nap: "Basic info", cat_category: "Category", cat_reviews: "Reviews", cat_photos: "Photos", cat_hours: "Freshness", cat_extras: "Attributes",

    /* errors */
    err_input: "Please enter a business name and address/area",
    err_comm: "Communication failed. Please wait a moment and try again",
    err_not_found: "We couldn't find a matching business. Please double-check the name and address",
    err_rate_limited: "You've reached today's check limit. You can try again tomorrow",
    err_bot_check_failed: "We re-ran the bot check. Please press \"Run my free MEO check\" once more",
    err_missing_fields: "Some required fields are missing",
    err_upstream_error: "Failed to fetch data. Please wait a moment and try again",
    err_default: "The check failed",

    /* rank */
    rank_excellent: "Excellent", rank_good: "Good", rank_almost: "Almost there", rank_improve: "Needs work", rank_action: "Action needed",
    /* health */
    health_great: "Excellent", health_almost: "Almost there", health_action: "Action needed",
    /* badges */
    badge_high: "Top priority", badge_mid: "Recommended", badge_info: "Tip",

    /* verdict */
    verdict_90: "Your profile is very well maintained. Keep up this high standard.",
    verdict_75: "You're in good shape. A little more improvement could win you top placement.",
    verdict_60: "You're one step from the passing line. Fill in the weaker items.",
    verdict_45: "There's plenty of room to improve. Steadily build up from the basics.",
    verdict_0: "Urgent action is needed. Start by getting your basic info in order.",
    verdict_tail: (v) => `In particular, "${v.weak}" is a weak point. Strengthening it lifts your whole profile.`,

    /* report */
    report_title: "Diagnostic Report",
    report_sub: (v) => `${v.name} / ${v.addr}`,
    report_date: (v) => `📅 Surveyed on ${v.date} (results from the latest survey cycle)`,
    rh_date_sub: "(latest survey cycle)",
    freshness_note: "* The latest activity, such as \"recent reviews,\" may reflect a state from a few days to a few weeks ago due to data update timing (as with Google's own reports). Please check Google Maps for the most current status.",
    obj_note: "These results are objective and unaffected by your personal search history, current location, or login status. When you search Google Maps on your own device, your browsing history and location may cause your business to appear higher than its actual position. This diagnostic removes those personal factors to give you an unbiased view.",
    part1_t: "Profile completeness", part1_s: "We score how \"complete\" your Google profile is",
    part2_t: "Local ranking (prominence)", part2_s: "Your position among nearby peers (based on reviews & ratings)",
    score_head: "Overall score (completeness)",
    per100: "/ 100",
    rank_suffix: (v) => `Rank ${v.l}`,
    health_head: "MEO health",
    bench_simple: (v) => `🏆 <b>#${v.rank}</b> out of ${v.total} nearby peers`,
    verdict_head: "Overall assessment",
    balance_head: "Balance of measures",
    balance_note: (v) => `In particular, work on "${v.weak}" is lacking. Strengthening it should lift your whole profile.`,
    plan_head: "Your action plan",
    plan_more: (v) => `+${v.n} more improvements could push you even higher`,
    plan_mail_cta: "Get the full detailed report by email",

    /* chips */
    chip_verified: "✓ Owner-verified",
    chip_unverified: "Possibly unverified",
    chip_photos: (v) => `📷 ${v.n} photos${v.ok ? " ✓" : ` (${v.rec}+ recommended)`}`,
    chip_reviews: (v) => `🔎 Latest review ${v.days} days ago${v.pace != null ? ` / ~${v.pace}/month` : ""}`,

    /* strengths */
    str_head: "Your business's strengths",
    str_owner: "Owner-verified", str_photos: "Plenty of photos", str_reviews: "Fresh reviews",
    str_note: "Maintain these, and promote them actively through reviews and posts for the best effect.",

    /* prediction */
    pred_head: "Outlook (forecast)",
    pred_note: "These are estimates based on your business's current data (actual results are not guaranteed).",
    pred_gap_name: (v) => `"${v.cat}" (+${v.gain} pts)`,
    pred_score_gaps: (v) => `<b>Room to grow your completeness score: +${v.gain} pts</b> (${v.cur} → <b>${v.pot}</b>)<br>The biggest gains come from ${v.names}. Filling these is the fastest route.`,
    pred_score_plain: (v) => `<b>Room to grow your completeness score: +${v.gain} pts</b> (${v.cur} → <b>${v.pot}</b>) is achievable.`,
    pred_score_top_keep: (v) => `<b>Your completeness is top-tier</b>: at ${v.cur}, maintaining this keeps your advantage.`,
    pred_score_top_lift: (v) => `<b>Completeness is top-tier — a solid foundation</b>: at ${v.cur}. Your next move is to grow reviews & ratings to raise your prominence (ranking).`,
    pred_rank: (v) => `<b>Within reach of a higher rank: ${v.gap} prominence points to go</b><br>Currently #${v.rank} of ${v.total} nearby peers. The prominence gap to the business one rank above is ${v.gap}pt${v.pace ? `. Keep earning ~${v.pace} reviews/month and it's within reach.` : ". You can close it by strengthening reviews and updates."}`,
    pred_review6m: (v) => `<b>Review forecast</b>: ${v.now} now at ~${v.pace}/month → <b>about ${v.in6m} in six months</b>${v.milestone && v.months != null ? `. At this pace you'll hit the <b>${v.milestone}-review milestone in about ${v.months} months</b>.` : "."}`,
    pred_review_goal: (v) => `<b>Set a review goal</b>: ${v.now} now. The next milestone is <b>${v.milestone}</b>. Plan for X reviews per month to see when you'll get there.`,

    /* risk */
    risk_head: "Risk if left unattended (simulation)",
    risk_note: "If you neglect updates, your completeness score and customer draw decline over time (estimated from current data).",
    risk_legend_up: "If you keep improving", risk_legend_dn: "If left unattended",
    risk_x: ["Now", "In 3 months", "In 6 months", "In 12 months"],
    risk_pts: (v) => `${v.n} pts`,
    risk_item_hours_t: "Stop posting updates",
    risk_item_hours_d: (v) => `"Freshness" drops by about ${v.n} pts. Your info is judged outdated and your exposure shrinks.`,
    risk_item_rev_t: "Stop gathering reviews",
    risk_item_rev_d: (v) => `Falling freshness erodes your review score by about ${v.n} pts. Competitors collecting fresh reviews can overtake you.`,
    risk_item_misc_t: "Neglect photos, hours, and attributes",
    risk_item_misc_d: "The credibility of your info drops, leaving customers less to go on and costing you opportunities.",
    risk_item_join: ", and…",
    risk_warn: (v) => `Left unattended, that's <b>up to −${v.decline} pts over 12 months</b>. The gap versus improving widens to as much as <b>${v.diff} pts</b>. <b>The sooner you act, the better.</b>`,

    /* simulator */
    sim_head: "Impact simulator",
    sim_note: "Check the items you'd like to improve, and the projected score updates instantly.",
    sim_score_label: "Projected score",
    sim_opt: (v) => `Improve ${v.cat}`,

    /* ranking */
    ranking_head: (v) => `Search rating (estimated) — <span class="bench-rank">#${v.rank}</span> of ${v.total} nearby`,
    ranking_note_full: "* This is a separate metric from the completeness score (/100). It shows a \"relative prominence value among nearby peers\" calculated from review count, rating, and more. Use the \"Check completeness\" button on each competitor to look up their completeness score and compare without leaving this page.<br>* Rankings are based on the nearby businesses returned by Google Maps search. Google's results vary by time and updates, so the set and number of businesses included can change slightly each run and your rank may shift by a few places — please treat it as an approximate standing.",
    ranking_head_plain: "Search rating (estimated)",
    ranking_note_plain: "* This is a separate metric from the completeness score (/100). It's a relative prominence value calculated from review count, rating, and more.",
    comp_you_badge: "This business",
    comp_diag_btn: "🔍 Check this business",
    comp_report_head: (v) => `📋 Diagnosis for ${v.name}`,
    comp_index: (v) => `Prominence ${v.n}`,
    comp_reviews: (v) => `${v.n} reviews`,

    /* completeness comparison */
    cmp_head: "Completeness comparison (checked businesses)",
    cmp_note: "Businesses you've run \"Check completeness\" on, ordered from highest completeness score. See where you objectively stand.",
    cmp_diag_loading: "Checking…",
    cmp_diag_done: "✓ Checked (added to comparison below)",

    /* CTA */
    cta_high_head: "Now is the time to act.",
    cta_high_sub: (v) => `Currently <b>${v.t} pts</b>. A sign you're missing chances to be found in search. The right MEO measures can turn it around.`,
    cta_mid_head: "One step from the top tier.",
    cta_mid_sub: (v) => `<b>${v.t} pts</b> is so close. A professional finish will clearly set you apart from competitors.`,
    cta_low_head: "Turn this strength into a runaway lead.",
    cta_low_sub: (v) => `<b>${v.t} pts</b> is top-tier. Ongoing management is key to maintaining and expanding it. You can aim even higher.`,
    cta_btn: "Discuss these results with a pro, free",
    cta_by: "<b>SearchMania</b>, a team of MEO/SEO pros, will propose the fastest route",
    cta_gap: (v) => `<b>#${v.rank}</b> out of ${v.total} nearby peers. ${v.gap ? `The prominence gap to the business one rank above is <b>${v.gap}pt</b>. ` : ""}This gap <b>can be closed with the right MEO measures</b>.`,
    cta_gap_link: "Discuss how to close the gap →",
    vs_head: "DIY vs. leaving it to a pro",
    vs_self: "DIY", vs_pro: "SearchMania",
    vs_r1_h: "Time & effort", vs_r1_self: "High (trial and error)", vs_r1_pro: "Leave it to us",
    vs_r2_h: "Expertise", vs_r2_self: "Learning required", vs_r2_pro: "Not needed",
    vs_r3_h: "Ongoing operation", vs_r3_self: "Hard to keep up", vs_r3_pro: "Automated operation",
    vs_r4_h: "Results", vs_r4_self: "Uncertain", vs_r4_pro: "Based on a track record",
    fc_head: "Want to improve these results<br>together with a pro?",
    fc_sub: "SearchMania will suggest <b>for free</b> where you should start.",
    fc_benefit1: "✓ No expertise needed", fc_benefit2: "✓ Without spending your time", fc_benefit3: "✓ Focused on results",
    fc_primary: "Free consultation / contact us",
    fc_line: "Chat on LINE", fc_tel: "Call us", fc_mail: "Email us",
    fc_mail_subject: "MEO check consultation",

    /* share */
    share_head: "Share your results",
    share_native: "Share to phone / social",
    share_img: "Save as image", share_line: "LINE", share_x: "Post", share_copy: "Copy link",
    toast_copied: "Link copied",
    toast_copy_failed: "Copy failed",
    toast_img_saved: "Image saved",

    /* nav / footer */
    nav_re: "🔍 Check another business",
    nav_top: "🏠 Back to top",
    hdr_top: "🏠 Back to top",
    foot_html: 'Supervised &amp; Powered by <a href="https://search-mania.net/" target="_blank" rel="noopener">SearchMania</a> ・ <a href="https://search-mania.net/" target="_blank" rel="noopener">Want help improving further? Click here</a>',

    /* share text / image */
    share_title: "Free MEO Check",
    share_text: (v) => `MEO check results for ${v.name}: completeness score ${v.total} (Rank ${v.l}) | SearchMania Free MEO Check`,
    img_title: "MEO Diagnostic Report",
    img_rank: (v) => `Rank ${v.l} ${v.label}`,
    img_bench: (v) => `#${v.rank} of ${v.total} nearby peers`,
    img_verified: "✓ Owner-verified",
    img_photos: (v) => `📷 ${v.n} photos`,
    img_reviews: (v) => `🔎 Latest review ${v.days} days ago`,
    img_share_title: "MEO Check Results",
    img_filename: "MEO-check",
  },
  ko: {
    /* static */
    hdr_tag: "구글 지도 무료 진단",
    lp_label: "SEARCHMANIA ・ MEO 진단",
    hero_catch_html: '<span class="hc-q">아직 \'검색 순위\'를 신경 쓰시나요?</span><span class="hc-a">지금의 구글은 <b>보는 사람마다 결과가 다릅니다</b>.</span>',
    hero_h1_html: '당신의 매장은<br><span class="grad">구글에서 어떻게 보일까요</span>?',
    hero_sub: "상호명＋주소로 구글 지도 프로필 완성도를 그 자리에서 무료 진단. 완성도 점수・경쟁사 비교・개선 플랜을 리포트로 정리해 드립니다.",
    ph_name: "상호명(예: 샘플 상점)",
    ph_area: "주소 / 지역(예: 나하시 마키시)",
    compare_opt: "경쟁사 비교도 함께(선택)",
    go_btn: "무료로 MEO 진단하기",
    trust1_t: "완전 무료", trust1_s: "가입 불필요",
    trust2_t: "경쟁사 비교", trust2_s: "주변과 상대 평가",
    trust3_t: "즉시 리포트", trust3_s: "그 자리에서 표시",
    load_prep: "분석을 준비 중…",
    policy_link: "개인정보 처리방침・이용 시 주의사항",
    lang_label: "한국어",

    /* loading */
    load_steps: ["구글 지도에서 매장 확인 중…", "기본 정보(NAP) 대조 중…", "사진・리뷰・속성 분석 중…", "주변 경쟁사 수집・비교 중…", "완성도 점수＆인지도 산출 중…", "리포트 생성 중…"],
    load_done: "완료!",
    load_almost: "곧 완료…",
    load_eta: (v) => `약 ${v.sec}초 남음`,

    /* category labels */
    cat_nap: "기본 정보", cat_category: "카테고리", cat_reviews: "리뷰", cat_photos: "사진", cat_hours: "신선도", cat_extras: "부가정보",

    /* errors */
    err_input: "상호명과 주소/지역을 입력해 주세요",
    err_comm: "통신에 실패했습니다. 잠시 후 다시 시도해 주세요",
    err_not_found: "해당하는 매장을 찾을 수 없습니다. 상호명이나 주소를 다시 확인해 주세요",
    err_rate_limited: "오늘의 진단 한도에 도달했습니다. 내일 다시 시도할 수 있습니다",
    err_bot_check_failed: "봇 판정을 다시 실행했습니다. \"무료로 MEO 진단하기\"를 한 번 더 눌러 주세요",
    err_missing_fields: "입력이 부족합니다",
    err_upstream_error: "데이터 취득에 실패했습니다. 잠시 후 다시 시도해 주세요",
    err_default: "진단에 실패했습니다",

    /* rank */
    rank_excellent: "탁월", rank_good: "양호", rank_almost: "조금 더", rank_improve: "개선 필요", rank_action: "대책 필요",
    /* health */
    health_great: "최상", health_almost: "조금 더", health_action: "대책 필요",
    /* badges */
    badge_high: "최우선", badge_mid: "권장", badge_info: "팁",

    /* verdict */
    verdict_90: "매우 잘 정비되어 있습니다. 이 높은 수준을 유지하세요.",
    verdict_75: "양호한 상태입니다. 조금만 더 개선하면 상위 노출을 노릴 수 있습니다.",
    verdict_60: "합격선까지 한 걸음 남았습니다. 약한 항목을 채워 나가세요.",
    verdict_45: "개선의 여지가 큰 상태입니다. 기본 항목부터 차근차근 정비하세요.",
    verdict_0: "조속한 대책이 필요합니다. 우선 기본 정보 정비부터 시작하세요.",
    verdict_tail: (v) => `특히 「${v.weak}」이(가) 약점입니다. 이곳을 강화하면 전체가 끌어올려집니다.`,

    /* report */
    report_title: "진단 결과 리포트",
    report_sub: (v) => `${v.name} ／ ${v.addr}`,
    report_date: (v) => `📅 조사일 ${v.date}(최신 조사 사이클의 결과)`,
    rh_date_sub: "(최신 조사 사이클)",
    freshness_note: "※「최근 리뷰」 등 최신 동향은 데이터 갱신 사정으로 며칠~몇 주 전 상태를 표시할 수 있습니다(구글의 각종 리포트와 동일). 최신 실제 상황은 구글 지도에서 확인해 주세요.",
    obj_note: "이 진단 결과는 검색 이력·현재 위치·로그인 상태 등 개인에 연결된 요소를 제거한, 제3자 시점의 객관적인 데이터입니다. 자신의 스마트폰에서 구글 지도를 열면, 검색 이력과 현재 위치의 영향으로 자신의 가게가 실제보다 높은 순위로 표시될 수 있습니다. 이 진단에서는 그 '왜곡'을 제거하여 확인하실 수 있습니다.",
    part1_t: "완성도", part1_s: "귀하의 구글 프로필 「완성도」를 채점합니다",
    part2_t: "지역 내 랭킹（인지도）", part2_s: "주변 동종 업종 중 당신의 순위(리뷰・평점 등으로 산출)",
    score_head: "종합 점수(완성도)",
    per100: "/ 100",
    rank_suffix: (v) => `${v.l} 등급`,
    health_head: "MEO 건강도",
    bench_simple: (v) => `🏆 주변 동종 업종 ${v.total}곳 중 <b>${v.rank}위</b>`,
    verdict_head: "진단 총평",
    balance_head: "대책 밸런스",
    balance_note: (v) => `특히 「${v.weak}」에 대한 대책이 부족합니다. 이곳을 강화하면 전체 향상을 기대할 수 있습니다.`,
    plan_head: "향후 액션 플랜",
    plan_more: (v) => `＋그 외 ${v.n}개 항목을 개선하면 더 상위를 노릴 수 있습니다`,
    plan_mail_cta: "정리된 상세 리포트를 이메일로 받기",

    /* chips */
    chip_verified: "✓ 소유자 인증 완료",
    chip_unverified: "미인증 가능성",
    chip_photos: (v) => `📷 사진 ${v.n}장${v.ok ? " ✓" : `(권장 ${v.rec}장~)`}`,
    chip_reviews: (v) => `🔎 최근 리뷰 최신 ${v.days}일 전${v.pace != null ? ` / 월 ${v.pace}건 페이스` : ""}`,

    /* strengths */
    str_head: "귀하 매장의 강점",
    str_owner: "소유자 인증 완료", str_photos: "사진이 풍부", str_reviews: "리뷰가 최신",
    str_note: "이를 유지하면서 리뷰・게시물로 적극적으로 어필하면 효과적입니다.",

    /* prediction */
    pred_head: "향후 전망(예측)",
    pred_note: "귀하 매장의 현재 데이터로 산출한 기준치입니다(실제 결과를 보장하지 않습니다).",
    pred_gap_name: (v) => `「${v.cat}」(+${v.gain}점)`,
    pred_score_gaps: (v) => `<b>완성도 점수의 성장 여력: +${v.gain}점</b>(${v.cur}점 → <b>${v.pot}점</b>)<br>특히 크게 오르는 부분은 ${v.names}. 이곳을 채우는 것이 가장 빠른 길입니다.`,
    pred_score_plain: (v) => `<b>완성도 점수의 성장 여력: +${v.gain}점</b>(${v.cur}점 → <b>${v.pot}점</b>)까지 끌어올릴 수 있을 전망입니다.`,
    pred_score_top_keep: (v) => `<b>완성도는 상위 수준</b>: 현재 ${v.cur}점. 이 수준을 유지하면 우위를 지키기 쉽습니다.`,
    pred_score_top_lift: (v) => `<b>완성도는 상위 수준(토대는 탄탄)</b>: 현재 ${v.cur}점. 이제 리뷰・평점을 늘려 인지도(순위)를 올리는 것이 다음 단계입니다.`,
    pred_rank: (v) => `<b>순위 상승의 사정권: 인지도 ${v.gap}포인트 남음</b><br>현재 주변 동종 업종 ${v.total}곳 중 ${v.rank}위. 한 단계 위 매장과의 인지도 차이는 ${v.gap}pt${v.pace ? `. 월 ${v.pace}건의 리뷰 획득을 이어가면 사정권에 듭니다.` : ". 리뷰와 최신 정보 강화로 좁힐 수 있습니다."}`,
    pred_review6m: (v) => `<b>리뷰의 미래 예측</b>: 현재 ${v.now}건・월 ${v.pace}건 페이스 → <b>반년 후 약 ${v.in6m}건</b>${v.milestone && v.months != null ? `. 이 추세라면 <b>약 ${v.months}개월 후 ${v.milestone}건 고지</b>에 도달합니다.` : "."}`,
    pred_review_goal: (v) => `<b>리뷰 목표 설정</b>: 현재 ${v.now}건. 다음 이정표는 <b>${v.milestone}건</b>. 월 몇 건 획득 계획을 세우면 도달 시기가 보입니다.`,

    /* risk */
    risk_head: "방치할 경우의 리스크(시뮬레이션)",
    risk_note: "갱신을 게을리하면 완성도 점수와 집객력은 시간이 갈수록 떨어집니다(현재 데이터로부터의 기준치).",
    risk_legend_up: "개선을 이어간 경우", risk_legend_dn: "방치한 경우",
    risk_x: ["현재", "3개월 후", "6개월 후", "12개월 후"],
    risk_pts: (v) => `${v.n}점`,
    risk_item_hours_t: "최신 정보 게시를 중단",
    risk_item_hours_d: (v) => `「신선도」가 약 ${v.n}점 하락. 정보가 오래되었다고 판단되어 노출 기회가 줄어듭니다.`,
    risk_item_rev_t: "리뷰 획득을 중단",
    risk_item_rev_d: (v) => `신선도 저하로 리뷰 평가가 약 ${v.n}점 감소. 새 리뷰를 모으는 경쟁사에게 추월당하기 쉬워집니다.`,
    risk_item_misc_t: "사진・영업시간・부가정보를 방치",
    risk_item_misc_d: "정보의 신뢰성이 떨어지고, 방문 판단 근거가 줄어 기회 손실로 이어집니다.",
    risk_item_join: "그리고…",
    risk_warn: (v) => `이대로 방치하면 <b>12개월에 최대 −${v.decline}점</b>. 개선했을 경우와의 차이는 <b>${v.diff}점</b>까지 벌어집니다. <b>빨리 움직일수록 유리</b>합니다.`,

    /* simulator */
    sim_head: "효과 시뮬레이터",
    sim_note: "개선하고 싶은 항목을 체크하면 예상 점수가 그 자리에서 바뀝니다.",
    sim_score_label: "예상 점수",
    sim_opt: (v) => `${v.cat} 개선`,

    /* ranking */
    ranking_head: (v) => `검색 평가(예상) — 주변 ${v.total}곳 중 <span class="bench-rank">${v.rank}위</span>`,
    ranking_note_full: "※완성도 점수(/100)와는 별개의 지표입니다. 리뷰 수・평점 등으로 산출한 「주변 동종 업종 내 인지도의 상대값」을 나타냅니다. 각 경쟁사는 「완성도 조사」 버튼으로 TOP으로 돌아가지 않고 완성도 점수를 조사해 비교할 수 있습니다.<br>※순위는 구글 지도 검색으로 가져온 주변 매장을 기준으로 산출합니다. 구글 검색 결과는 시간대・갱신 상황에 따라 변동하므로, 포함되는 매장의 구성・건수가 매번 조금씩 달라져 순위가 몇 단계 전후할 수 있습니다(대략적인 위치의 기준으로 봐 주세요).",
    ranking_head_plain: "검색 평가(예상)",
    ranking_note_plain: "※완성도 점수(/100)와는 별개의 지표입니다. 리뷰 수・평점 등으로 산출한 인지도의 상대값입니다.",
    comp_you_badge: "조사 대상",
    comp_diag_btn: "🔍 이 매장을 조사",
    comp_report_head: (v) => `📋 ${v.name}의 조사 결과`,
    comp_index: (v) => `인지도 ${v.n}`,
    comp_reviews: (v) => `리뷰 ${v.n}건`,

    /* completeness comparison */
    cmp_head: "완성도 비교(조사한 시설)",
    cmp_note: "「완성도 조사」를 한 매장을 완성도 점수가 높은 순으로 나열합니다. 자기 매장의 객관적인 위치를 알 수 있습니다.",
    cmp_diag_loading: "조사 중…",
    cmp_diag_done: "✓ 조사 완료(아래 비교에 추가)",

    /* CTA */
    cta_high_head: "지금이 움직일 때입니다.",
    cta_high_sub: (v) => `현재 <b>${v.t}점</b>. 검색에서 「발견될 기회」를 놓치고 있다는 신호입니다. 올바른 MEO 대책으로 만회할 수 있습니다.`,
    cta_mid_head: "한 걸음이면 상위권.",
    cta_mid_sub: (v) => `<b>${v.t}점</b>은 아쉬운 수준. 전문가의 마무리로 경쟁사와의 차이가 뚜렷해집니다.`,
    cta_low_head: "이 강점을 독주로.",
    cta_low_sub: (v) => `<b>${v.t}점</b>은 상위 수준. 유지・확대에는 지속적인 운영이 핵심. 더 위를 노릴 수 있습니다.`,
    cta_btn: "이 결과를 무료로 전문가에게 상담",
    cta_by: "MEO/SEO 전문가 집단 <b>SearchMania</b>가 가장 빠른 길을 제안합니다",
    cta_gap: (v) => `주변 동종 업종 ${v.total}곳 중 <b>${v.rank}위</b>. ${v.gap ? `한 단계 위 매장과의 인지도 차이는 <b>${v.gap}pt</b>. ` : ""}이 차이는 <b>올바른 MEO 대책으로 좁힐 수 있습니다</b>.`,
    cta_gap_link: "차이를 좁히는 방법 상담하기 →",
    vs_head: "직접 대책 vs 전문가에게 맡기기",
    vs_self: "직접", vs_pro: "SearchMania",
    vs_r1_h: "시간・수고", vs_r1_self: "큼(시행착오)", vs_r1_pro: "맡기면 끝",
    vs_r2_h: "전문 지식", vs_r2_self: "학습 필요", vs_r2_pro: "불필요",
    vs_r3_h: "지속 운영", vs_r3_self: "지속하기 어려움", vs_r3_pro: "자동 운영",
    vs_r4_h: "성과", vs_r4_self: "불확실", vs_r4_pro: "실적 기반",
    fc_head: "이 진단 결과,<br>전문가와 함께 개선해 보지 않으시겠어요?",
    fc_sub: "SearchMania가 「무엇부터 손대야 할지」를 <b>무료</b>로 제안해 드립니다.",
    fc_benefit1: "✓ 전문 지식 불필요", fc_benefit2: "✓ 시간을 들이지 않고", fc_benefit3: "✓ 성과에 집중",
    fc_primary: "무료 상담・문의",
    fc_line: "LINE으로 상담", fc_tel: "전화로 상담", fc_mail: "이메일로 상담",
    fc_mail_subject: "MEO 진단 상담",

    /* share */
    share_head: "결과 공유",
    share_native: "스마트폰 / SNS로 공유",
    share_img: "이미지로 저장", share_line: "LINE", share_x: "포스트", share_copy: "링크 복사",
    toast_copied: "링크를 복사했습니다",
    toast_copy_failed: "복사에 실패했습니다",
    toast_img_saved: "이미지를 저장했습니다",

    /* nav / footer */
    nav_re: "🔍 다른 매장 재조사",
    nav_top: "🏠 TOP으로 돌아가기",
    hdr_top: "🏠 처음으로",
    foot_html: 'Supervised &amp; Powered by <a href="https://search-mania.net/" target="_blank" rel="noopener">SearchMania</a> ・ <a href="https://search-mania.net/" target="_blank" rel="noopener">더 자세히 개선하고 싶으신 분은 여기로</a>',

    /* share text / image */
    share_title: "MEO 무료 진단",
    share_text: (v) => `${v.name}의 MEO 진단 결과: 완성도 점수 ${v.total}점(${v.l} 등급)｜SearchMania MEO 무료 진단`,
    img_title: "MEO 진단 결과 리포트",
    img_rank: (v) => `${v.l} 등급 ${v.label}`,
    img_bench: (v) => `주변 동종 업종 ${v.total}곳 중 ${v.rank}위`,
    img_verified: "✓ 소유자 인증 완료",
    img_photos: (v) => `📷 사진 ${v.n}장`,
    img_reviews: (v) => `🔎 최근 리뷰 ${v.days}일 전`,
    img_share_title: "MEO 진단 결과",
    img_filename: "MEO진단",
  },
  zh: {
    /* static */
    hdr_tag: "Google 地圖免費診斷",
    lp_label: "SEARCHMANIA ・ MEO 診斷",
    hero_catch_html: '<span class="hc-q">還在意「搜尋排名」嗎？</span><span class="hc-a">現在的 Google，<b>每個人看到的結果都不同</b>。</span>',
    hero_h1_html: '您的店家<br>在 Google 上<span class="grad">看起來如何</span>？',
    hero_sub: "輸入商家名稱＋地址，當場免費診斷 Google 地圖檔案完善度。完善度評分・競爭對手比較・改善方案一次整理成報告。",
    ph_name: "商家名稱（例：範例商店）",
    ph_area: "地址 / 地區（例：那霸市牧志）",
    compare_opt: "一併進行競爭對手比較（選填）",
    go_btn: "免費進行 MEO 診斷",
    trust1_t: "完全免費", trust1_s: "免註冊",
    trust2_t: "競爭對手比較", trust2_s: "與周邊相對評估",
    trust3_t: "即時報告", trust3_s: "當場顯示",
    load_prep: "正在準備分析…",
    policy_link: "隱私權政策・使用注意事項",
    lang_label: "繁體中文",

    /* loading */
    load_steps: ["正在 Google 地圖上定位商家…", "正在比對基本資訊（NAP）…", "正在分析照片・評論・屬性…", "正在擷取並比較周邊競爭對手…", "正在計算完善度＆知名度…", "正在生成報告…"],
    load_done: "完成！",
    load_almost: "即將完成…",
    load_eta: (v) => `約剩 ${v.sec} 秒`,

    /* category labels */
    cat_nap: "基本資訊", cat_category: "類別", cat_reviews: "評論", cat_photos: "照片", cat_hours: "新鮮度", cat_extras: "附加資訊",

    /* errors */
    err_input: "請輸入商家名稱與地址/地區",
    err_comm: "通訊失敗。請稍後再試",
    err_not_found: "找不到符合的商家。請重新確認商家名稱或地址",
    err_rate_limited: "已達今日診斷上限。明天可再次嘗試",
    err_bot_check_failed: "已重新進行機器人驗證。請再按一次「免費進行 MEO 診斷」",
    err_missing_fields: "輸入內容不足",
    err_upstream_error: "資料取得失敗。請稍後再試",
    err_default: "診斷失敗",

    /* rank */
    rank_excellent: "卓越", rank_good: "良好", rank_almost: "差一步", rank_improve: "需改善", rank_action: "需對策",
    /* health */
    health_great: "極佳", health_almost: "差一步", health_action: "需對策",
    /* badges */
    badge_high: "最優先", badge_mid: "建議", badge_info: "提示",

    /* verdict */
    verdict_90: "您的檔案維護得非常完善。請維持這個高水準。",
    verdict_75: "狀態良好。再稍加改善即可爭取排名靠前。",
    verdict_60: "距離及格線僅差一步。請補強較弱的項目。",
    verdict_45: "仍有很大的改善空間。請從基本項目開始穩紮穩打地完善。",
    verdict_0: "需要儘速採取對策。請先從整理基本資訊開始。",
    verdict_tail: (v) => `特別是「${v.weak}」為弱點。強化此處可帶動整體提升。`,

    /* report */
    report_title: "診斷結果報告",
    report_sub: (v) => `${v.name} ／ ${v.addr}`,
    report_date: (v) => `📅 調查日 ${v.date}（最新調查週期的結果）`,
    rh_date_sub: "（最新調查週期）",
    freshness_note: "※「最近評論」等最新動態，因資料更新時間關係，可能顯示數天至數週前的狀態（與 Google 各項報告相同）。最新實際狀況請於 Google 地圖確認。",
    obj_note: "此診斷結果是排除搜尋記錄、目前位置及登入狀態等個人因素後，以第三者視角取得的客觀數據。在自己的手機上開啟 Google 地圖時，可能因瀏覽記錄和目前位置的影響，使自家店鋪的排名看起來高於實際。此診斷已排除這些「偏差」，讓您查看客觀的結果。",
    part1_t: "完善度", part1_s: "為您的 Google 檔案「完善程度」評分",
    part2_t: "區域內排名（知名度）", part2_s: "在周邊同業中您的排名（依評論・評分等推算）",
    score_head: "綜合評分（完善度）",
    per100: "/ 100",
    rank_suffix: (v) => `${v.l} 級`,
    health_head: "MEO 健康度",
    bench_simple: (v) => `🏆 周邊同業 ${v.total} 家中 <b>第 ${v.rank} 名</b>`,
    verdict_head: "診斷總評",
    balance_head: "對策平衡",
    balance_note: (v) => `特別是「${v.weak}」的對策不足。強化此處可望帶動整體提升。`,
    plan_head: "後續行動方案",
    plan_more: (v) => `＋再改善 ${v.n} 個項目，即可爭取更高排名`,
    plan_mail_cta: "以電子郵件接收完整詳細報告",

    /* chips */
    chip_verified: "✓ 已通過擁有者驗證",
    chip_unverified: "可能未驗證",
    chip_photos: (v) => `📷 照片 ${v.n} 張${v.ok ? " ✓" : `（建議 ${v.rec} 張起）`}`,
    chip_reviews: (v) => `🔎 最近評論 最新 ${v.days} 天前${v.pace != null ? ` / 每月約 ${v.pace} 則` : ""}`,

    /* strengths */
    str_head: "您商家的優勢",
    str_owner: "已通過擁有者驗證", str_photos: "照片豐富", str_reviews: "評論新近",
    str_note: "請維持這些優勢，並透過評論・貼文積極宣傳會更有效果。",

    /* prediction */
    pred_head: "後續展望（預測）",
    pred_note: "這是依據您商家現況資料推算的參考值（不保證實際結果）。",
    pred_gap_name: (v) => `「${v.cat}」（+${v.gain} 分）`,
    pred_score_gaps: (v) => `<b>完善度評分的成長空間：+${v.gain} 分</b>（${v.cur} 分 → <b>${v.pot} 分</b>）<br>特別能提升的是 ${v.names}。補強這些是最快的途徑。`,
    pred_score_plain: (v) => `<b>完善度評分的成長空間：+${v.gain} 分</b>（${v.cur} 分 → <b>${v.pot} 分</b>），可望提升至此。`,
    pred_score_top_keep: (v) => `<b>完善度為頂尖水準</b>：目前 ${v.cur} 分。維持此水準即可保持優勢。`,
    pred_score_top_lift: (v) => `<b>完善度為頂尖水準（基礎穩固）</b>：目前 ${v.cur} 分。接下來透過增加評論・評分來提升知名度（排名）是下一步。`,
    pred_rank: (v) => `<b>晉升排名的射程：知名度還差 ${v.gap} 分</b><br>目前周邊同業 ${v.total} 家中第 ${v.rank} 名。與上一名商家的知名度差距為 ${v.gap}pt${v.pace ? `。持續每月獲得 ${v.pace} 則評論即可進入射程範圍。` : "。可透過強化評論與最新資訊來縮短。"}`,
    pred_review6m: (v) => `<b>評論未來預測</b>：目前 ${v.now} 則・每月約 ${v.pace} 則 → <b>半年後約 ${v.in6m} 則</b>${v.milestone && v.months != null ? `。照這個速度，<b>約 ${v.months} 個月即可達到 ${v.milestone} 則的大關</b>。` : "。"}`,
    pred_review_goal: (v) => `<b>評論目標設定</b>：目前 ${v.now} 則。下一個里程碑是 <b>${v.milestone} 則</b>。訂定每月獲取數量的計畫，便能看見達成時程。`,

    /* risk */
    risk_head: "放任不管的風險（模擬）",
    risk_note: "若疏於更新，完善度評分與集客力會隨時間下滑（依現況資料推算的參考值）。",
    risk_legend_up: "持續改善的情況", risk_legend_dn: "放任不管的情況",
    risk_x: ["現在", "3 個月後", "6 個月後", "12 個月後"],
    risk_pts: (v) => `${v.n} 分`,
    risk_item_hours_t: "停止發布最新資訊",
    risk_item_hours_d: (v) => `「新鮮度」下降約 ${v.n} 分。資訊被判定為過時，曝光機會逐漸減少。`,
    risk_item_rev_t: "停止獲取評論",
    risk_item_rev_d: (v) => `新鮮度下降使評論評價減少約 ${v.n} 分。容易被持續累積新評論的競爭對手超越。`,
    risk_item_misc_t: "放任照片・營業時間・附加資訊",
    risk_item_misc_d: "資訊可信度下降，顧客判斷是否上門的依據減少，導致錯失機會。",
    risk_item_join: "以及…",
    risk_warn: (v) => `若就此放任，<b>12 個月內最多 −${v.decline} 分</b>。與改善情況的差距更會擴大至 <b>${v.diff} 分</b>。<b>越早行動越有利</b>。`,

    /* simulator */
    sim_head: "成效模擬器",
    sim_note: "勾選想改善的項目，預估評分會當場變動。",
    sim_score_label: "預估評分",
    sim_opt: (v) => `改善${v.cat}`,

    /* ranking */
    ranking_head: (v) => `搜尋評價（預估）— 周邊 ${v.total} 家中第 <span class="bench-rank">${v.rank}</span> 名`,
    ranking_note_full: "※這是與完善度評分（/100）不同的指標。它顯示依評論數・評分等推算的「周邊同業內知名度相對值」。各競爭對手可透過「調查完善度」按鈕，在不返回首頁的情況下查詢其完善度評分並進行比較。<br>※排名是依據從 Google 地圖搜尋取得的周邊店家計算。Google 搜尋結果會因時段・更新狀況而變動，納入比較的店家組成與數量每次可能略有不同，排名也可能前後數名（請視為大致的定位參考）。",
    ranking_head_plain: "搜尋評價（預估）",
    ranking_note_plain: "※這是與完善度評分（/100）不同的指標。為依評論數・評分等推算的知名度相對值。",
    comp_you_badge: "調查對象",
    comp_diag_btn: "🔍 調查此商家",
    comp_report_head: (v) => `📋 ${v.name} 的調查結果`,
    comp_index: (v) => `知名度 ${v.n}`,
    comp_reviews: (v) => `評論 ${v.n} 則`,

    /* completeness comparison */
    cmp_head: "完善度比較（已調查的商家）",
    cmp_note: "將您執行「調查完善度」的商家，依完善度評分由高至低排列。可了解自家商家的客觀定位。",
    cmp_diag_loading: "調查中…",
    cmp_diag_done: "✓ 已調查（已加入下方比較）",

    /* CTA */
    cta_high_head: "現在正是行動的時候。",
    cta_high_sub: (v) => `目前 <b>${v.t} 分</b>。這是您正在錯失「被搜尋發現的機會」的訊號。透過正確的 MEO 對策即可扭轉。`,
    cta_mid_head: "距離頂尖只差一步。",
    cta_mid_sub: (v) => `<b>${v.t} 分</b>相當可惜。透過專業的收尾，能與競爭對手明顯拉開差距。`,
    cta_low_head: "讓這項優勢一路領先。",
    cta_low_sub: (v) => `<b>${v.t} 分</b>已是頂尖水準。維持・擴大的關鍵在於持續經營。還能爭取更高的目標。`,
    cta_btn: "免費向專家諮詢此結果",
    cta_by: "MEO/SEO 專業團隊 <b>SearchMania</b> 為您提案最快途徑",
    cta_gap: (v) => `周邊同業 ${v.total} 家中 <b>第 ${v.rank} 名</b>。${v.gap ? `與上一名商家的知名度差距為 <b>${v.gap}pt</b>。` : ""}這個差距<b>可透過正確的 MEO 對策縮短</b>。`,
    cta_gap_link: "諮詢如何縮短差距 →",
    vs_head: "自行對策 vs 交給專家",
    vs_self: "自行", vs_pro: "SearchMania",
    vs_r1_h: "時間・心力", vs_r1_self: "大（不斷試錯）", vs_r1_pro: "全權交辦",
    vs_r2_h: "專業知識", vs_r2_self: "需要學習", vs_r2_pro: "不需要",
    vs_r3_h: "持續經營", vs_r3_self: "難以持續", vs_r3_pro: "自動經營",
    vs_r4_h: "成效", vs_r4_self: "不確定", vs_r4_pro: "依實績為基礎",
    fc_head: "這份診斷結果，<br>要不要和專家一起改善呢？",
    fc_sub: "SearchMania 將<b>免費</b>為您提案「該從何處著手」。",
    fc_benefit1: "✓ 無需專業知識", fc_benefit2: "✓ 不耗費您的時間", fc_benefit3: "✓ 講求成效",
    fc_primary: "免費諮詢・聯絡我們",
    fc_line: "用 LINE 諮詢", fc_tel: "用電話諮詢", fc_mail: "用電子郵件諮詢",
    fc_mail_subject: "MEO 診斷諮詢",

    /* share */
    share_head: "分享結果",
    share_native: "分享至手機 / 社群",
    share_img: "存成圖片", share_line: "LINE", share_x: "發文", share_copy: "複製連結",
    toast_copied: "已複製連結",
    toast_copy_failed: "複製失敗",
    toast_img_saved: "已儲存圖片",

    /* nav / footer */
    nav_re: "🔍 重新調查其他商家",
    nav_top: "🏠 返回首頁",
    hdr_top: "🏠 返回首頁",
    foot_html: 'Supervised &amp; Powered by <a href="https://search-mania.net/" target="_blank" rel="noopener">SearchMania</a> ・ <a href="https://search-mania.net/" target="_blank" rel="noopener">想進一步改善的人請點這裡</a>',

    /* share text / image */
    share_title: "MEO 免費診斷",
    share_text: (v) => `${v.name} 的 MEO 診斷結果：完善度評分 ${v.total} 分（${v.l} 級）｜SearchMania MEO 免費診斷`,
    img_title: "MEO 診斷結果報告",
    img_rank: (v) => `${v.l} 級 ${v.label}`,
    img_bench: (v) => `周邊同業 ${v.total} 家中第 ${v.rank} 名`,
    img_verified: "✓ 已通過擁有者驗證",
    img_photos: (v) => `📷 照片 ${v.n} 張`,
    img_reviews: (v) => `🔎 最近評論 ${v.days} 天前`,
    img_share_title: "MEO 診斷結果",
    img_filename: "MEO診斷",
  },
};

function t(key, vars) {
  let e = (T[LANG] && T[LANG][key] != null) ? T[LANG][key] : (T.ja[key] != null ? T.ja[key] : key);
  if (typeof e === "function") return e(vars || {});
  if (typeof e === "string" && vars) e = e.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  return e;
}

function applyStaticI18n() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const k = el.getAttribute("data-i18n");
    el.textContent = t(k);
  });
  document.querySelectorAll("[data-i18n-ph]").forEach(el => {
    const k = el.getAttribute("data-i18n-ph");
    el.setAttribute("placeholder", t(k));
  });
  const hc = document.getElementById("hero-catch");
  if (hc) hc.innerHTML = t("hero_catch_html");
  const h1 = document.getElementById("hero-h1");
  if (h1) h1.innerHTML = t("hero_h1_html");
  const steps = document.getElementById("load-steps");
  if (steps) steps.innerHTML = (t("load_steps") || []).map(s => `<li>${esc(s)}</li>`).join("");
  document.documentElement.lang = LANG;
  const sel = document.getElementById("lang-select");
  if (sel) sel.value = LANG;
}

/* 管理者バイパス：URLに ?admin=キー を付けて開くと保存し、以後の診断で1日上限をスキップ。
   解除は ?admin= を空で開くか、コンソールで localStorage.removeItem("meo_admin")。 */
const ADMIN_KEY = (() => {
  const u = new URLSearchParams(location.search);
  if (u.has("admin")) {
    const v = u.get("admin") || "";
    try { v ? localStorage.setItem("meo_admin", v) : localStorage.removeItem("meo_admin"); } catch (e) {}
    return v;
  }
  try { return localStorage.getItem("meo_admin") || ""; } catch (e) { return ""; }
})();
if (ADMIN_KEY) {
  const b = document.createElement("div");
  b.textContent = "🔑 管理者モード（上限スキップ）";
  b.style.cssText = "position:fixed;bottom:10px;right:10px;z-index:9999;background:#1a73e8;color:#fff;font-size:11px;font-weight:800;padding:6px 12px;border-radius:12px;box-shadow:0 4px 12px rgba(80,130,200,.4);opacity:.92;cursor:default";
  const add = () => document.body && document.body.appendChild(b);
  document.body ? add() : document.addEventListener("DOMContentLoaded", add);
}

const $ = (id) => document.getElementById(id);
const show = (id) => { $(id).hidden = false; };
const hide = (id) => { $(id).hidden = true; };

const LOAD_TARGET_MS = 20000; // 待ち時間の目安（約20秒）。1〜2分にしたい場合はここを増やす
const LOAD_MIN_MS = 7000;     // 最低表示時間（速くてもこの時間は演出を見せる）
// ローディング段階・カテゴリ短縮ラベルは言語に追従（t()から導出）
const LOAD_STEPS = () => t("load_steps");
const SHORT = () => ({ nap: t("cat_nap"), category: t("cat_category"), reviews: t("cat_reviews"), photos: t("cat_photos"), hours: t("cat_hours"), extras: t("cat_extras") });

let currentShare = { url: "", text: "", title: "MEO無料診断" };
let currentResult = null;

// SearchManiaへの導線設定（line/tel に値を入れると自動でボタンが出ます）
const CTA = {
  site: "https://search-mania.net/",
  email: "h.kuniyoshi@search-mania.net",
  line: "", // 例: "https://lin.ee/xxxxx"（空なら非表示）
  tel: "",   // 例: "098-000-0000"（空なら非表示）
};

$("go")?.addEventListener("click", async () => {
  const name = $("f-name").value.trim();
  const area = $("f-area").value.trim();
  const compare = $("f-compare").checked;
  $("err").hidden = true;
  if (!name || !area) { showErr(t("err_input")); return; }

  hide("input-view"); show("loading-view");
  window.scrollTo({ top: 0, behavior: "smooth" });
  const loader = startLoader();

  try {
    const resp = await fetch("/api/diagnose", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, area, compare, turnstileToken, admin: ADMIN_KEY || undefined, uiLang: LANG }),
    });
    const data = await resp.json();
    if (!resp.ok) { loader.cancel(); backToInput(errMessage(data.error)); return; }
    data._compare = compare;
    await loader.finish();
    renderResult(data);
    hide("loading-view"); show("result-view"); setHeaderTop(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (e) {
    loader.cancel(); backToInput(t("err_comm"));
  }
});

/* ===== リッチローディング（進捗バー＋待ち時間目安＋段階チェック） ===== */
function startLoader() {
  const bar = $("load-bar"), pctEl = $("load-pct"), etaEl = $("load-eta"), txt = $("loading-text");
  const stepEls = Array.from(document.querySelectorAll("#load-steps li"));
  stepEls.forEach(el => el.classList.remove("done", "active"));
  const start = performance.now();
  let done = false, raf;
  function frame() {
    const el = performance.now() - start;
    const p = done ? 100 : Math.min(96, (el / LOAD_TARGET_MS) * 100);
    bar.style.width = p.toFixed(1) + "%";
    pctEl.textContent = Math.floor(p) + "%";
    if (done) etaEl.textContent = t("load_done");
    else if (el >= LOAD_TARGET_MS) etaEl.textContent = t("load_almost");
    else etaEl.textContent = t("load_eta", { sec: Math.max(1, Math.ceil((LOAD_TARGET_MS - el) / 1000)) });
    const steps = LOAD_STEPS();
    txt.textContent = steps[Math.min(steps.length - 1, Math.floor(p / (100 / steps.length)))];
    stepEls.forEach((s, i) => {
      const top = (i + 1) / stepEls.length * 100, bot = i / stepEls.length * 100;
      s.classList.toggle("done", p >= top);
      s.classList.toggle("active", p < top && p >= bot);
    });
    if (!(done && p >= 100)) raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return {
    cancel() { cancelAnimationFrame(raf); },
    async finish() {
      const el = performance.now() - start;
      if (el < LOAD_MIN_MS) await new Promise(r => setTimeout(r, LOAD_MIN_MS - el));
      done = true;
      await new Promise(r => setTimeout(r, 650));
      cancelAnimationFrame(raf);
    },
  };
}

function backToInput(msg) { hide("loading-view"); show("input-view"); setHeaderTop(false); showErr(msg); resetTurnstile(); }
function setHeaderTop(on) { const b = document.getElementById("hdr-top"); if (b) b.classList.toggle("show", on); }
function resetTurnstile() { try { window.turnstile && window.turnstile.reset(); } catch (e) {} turnstileToken = ""; }
function showErr(msg) { const e = $("err"); e.textContent = msg; e.hidden = false; }
function errMessage(code) {
  const map = {
    not_found: "err_not_found",
    rate_limited: "err_rate_limited",
    bot_check_failed: "err_bot_check_failed",
    missing_fields: "err_missing_fields",
    upstream_error: "err_upstream_error",
  };
  return t(map[code] || "err_default");
}

/* ===== ランク / 総評 ===== */
function rankOf(total) {
  if (total >= 90) return { l: "S", label: t("rank_excellent"), c: "#34A853" };
  if (total >= 75) return { l: "A", label: t("rank_good"), c: "#4285F4" };
  if (total >= 60) return { l: "B", label: t("rank_almost"), c: "#FBBC05" };
  if (total >= 45) return { l: "C", label: t("rank_improve"), c: "#FB8C00" };
  return { l: "D", label: t("rank_action"), c: "#EA4335" };
}
function weakestCat(d) {
  return [...d.profile.categories].sort((a, b) => a.score / a.max - b.score / b.max)[0];
}
function healthOf(total) {
  if (total >= 80) return { icon: "🟢", sky: "☀️", label: t("health_great"), c: "#34A853" };
  if (total >= 60) return { icon: "🟡", sky: "⛅", label: t("health_almost"), c: "#FBBC05" };
  return { icon: "🔴", sky: "🌧", label: t("health_action"), c: "#EA4335" };
}

/* ⚠️ 放置リスクの推移グラフ（改善した場合=緑 / 放置=赤 を時系列で対比） */
function riskChart(base, gain, decline) {
  const W = 340, H = 190, pl = 16, pr = 16, pt = 18, pb = 30;
  const pw = W - pl - pr, ph = H - pt - pb;
  const up = [base, base + gain * 0.5, base + gain * 0.85, base + gain].map(v => Math.min(100, Math.round(v)));
  const dn = [base, base - decline * 0.4, base - decline * 0.7, base - decline].map(v => Math.max(0, Math.round(v)));
  const all = [...up, ...dn];
  let lo = Math.max(0, Math.min(...all) - 6), hi = Math.min(100, Math.max(...all) + 6);
  if (hi - lo < 18) { hi = Math.min(100, lo + 18); lo = Math.max(0, hi - 18); }
  const X = i => pl + pw * (i / 3);
  const Y = v => pt + ph * (1 - (v - lo) / (hi - lo));
  const line = arr => arr.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  const dots = (arr, cls) => arr.map((v, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="3.6" class="${cls}"/>`).join("");
  const labels = t("risk_x");
  const xlab = labels.map((l, i) => `<text x="${X(i).toFixed(1)}" y="${H - 9}" class="rc-x">${esc(l)}</text>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="risk-graph">
    <path d="${line(dn)}L${X(3).toFixed(1)},${Y(lo).toFixed(1)}L${X(0).toFixed(1)},${Y(lo).toFixed(1)}Z" class="rc-dn-fill"/>
    <path d="${line(up)}" class="rc-up"/>
    <path d="${line(dn)}" class="rc-dn"/>
    ${dots(up, "rc-d-up")}${dots(dn, "rc-d-dn")}
    <text x="${X(3).toFixed(1)}" y="${(Y(up[3]) - 9).toFixed(1)}" class="rc-v rc-v-up">${esc(t("risk_pts", { n: up[3] }))}</text>
    <text x="${X(3).toFixed(1)}" y="${(Y(dn[3]) + 17).toFixed(1)}" class="rc-v rc-v-dn">${esc(t("risk_pts", { n: dn[3] }))}</text>
    ${xlab}
  </svg>`;
}
function verdictText(d) {
  const total = d.profile.total, w = SHORT()[weakestCat(d).key] || weakestCat(d).label;
  let head;
  if (total >= 90) head = t("verdict_90");
  else if (total >= 75) head = t("verdict_75");
  else if (total >= 60) head = t("verdict_60");
  else if (total >= 45) head = t("verdict_45");
  else head = t("verdict_0");
  return `${head}${t("verdict_tail", { weak: w })}`;
}

/* ===== SVGグラフ ===== */
function donutSVG(color) {
  const R = 54, C = (2 * Math.PI * R).toFixed(1);
  const gid = "dg-" + Math.random().toString(36).slice(2, 7);
  return `<svg class="donut" viewBox="0 0 140 140">
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.65"/>
        <stop offset="100%" stop-color="${color}"/>
      </linearGradient>
      <filter id="${gid}-shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="2.5"/>
        <feOffset dy="3"/><feComponentTransfer><feFuncA type="linear" slope=".35"/></feComponentTransfer>
        <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <circle cx="70" cy="70" r="${R}" fill="none" stroke="rgba(120,160,210,.18)" stroke-width="14"/>
    <circle class="donut-val" cx="70" cy="70" r="${R}" fill="none" stroke="url(#${gid})" stroke-width="14"
      stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 70 70)"
      filter="url(#${gid}-shadow)"/>
    <text x="70" y="78" text-anchor="middle" class="donut-num" id="dnum" fill="${color}">0</text>
    <text x="70" y="98" text-anchor="middle" class="donut-sub">/ 100</text>
  </svg>`;
}
function radarSVG(cats) {
  const cx = 100, cy = 100, R = 60, n = cats.length;
  const pt = (ratio, i) => { const a = (-90 + i * 360 / n) * Math.PI / 180; return [cx + R * ratio * Math.cos(a), cy + R * ratio * Math.sin(a)]; };
  const grid = [1, 0.66, 0.33].map(r => {
    const pts = cats.map((_, i) => pt(r, i).map(v => v.toFixed(1)).join(",")).join(" ");
    return `<polygon points="${pts}" fill="none" stroke="rgba(120,160,210,.22)" stroke-width="1"/>`;
  }).join("");
  const axes = cats.map((_, i) => { const [x, y] = pt(1, i); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="rgba(120,160,210,.22)"/>`; }).join("");
  const valPts = cats.map((c, i) => pt(Math.max(0.05, c.score / c.max), i).map(v => v.toFixed(1)).join(",")).join(" ");
  const dots = cats.map((c, i) => { const [x, y] = pt(Math.max(0.05, c.score / c.max), i); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="#4285F4"/>`; }).join("");
  const labels = cats.map((c, i) => {
    const [x, y] = pt(1.28, i);
    return `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" text-anchor="middle" class="radar-lbl">${esc(SHORT()[c.key] || c.label)}</text>`;
  }).join("");
  return `<svg class="radar" viewBox="-22 -22 244 244">
    <defs>
      <radialGradient id="rgrad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="rgba(66,133,244,.45)"/>
        <stop offset="100%" stop-color="rgba(123,92,255,.18)"/>
      </radialGradient>
      <filter id="rglow"><feGaussianBlur stdDeviation="3.2" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    ${grid}${axes}
    <polygon class="radar-val" points="${valPts}" fill="url(#rgrad)" stroke="#4285F4" stroke-width="2.6"
      stroke-linejoin="round" filter="url(#rglow)"/>
    ${dots}${labels}</svg>`;
}

/* ===== SearchManiaへの導線（CTA） ===== */
// B. 競合差を突くCTA（1位以外のとき）
function ctaGap(d) {
  if (!d.ranking || d.ranking.rank <= 1) return "";
  const gap = d.prediction && d.prediction.nextRank ? d.prediction.nextRank.gap : null;
  return `<div class="cta-gap">
    <span class="cg-ico">⚔️</span>
    <div>${t("cta_gap", { total: d.ranking.total, rank: d.ranking.rank, gap })}
    <a href="${CTA.site}" target="_blank" rel="noopener">${t("cta_gap_link")}</a></div>
  </div>`;
}
// C. 自分でやる vs プロに任せる
function ctaVs() {
  return `<div class="glass vs-card">
    <div class="g-head"><span class="g-ico">🤔</span>${t("vs_head")}</div>
    <table class="vs"><thead><tr><th></th><th>${t("vs_self")}</th><th class="vs-pro">${t("vs_pro")}</th></tr></thead><tbody>
      <tr><td>${t("vs_r1_h")}</td><td>${t("vs_r1_self")}</td><td class="vs-pro">${t("vs_r1_pro")}</td></tr>
      <tr><td>${t("vs_r2_h")}</td><td>${t("vs_r2_self")}</td><td class="vs-pro">${t("vs_r2_pro")}</td></tr>
      <tr><td>${t("vs_r3_h")}</td><td>${t("vs_r3_self")}</td><td class="vs-pro">${t("vs_r3_pro")}</td></tr>
      <tr><td>${t("vs_r4_h")}</td><td>${t("vs_r4_self")}</td><td class="vs-pro">${t("vs_r4_pro")}</td></tr>
    </tbody></table></div>`;
}
// D. 末尾の強い相談セクション
function ctaFinal() {
  const lineHref = CTA.line || CTA.site; // LINE URL未設定時はサイトへフォールバック
  return `<div class="glass final-cta">
    <div class="fc-head">${t("fc_head")}</div>
    <p class="fc-sub">${t("fc_sub")}</p>
    <div class="fc-benefits"><span>${t("fc_benefit1")}</span><span>${t("fc_benefit2")}</span><span>${t("fc_benefit3")}</span></div>
    <div class="fc-btns">
      <a class="fc-btn fc-primary" href="${CTA.site}" target="_blank" rel="noopener">${t("fc_primary")}</a>
      <a class="fc-btn fc-line" href="${lineHref}" target="_blank" rel="noopener">${t("fc_line")}</a>
    </div>
  </div>`;
}

/* ===== レポート部品（本診断・競合診断で共用） ===== */
function buildChips(d) {
  const chips = [];
  if (d.verified === true) chips.push(`<span class="chip ok">${t("chip_verified")}</span>`);
  else if (d.verified === false) chips.push(`<span class="chip warn">${t("chip_unverified")}</span>`);
  if (d.photosCount != null) {
    const rec = d.recPhotos || 50;
    const okP = d.photosCount >= rec;
    chips.push(`<span class="chip ${okP ? "ok" : "warn"}">${t("chip_photos", { n: d.photosCount, ok: okP, rec })}</span>`);
  }
  if (d.reviewActivity && d.reviewActivity.latestDays != null) {
    const a = d.reviewActivity;
    const okR = a.latestDays <= 60;
    chips.push(`<span class="chip ${okR ? "ok" : "warn"}">${t("chip_reviews", { days: a.latestDays, pace: a.monthlyPace != null ? a.monthlyPace : null })}</span>`);
  }
  return chips.length ? `<div class="chips">${chips.join("")}</div>` : "";
}
function buildPred(d) {
  const pr = d.prediction;
  if (!pr) return "";
  const gapNames = (pr.topGaps || []).map(g => t("pred_gap_name", { cat: SHORT()[g.key] || g.label, gain: g.gain }));
  return `
    <div class="glass pred-card">
      <div class="g-head"><span class="g-ico">🔮</span>${t("pred_head")}</div>
      <div class="note">${t("pred_note")}</div>
      <ul class="predlist">
        ${pr.scoreGain > 0 && gapNames.length
          ? `<li>${t("pred_score_gaps", { gain: pr.scoreGain, cur: d.profile.total, pot: pr.potentialScore, names: gapNames.join(LANG === "ja" ? "・" : ", ") })}</li>`
          : pr.scoreGain > 0
            ? `<li>${t("pred_score_plain", { gain: pr.scoreGain, cur: d.profile.total, pot: pr.potentialScore })}</li>`
            : (d.ranking && d.ranking.rank > 3)
              ? `<li>${t("pred_score_top_lift", { cur: d.profile.total })}</li>`
              : `<li>${t("pred_score_top_keep", { cur: d.profile.total })}</li>`}
        ${pr.nextRank
          ? `<li>${t("pred_rank", { gap: pr.nextRank.gap, total: pr.nextRank.total, rank: pr.nextRank.rank, pace: pr.monthlyPace || 0 })}</li>`
          : ""}
        ${pr.reviewIn6m != null
          ? `<li>${t("pred_review6m", { now: pr.reviewNow, pace: pr.monthlyPace, in6m: pr.reviewIn6m, milestone: pr.nextMilestone || 0, months: pr.monthsToMilestone != null ? pr.monthsToMilestone : null })}</li>`
          : pr.nextMilestone != null
            ? `<li>${t("pred_review_goal", { now: pr.reviewNow, milestone: pr.nextMilestone })}</li>`
            : ""}
      </ul>
    </div>`;
}
function buildRisk(d) {
  const pr = d.prediction;
  const hoursCat = d.profile.categories.find(c => c.key === "hours");
  const revCat = d.profile.categories.find(c => c.key === "reviews");
  const hoursDecay = hoursCat ? Math.min(hoursCat.score, hoursCat.max * 0.5) : 0;
  const revDecay = revCat ? revCat.score * 0.3 : 0;
  const decline = Math.round(hoursDecay + revDecay);
  const base = d.profile.total;
  const gain = pr ? pr.scoreGain : 0;
  if (!pr || decline < 1) return "";
  const riskItems = [];
  if (hoursDecay >= 1) riskItems.push({ t: t("risk_item_hours_t"), d: t("risk_item_hours_d", { n: Math.round(hoursDecay) }) });
  if (revDecay >= 1) riskItems.push({ t: t("risk_item_rev_t"), d: t("risk_item_rev_d", { n: Math.round(revDecay) }) });
  riskItems.push({ t: t("risk_item_misc_t"), d: t("risk_item_misc_d") });
  return `
    <div class="glass risk-card">
      <div class="g-head"><span class="g-ico">⚠️</span>${t("risk_head")}</div>
      <div class="note">${t("risk_note")}</div>
      ${riskChart(base, gain, decline)}
      <div class="rc-legend"><span class="lg lg-up">${t("risk_legend_up")}</span><span class="lg lg-dn">${t("risk_legend_dn")}</span></div>
      <ul class="risklist">
        ${riskItems.map(x => `<li><b>${esc(x.t + t("risk_item_join"))}</b>${esc(x.d)}</li>`).join("")}
      </ul>
      <div class="risk-warn">${t("risk_warn", { decline, diff: (base + gain) - (base - decline) })}</div>
    </div>`;
}
function buildStrong(d) {
  const strong = [];
  [...d.profile.categories].sort((a, b) => (b.score / b.max) - (a.score / a.max))
    .forEach(c => { if (c.score / c.max >= 0.8) strong.push(SHORT()[c.key] || c.label); });
  if (d.verified === true) strong.push(t("str_owner"));
  if (d.photosCount != null && d.photosCount >= (d.recPhotos || 200)) strong.push(t("str_photos"));
  if (d.reviewActivity && d.reviewActivity.latestDays != null && d.reviewActivity.latestDays <= 30) strong.push(t("str_reviews"));
  return strong.length ? `
    <div class="glass strengths-card">
      <div class="g-head"><span class="g-ico">✨</span>${t("str_head")}</div>
      <div class="str-tags">${strong.slice(0, 6).map(s => `<span class="str-tag">${esc(s)}</span>`).join("")}</div>
      <div class="note">${t("str_note")}</div>
    </div>` : "";
}
// 競合用：アニメに依存しない静的ドーナツ
function donutSVGStatic(color, total) {
  const R = 54, C = 2 * Math.PI * R;
  const off = (C * (1 - total / 100)).toFixed(1);
  const gid = "dgs-" + Math.random().toString(36).slice(2, 7);
  return `<svg class="donut" viewBox="0 0 140 140">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity=".65"/><stop offset="100%" stop-color="${color}"/>
    </linearGradient></defs>
    <circle cx="70" cy="70" r="${R}" fill="none" stroke="rgba(120,160,210,.18)" stroke-width="14"/>
    <circle class="donut-val" cx="70" cy="70" r="${R}" fill="none" stroke="url(#${gid})" stroke-width="14"
      stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off}" transform="rotate(-90 70 70)"/>
    <text x="70" y="78" text-anchor="middle" class="donut-num" fill="${color}">${total}</text>
    <text x="70" y="98" text-anchor="middle" class="donut-sub">/ 100</text>
  </svg>`;
}
// 競合の「同等の調査結果」（アクションプラン・CTA・シェア等は出さない）
function competitorReportHTML(d) {
  const r = rankOf(d.profile.total), health = healthOf(d.profile.total);
  return `<div class="comp-report">
    <div class="cr-head">${t("comp_report_head", { name: esc(d.name) })}</div>
    <div class="cr-sub">${esc(d.address || d.area)}</div>
    ${buildChips(d)}
    <div class="report-grid">
      <div class="glass score-card">
        <div class="g-head"><span class="g-ico">🎯</span>${t("score_head")}</div>
        ${donutSVGStatic(r.c, d.profile.total)}
        <div class="rankbadge" style="background:${r.c}">${t("rank_suffix", { l: r.l })}<small>${r.label}</small></div>
        <div class="health" style="border-color:${health.c}55"><span class="health-ico">${health.icon}${health.sky}</span>${t("health_head")}${LANG === "ja" ? "：" : ": "}<b style="color:${health.c}">${health.label}</b></div>
      </div>
      <div class="glass">
        <div class="g-head"><span class="g-ico">💬</span>${t("verdict_head")}</div>
        <p class="verdict">${esc(verdictText(d))}</p>
      </div>
    </div>
    <div class="glass">
      <div class="g-head"><span class="g-ico">⚖️</span>${t("balance_head")}</div>
      ${radarSVG(d.profile.categories)}
      <div class="note">${t("balance_note", { weak: esc(SHORT()[weakestCat(d).key] || weakestCat(d).label) })}</div>
    </div>
    ${buildStrong(d)}
    ${buildPred(d)}
    ${buildRisk(d)}
  </div>`;
}

/* ===== メイン描画 ===== */
function renderResult(d) {
  const r = rankOf(d.profile.total);
  const health = healthOf(d.profile.total);
  // 順位を主役にした分かりやすい表現（「上位90%」のような誤解を招く表記は使わない）
  let benchHTML = "";
  if (d.ranking) benchHTML = `<div class="benchmark">${t("bench_simple", { total: d.ranking.total, rank: d.ranking.rank })}</div>`;

  const BADGE = { high: { t: t("badge_high"), cls: "pri-high" }, mid: { t: t("badge_mid"), cls: "pri-mid" }, info: { t: t("badge_info"), cls: "pri-info" } };
  // 言語切替時もアクションプランが切り替わるよう、現在の言語のtipsを使う（無ければ診断時の言語）
  const tipsList = (d.tipsByLang && d.tipsByLang[LANG]) || d.tipsVisible || [];
  const plan = tipsList.map((tip) => {
    const b = BADGE[tip.level] || BADGE.mid;
    return `<li><div class="tip-head"><span class="pri ${b.cls}">${b.t}</span><b>${esc(tip.title)}</b></div><div class="tip-detail">${esc(tip.detail)}</div></li>`;
  }).join("");
  const lockedPlan = d.tipsLockedCount > 0
    ? `<li class="more">${t("plan_more", { n: d.tipsLockedCount })}</li>` : "";

  // 実データ補足チップ・予測・リスク・強み（部品関数で生成＝競合診断と共用）
  const chipsHTML = buildChips(d);
  const predHTML = buildPred(d);
  const riskHTML = buildRisk(d);
  const strongHTML = buildStrong(d);

  // 🎚 効果シミュレーター（改善項目をトグルで想定スコアが動く）
  const simCats = d.profile.categories.filter(c => c.score / c.max < 0.85);
  const simHTML = simCats.length ? `
    <div class="glass">
      <div class="g-head"><span class="g-ico">🎚</span>${t("sim_head")}</div>
      <div class="note">${t("sim_note")}</div>
      <div class="sim-score">${t("sim_score_label")} <b id="sim-val">${d.profile.total}</b><small> / 100</small></div>
      <div class="sim-opts">
        ${simCats.map(c => `<label class="sim-opt"><input type="checkbox" class="sim-cb" data-gain="${((0.85 - c.score / c.max) * c.max).toFixed(2)}"><span>${esc(t("sim_opt", { cat: SHORT()[c.key] || c.label }))}</span></label>`).join("")}
      </div>
    </div>` : "";


  // ===== エリア内ランキング（表彰台＋順位リスト） =====
  const rankRow = (e) => `
    <div class="comp ${e.you ? "you" : ""}">
      <div class="comp-top">
        <span class="comp-name"><span class="rank-no${e.rank <= 3 ? " top" : ""}">${e.rank}</span>${e.you ? `<span class="you-badge">${t("comp_you_badge")}</span>` : ""}${esc(e.name)}${!e.you ? `<button class="comp-diag" data-name="${esc(e.name)}">${t("comp_diag_btn")}</button>` : ""}</span>
        <span class="comp-idx">${t("comp_index", { n: e.index })}</span>
      </div>
      ${(e.rating != null || e.reviews != null) ? `<div class="comp-meta">${e.rating != null ? `★${e.rating}` : ""}${e.reviews != null ? `${e.rating != null ? " ・ " : ""}${t("comp_reviews", { n: e.reviews })}` : ""}</div>` : ""}
      <div class="comp-bar"><i data-w="${Math.max(4, Math.min(100, e.index))}"></i></div>
    </div>`;
  let ranking;
  if (d.ranking) {
    const me = { name: d.name, index: d.prominence, rating: d.rating, reviews: d.reviewCount, you: true };
    const comps = d.ranking.competitors.map(c => ({ name: c.name, index: c.index, rating: c.rating, reviews: c.reviews, you: false }));
    const all = [me, ...comps].sort((a, b) => b.index - a.index).map((x, i) => ({ ...x, rank: i + 1 }));
    const medals = ["🥇", "🥈", "🥉"];
    const top3 = all.slice(0, 3);
    const order = top3.length === 3 ? [top3[1], top3[0], top3[2]] : top3.length === 2 ? [top3[1], top3[0]] : top3;
    const podBlock = (e) => `
      <div class="pod pod-r${e.rank} ${e.you ? "you" : ""}">
        <div class="pod-card">
          ${e.you ? `<span class="pod-you">${t("comp_you_badge")}</span>` : ""}
          <div class="pod-medal">${medals[e.rank - 1]}</div>
          <div class="pod-name">${esc(e.name)}</div>
          <div class="pod-score">${t("comp_index", { n: e.index })}</div>
          ${!e.you ? `<button class="comp-diag pod-diag" data-name="${esc(e.name)}">${t("comp_diag_btn")}</button>` : ""}
        </div>
        <div class="pod-step"><span class="pod-rank">${e.rank}</span></div>
      </div>`;
    const podium = `<div class="podium pod-n${order.length}">${order.map(podBlock).join("")}</div>`;
    const rest = all.slice(3);
    const shown = rest.slice(0, 6);
    const meRank = all.find(x => x.you).rank;
    const tail = (meRank > 3 && !shown.some(x => x.you)) ? all.find(x => x.you) : null;
    const list = (shown.length || tail) ? `<div class="rank-list">
      ${shown.map(rankRow).join("")}
      ${tail ? `<div class="rank-sep">⋯</div>${rankRow(tail)}` : ""}
    </div>` : "";
    ranking = `
    <div class="glass">
      <div class="g-head"><span class="g-ico">📊</span>${t("ranking_head", { total: d.ranking.total, rank: d.ranking.rank })}</div>
      <details class="note-details"><summary class="note-summary">${LANG === "ja" ? "※ 算出方法・注意事項" : LANG === "en" ? "* Notes" : LANG === "ko" ? "※ 주의 사항" : "※ 注意事項"}</summary><div class="note">${t("ranking_note_full")}</div></details>
      ${podium}
      ${list}
      <div id="comp-map" class="comp-map"></div>
    </div>`;
  } else {
    ranking = `
    <div class="glass"><div class="g-head"><span class="g-ico">📊</span>${t("ranking_head_plain")}</div>
      <div class="note">${t("ranking_note_plain")}</div>
      ${rankRow({ name: d.name, index: d.prominence, rating: d.rating, reviews: d.reviewCount, you: true, rank: 1 })}</div>`;
  }

  $("result-view").innerHTML = `
    <div class="report-hero">
      <div class="rh-deco rh-deco-l"></div>
      <div class="rh-deco rh-deco-r"></div>
      <div class="rh-eyebrow"><span class="rh-eye-line"></span><span class="rh-eye-text">MEO DIAGNOSTIC REPORT</span><span class="rh-eye-line"></span></div>
      <h1 class="rh-title">${t("report_title")}</h1>
      <div class="rh-card">
        <div class="rh-name">${esc(d.name)}</div>
        <div class="rh-addr">${esc(d.address || d.area)}</div>
        ${d.investigatedAt ? `<div class="rh-date"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>${esc(d.investigatedAt)} <span class="rh-date-sub">${t("rh_date_sub")}</span></div>` : ""}
        ${chipsHTML}
      </div>
    </div>
    <details class="note-details note-details-main">
      <summary class="note-summary"><span class="obj-ico">🔍</span>${LANG === "ja" ? "この診断についての注意事項" : LANG === "en" ? "About this diagnostic" : LANG === "ko" ? "이 진단에 대한 주의 사항" : "關於此診斷的注意事項"}</summary>
      ${d.investigatedAt ? `<p class="freshness-note" style="text-align:left;margin:8px 0 4px">${t("freshness_note")}</p>` : ""}
      <p class="obj-note-body">${t("obj_note")}</p>
    </details>

    <div class="section-head sec-seibi">
      <span class="sec-num">1</span>
      <div class="sec-txt"><span class="sec-eyebrow">PART 1</span><b>${t("part2_t")}</b><small>${t("part2_s")}</small></div>
    </div>

    ${ranking}

    <div id="compare-host"></div>

    <div id="comp-reports"></div>

    ${ctaGap(d)}

    <div class="section-head sec-chimei">
      <span class="sec-num">2</span>
      <div class="sec-txt"><span class="sec-eyebrow">PART 2</span><b>${t("part1_t")}</b><small>${t("part1_s")}</small></div>
    </div>

    <div class="report-grid">
      <div class="glass score-card">
        <div class="g-head"><span class="g-ico">🎯</span>${t("score_head")}</div>
        ${donutSVG(r.c)}
        <div class="rankbadge" style="background:${r.c}">${t("rank_suffix", { l: r.l })}<small>${r.label}</small></div>
        <div class="health" style="border-color:${health.c}55"><span class="health-ico">${health.icon}${health.sky}</span>${t("health_head")}${LANG === "ja" ? "：" : ": "}<b style="color:${health.c}">${health.label}</b></div>
      </div>
      <div class="glass">
        <div class="g-head"><span class="g-ico">💬</span>${t("verdict_head")}</div>
        <p class="verdict">${esc(verdictText(d))}</p>
      </div>
    </div>

    <div class="report-grid">
      <div class="glass">
        <div class="g-head"><span class="g-ico">⚖️</span>${t("balance_head")}</div>
        ${radarSVG(d.profile.categories)}
        <div class="note">${t("balance_note", { weak: esc(SHORT()[weakestCat(d).key] || weakestCat(d).label) })}</div>
      </div>
      <div class="glass plan">
        <div class="g-head"><span class="g-ico">📝</span>${t("plan_head")}</div>
        <ul class="planlist">${plan}${lockedPlan}</ul>
        ${d.tipsLockedCount > 0 ? `<div class="subtle-cta"><a href="#">${t("plan_mail_cta")}</a></div>` : ""}
      </div>
    </div>

    ${strongHTML}

    ${predHTML}

    ${riskHTML}

    ${simHTML}

    ${ctaVs()}

    ${ctaFinal()}

    <div class="glass share">
      <div class="g-head"><span class="g-ico">📤</span>${t("share_head")}</div>
      <div class="share-btns">
        <button class="sh sh-primary" onclick="shareNative()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4"/><path d="M8 8l4-4 4 4"/><path d="M5 12v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6"/></svg>
          <span>${t("share_native")}</span>
        </button>
        <div class="sh-row">
          <button class="sh sh-img" onclick="saveImage()" aria-label="${t("share_img")}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="M21 15l-4.5-4.5L5 21"/></svg>
            <span>${t("share_img")}</span>
          </button>
          <button class="sh sh-line" onclick="shareLine()" aria-label="LINE">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C6.5 3 2 6.7 2 11.2c0 4 3.6 7.4 8.4 8 .33.07.78.22.9.5.1.26.07.66.03.92l-.14.86c-.04.26-.2.99.88.54 1.08-.46 5.8-3.42 7.9-5.86C21.5 14.5 22 12.9 22 11.2 22 6.7 17.5 3 12 3zM8 13.6H6.2c-.26 0-.47-.21-.47-.47V9.5c0-.26.21-.47.47-.47s.47.21.47.47v3.16H8c.26 0 .47.21.47.47s-.21.47-.47.47zm1.8-.47c0 .26-.21.47-.47.47s-.47-.21-.47-.47V9.5c0-.26.21-.47.47-.47s.47.21.47.47v3.63zm4.5 0c0 .2-.13.38-.32.44a.5.5 0 0 1-.15.02c-.15 0-.29-.07-.38-.19l-1.86-2.53v2.26c0 .26-.21.47-.47.47s-.47-.21-.47-.47V9.5c0-.2.13-.38.32-.44.05-.02.1-.02.15-.02.15 0 .29.07.38.19l1.86 2.53V9.5c0-.26.21-.47.47-.47s.47.21.47.47v3.63zm3-2.29c.26 0 .47.21.47.47s-.21.47-.47.47h-1.32v.88h1.32c.26 0 .47.21.47.47s-.21.47-.47.47h-1.8c-.25 0-.46-.21-.46-.47V9.5c0-.26.21-.47.47-.47h1.8c.25 0 .46.21.46.47s-.21.47-.47.47h-1.32v.88h1.32z"/></svg>
            <span>${t("share_line")}</span>
          </button>
          <button class="sh sh-x" onclick="shareX()" aria-label="${t("share_x")}">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 2H22l-7.3 8.3L23 22h-6.8l-5.3-6.9L4.8 22H1.7l7.8-8.9L1 2h6.9l4.8 6.4L18.9 2zm-1.2 18h1.9L7.1 4H5.1l12.6 16z"/></svg>
            <span>${t("share_x")}</span>
          </button>
          <button class="sh sh-copy" onclick="copyShare()" aria-label="${t("share_copy")}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/></svg>
            <span>${t("share_copy")}</span>
          </button>
        </div>
      </div>
      <div id="sh-toast" class="sh-toast" hidden></div>
    </div>

    <div class="nav-btns">
      <button class="navbtn re" onclick="reSearch()">${t("nav_re")}</button>
      <button class="navbtn top" onclick="goTop()">${t("nav_top")}</button>
    </div>

    <div class="foot">${t("foot_html")}</div>`;

  // シェアデータ
  const url = location.origin + "/?" + new URLSearchParams({ name: d.name, area: d.area, compare: d._compare ? "1" : "0" }).toString();
  currentShare = { url, text: t("share_text", { name: d.name, total: d.profile.total, l: r.l }), title: t("share_title") };
  history.replaceState(null, "", url);

  // アニメ起動
  countUp($("dnum"), d.profile.total);
  requestAnimationFrame(() => {
    const ring = document.querySelector(".donut-val");
    if (ring) { const C = parseFloat(ring.getAttribute("stroke-dasharray")); ring.style.strokeDashoffset = (C * (1 - d.profile.total / 100)).toFixed(1); }
    const rv = document.querySelector(".radar-val"); if (rv) rv.classList.add("in");
    document.querySelectorAll(".comp-bar i").forEach(el => { el.style.width = el.dataset.w + "%"; });
  });

  // ✨ スクロールフェードイン（初期表示はずらし、スクロール入りは即時）
  let _animI = 0;
  const _obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      _obs.unobserve(e.target);
      e.target.classList.add("anim-in");
    });
  }, { threshold: 0.04 });
  $("result-view").querySelectorAll(".glass, .section-head, .podium").forEach(el => {
    const inView = el.getBoundingClientRect().top < window.innerHeight * 1.05;
    if (inView) el.style.animationDelay = Math.min(_animI++ * 0.06, 0.24) + "s";
    el.classList.add("anim-target");
    _obs.observe(el);
  });

  // 🎚 効果シミュレーターのライブ更新
  const simBase = d.profile.total;
  document.querySelectorAll(".sim-cb").forEach(cb => cb.addEventListener("change", () => {
    let s = simBase;
    document.querySelectorAll(".sim-cb:checked").forEach(c => s += parseFloat(c.dataset.gain));
    const el = document.getElementById("sim-val"); if (el) el.textContent = Math.min(100, Math.round(s));
  }));

  // 📊 整備度くらべ：競合の「整備度を調査」ボタン
  compareList = [{ name: d.name, total: d.profile.total, you: true }];
  document.querySelectorAll(".comp-diag").forEach(b => b.addEventListener("click", () => diagnoseCompetitor(b.dataset.name, b)));
  renderCompare();
  initCompMap(d);

  currentResult = d;
}

/* 🗺 競合マップ（Google Maps） */
let _compMap = null;
function initCompMap(d) {
  const el = document.getElementById("comp-map");
  if (!el || typeof google === "undefined" || !google.maps) return;

  const places = [];
  if (d.location) places.push({ lat: d.location.lat, lng: d.location.lng, name: d.name, index: d.prominence, you: true });
  if (d.ranking) {
    d.ranking.competitors.forEach(c => {
      if (c.location) places.push({ lat: c.location.lat, lng: c.location.lng, name: c.name, index: c.index, you: false });
    });
  }
  if (places.length === 0) { el.style.display = "none"; return; }

  const sorted = [...places].sort((a, b) => b.index - a.index).map((p, i) => ({ ...p, rank: i + 1 }));
  const you = sorted.find(m => m.you);
  _compMap = null;

  const center = you ? { lat: you.lat, lng: you.lng } : { lat: sorted[0].lat, lng: sorted[0].lng };
  _compMap = new google.maps.Map(el, {
    center, zoom: 15,
    mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
  });

  const bounds = new google.maps.LatLngBounds();
  sorted.forEach(m => {
    const rankBg = m.rank === 1 ? "#FBBC05" : m.rank === 2 ? "#9E9E9E" : m.rank === 3 ? "#CD7F32" : "#888";
    const bg = m.you ? "#1a73e8" : rankBg;
    const sz = m.you ? 36 : 30;
    const svgPin = `<svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${sz}"><circle cx="${sz/2}" cy="${sz/2}" r="${sz/2-2}" fill="${bg}" stroke="white" stroke-width="2.5"/><text x="${sz/2}" y="${sz/2+5}" text-anchor="middle" fill="white" font-size="${m.you ? 14 : 12}" font-weight="800" font-family="sans-serif">${m.rank}</text></svg>`;
    const marker = new google.maps.Marker({
      position: { lat: m.lat, lng: m.lng },
      map: _compMap,
      icon: {
        url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svgPin),
        scaledSize: new google.maps.Size(sz, sz),
        anchor: new google.maps.Point(sz / 2, sz / 2),
      },
      title: m.name,
    });
    const iw = new google.maps.InfoWindow({ content: `<b>${esc(m.name)}</b><br>#${m.rank}` });
    marker.addListener("click", () => iw.open(_compMap, marker));
    bounds.extend({ lat: m.lat, lng: m.lng });
  });

  if (sorted.length > 1) {
    _compMap.fitBounds(bounds, 28);
    if (you) google.maps.event.addListenerOnce(_compMap, "idle", () => _compMap.panTo({ lat: you.lat, lng: you.lng }));
  }
}

/* 📊 整備度くらべ（TOPに戻らず競合の整備度を調査して横並び比較） */
let compareList = [];
function renderCompare() {
  const host = document.getElementById("compare-host");
  if (!host) return;
  if (compareList.length < 2) { host.innerHTML = ""; return; }
  const sorted = [...compareList].sort((a, b) => b.total - a.total);
  const rows = sorted.map((x) => {
    const rk = rankOf(x.total);
    return `<div class="cmp ${x.you ? "you" : ""}">
      <div class="cmp-top"><span class="cmp-name">${x.you ? `<span class="you-badge">${t("comp_you_badge")}</span>` : ""}${esc(x.name)}</span>
        <span class="cmp-score" style="color:${rk.c}">${x.total}<small> /100${LANG === "ja" ? "・" : " · "}${rk.l}</small></span></div>
      <div class="cmp-bar"><i style="width:${Math.max(3, x.total)}%;background:${rk.c}"></i></div>
    </div>`;
  }).join("");
  host.innerHTML = `<div class="glass cmp-card">
    <div class="g-head"><span class="g-ico">📊</span>${t("cmp_head")}</div>
    <div class="note">${t("cmp_note")}</div>
    ${rows}</div>`;
}

async function diagnoseCompetitor(name, btn) {
  if (!name || !currentResult) return;
  if (compareList.some(x => x.name === name)) { document.getElementById("compare-host")?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
  const label = btn.innerHTML;
  btn.disabled = true; btn.classList.add("loading"); btn.textContent = t("cmp_diag_loading");
  try {
    const token = await getFreshToken();
    const resp = await fetch("/api/diagnose", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, area: currentResult.area, compare: false, turnstileToken: token, admin: ADMIN_KEY || undefined, uiLang: LANG }),
    });
    const data = await resp.json();
    if (!resp.ok) { btn.disabled = false; btn.classList.remove("loading"); btn.innerHTML = label; toast(errMessage(data.error)); return; }
    compareList.push({ name: data.name, total: data.profile.total });
    btn.classList.remove("loading"); btn.classList.add("done"); btn.textContent = t("cmp_diag_done");
    renderCompare();
    // フル調査結果（同等・アクションプランは除く）を下部に追加
    const host = document.getElementById("comp-reports");
    if (host) {
      const wrap = document.createElement("div");
      wrap.innerHTML = competitorReportHTML(data);
      const node = wrap.firstElementChild;
      host.appendChild(node);
      requestAnimationFrame(() => { node.querySelectorAll(".radar-val").forEach(el => el.classList.add("in")); });
      node.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  } catch (e) {
    btn.disabled = false; btn.classList.remove("loading"); btn.innerHTML = label; toast(t("err_comm"));
  }
}

/* 競合調査用に新しいTurnstileトークンを取得（管理者は不要） */
function getFreshToken() {
  if (ADMIN_KEY) return Promise.resolve("");
  return new Promise((resolve) => {
    let done = false;
    const fin = (t) => { if (!done) { done = true; resolve(t || ""); } };
    tokenWaiters.push(fin);
    try { window.turnstile && window.turnstile.reset(); } catch (e) {}
    setTimeout(() => fin(turnstileToken), 8000);
  });
}

/* 🖼 結果カード画像を生成して保存/共有 */
function roundRect(x, a, b, w, h, r) {
  x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r);
  x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath();
}
window.saveImage = () => {
  const d = currentResult; if (!d) return;
  const r = rankOf(d.profile.total);
  const W = 800, H = 980;
  const cv = document.createElement("canvas"); cv.width = W * 2; cv.height = H * 2;
  const c = cv.getContext("2d"); c.scale(2, 2);

  /* ── 背景 ── */
  const bg = c.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#dbeafe"); bg.addColorStop(1, "#bfdbfe");
  c.fillStyle = bg; c.fillRect(0, 0, W, H);

  /* ── ヘッダー（青パネル） ── */
  const hg = c.createLinearGradient(0, 0, W, 0);
  hg.addColorStop(0, "#1e40af"); hg.addColorStop(1, "#2563eb");
  c.fillStyle = hg; roundRect(c, 0, 0, W, 190, 0); c.fill();
  c.textAlign = "center";
  c.fillStyle = "rgba(255,255,255,.5)"; c.font = "600 13px sans-serif";
  c.fillText("MEO DIAGNOSTIC REPORT ・ SearchMania", W / 2, 36);
  const nm = d.name.length > 18 ? d.name.slice(0, 18) + "…" : d.name;
  c.fillStyle = "#fff"; c.font = "bold 30px sans-serif"; c.fillText(nm, W / 2, 86);
  c.fillStyle = "rgba(255,255,255,.62)"; c.font = "15px sans-serif";
  c.fillText(d.address || d.area, W / 2, 118);
  if (d.investigatedAt) {
    c.fillStyle = "rgba(255,255,255,.38)"; c.font = "13px sans-serif";
    c.fillText("調査日 " + d.investigatedAt, W / 2, 155);
  }

  /* ── スコアカード ── */
  c.fillStyle = "rgba(255,255,255,.86)"; roundRect(c, 28, 206, W - 56, 264, 20); c.fill();
  /* ドーナツ */
  const CX = 178, CY = 340, R = 88;
  c.lineWidth = 17;
  c.beginPath(); c.arc(CX, CY, R, 0, Math.PI * 2);
  c.strokeStyle = "rgba(120,160,210,.18)"; c.stroke();
  c.beginPath(); c.lineCap = "round";
  c.arc(CX, CY, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (d.profile.total / 100));
  c.strokeStyle = r.c; c.stroke(); c.lineWidth = 1;
  c.textAlign = "center";
  c.fillStyle = r.c; c.font = "bold 58px sans-serif"; c.fillText(String(d.profile.total), CX, CY + 20);
  c.fillStyle = "#8aa3c2"; c.font = "16px sans-serif"; c.fillText("/ 100", CX, CY + 46);
  /* ランクバッジ */
  c.fillStyle = r.c; roundRect(c, CX - 54, CY + 64, 108, 36, 18); c.fill();
  c.fillStyle = "#fff"; c.font = "bold 16px sans-serif";
  c.fillText(t("rank_suffix", { l: r.l }) + "  " + r.label, CX, CY + 88);
  /* 仕切り */
  c.beginPath(); c.moveTo(300, 224); c.lineTo(300, 452);
  c.strokeStyle = "rgba(120,160,210,.18)"; c.lineWidth = 1; c.stroke();
  /* 右側テキスト */
  c.textAlign = "left";
  c.fillStyle = "#7b9dc4"; c.font = "600 13px sans-serif"; c.fillText("整備スコア", 328, 248);
  c.fillStyle = r.c; c.font = "bold 42px sans-serif"; c.fillText(d.profile.total + "点", 328, 296);
  if (d.ranking) {
    c.fillStyle = "#7b9dc4"; c.font = "600 13px sans-serif"; c.fillText("エリア内ランキング（知名度）", 328, 340);
    c.fillStyle = "#1a73e8"; c.font = "bold 42px sans-serif"; c.fillText(d.ranking.rank + "位", 328, 388);
    c.fillStyle = "#5b7aa3"; c.font = "15px sans-serif"; c.fillText("近隣 " + d.ranking.total + " 店中", 328, 416);
  }

  /* ── ステータスチップ ── */
  const chips = [];
  if (d.verified) chips.push("✓ オーナー認証済み");
  if (d.photosCount != null) chips.push("写真 " + d.photosCount + "枚");
  if (d.reviewActivity && d.reviewActivity.latestDays != null) chips.push("直近クチコミ " + d.reviewActivity.latestDays + "日前");
  if (d.rating != null) chips.push("★" + d.rating + "  （" + (d.reviewCount || 0) + "件）");
  chips.slice(0, 4).forEach((s, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const bx = 36 + col * 376, by = 492 + row * 58;
    c.fillStyle = "rgba(255,255,255,.82)"; roundRect(c, bx, by, 356, 44, 14); c.fill();
    c.fillStyle = "#22406b"; c.font = "600 16px sans-serif"; c.textAlign = "center";
    c.fillText(s, bx + 178, by + 27);
  });

  /* ── フッター ── */
  c.textAlign = "center";
  c.fillStyle = "rgba(255,255,255,.55)"; c.font = "600 13px sans-serif";
  c.fillText("MEO無料診断ツール powered by", W / 2, 870);
  c.fillStyle = "#1a73e8"; c.font = "bold 22px sans-serif";
  c.fillText("SearchMania Inc.  ·  meo.search-mania.net", W / 2, 904);

  cv.toBlob((blob) => {
    if (!blob) return;
    const file = new File([blob], t("img_filename") + ".png", { type: "image/png" });
    // iOS のみ share（共有シートに「写真に保存」がある）
    // Android は <a download> → Downloads フォルダ → ギャラリーに反映
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    if (isIOS && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: t("img_share_title") }).catch(() => {});
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = t("img_filename") + "_" + d.name + ".png";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      toast(t("toast_img_saved"));
    }
  });
};

function countUp(el, target) {
  if (!el) return;
  let v = 0; const step = Math.max(1, Math.round(target / 40));
  const t = setInterval(() => { v += step; if (v >= target) { v = target; clearInterval(t); } el.textContent = v; }, 25);
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

/* ===== シェア ===== */
window.shareNative = async () => {
  if (navigator.share) { try { await navigator.share(currentShare); } catch (e) {} }
  else { copyShare(); }
};
window.shareLine = () => { window.open("https://line.me/R/msg/text/?" + encodeURIComponent(currentShare.text + "\n" + currentShare.url), "_blank"); };
window.shareX = () => { window.open("https://twitter.com/intent/tweet?text=" + encodeURIComponent(currentShare.text) + "&url=" + encodeURIComponent(currentShare.url), "_blank"); };
window.copyShare = async () => {
  try { await navigator.clipboard.writeText(currentShare.url); toast(t("toast_copied")); }
  catch (e) { toast(t("toast_copy_failed")); }
};
function toast(msg) { const t = $("sh-toast"); if (!t) return; t.textContent = msg; t.hidden = false; setTimeout(() => { t.hidden = true; }, 2000); }

/* ===== ナビゲーション ===== */
window.reSearch = () => backToTop(false); // 入力値を残して再調査
window.goTop = () => backToTop(true);      // 入力をクリアしてTOPへ
function backToTop(clear) {
  hide("result-view"); hide("loading-view"); show("input-view"); setHeaderTop(false);
  if (clear) { $("f-name").value = ""; $("f-area").value = ""; $("f-compare").checked = true; }
  $("err").hidden = true;
  resetTurnstile();
  if (location.search) history.replaceState(null, "", location.pathname); // 共有URLの再自動実行を防ぐ
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ===== i18n 言語セレクター＆初期適用 ===== */
(function initI18n() {
  applyStaticI18n();
  const sel = document.getElementById("lang-select");
  if (sel) sel.addEventListener("change", (e) => {
    const v = e.target.value;
    if (v !== "ja" && v !== "en" && v !== "ko" && v !== "zh") return;
    LANG = v;
    try { localStorage.setItem("meo_lang", LANG); } catch (e) {}
    applyStaticI18n();
    // 結果ビューが表示中なら、その場で現在の言語で再描画
    const rv = document.getElementById("result-view");
    if (rv && !rv.hidden && currentResult) renderResult(currentResult);
  });
})();

/* ===== 共有URLから自動実行 ===== */
(function initFromQuery() {
  const p = new URLSearchParams(location.search);
  const name = p.get("name"), area = p.get("area");
  if (!name || !area || !$("f-name")) return;
  $("f-name").value = name;
  $("f-area").value = area;
  if (p.get("compare") === "0") $("f-compare").checked = false;
  let tries = 0;
  const iv = setInterval(() => {
    if (turnstileToken) { clearInterval(iv); $("go").click(); }
    else if (++tries > 30) { clearInterval(iv); }
  }, 300);
})();

/* ===== 背景：Googleカラーのネットワークアニメ ===== */
(function bgNetwork() {
  const cv = document.getElementById("bg-net");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  const COLORS = ["#4285F4","#EA4335","#FBBC05","#34A853","#9b5cf6","#E91E93","#0abde3","#FF9500"];
  let w, h, pts;
  function resize() {
    w = cv.width = window.innerWidth;
    h = cv.height = window.innerHeight;
    const n = Math.max(32, Math.min(80, Math.floor(w * h / 18000)));
    pts = Array.from({ length: n }, (_, i) => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.55, vy: (Math.random() - 0.5) * 0.55,
      c: COLORS[i % COLORS.length],
    }));
  }
  function loop() {
    ctx.clearRect(0, 0, w, h);
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
    }
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j], dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy);
        if (d < 150) {
          ctx.globalAlpha = (1 - d / 150) * 0.55;
          ctx.strokeStyle = a.c; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
    for (const p of pts) { ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, 6.3); ctx.fill(); }
    requestAnimationFrame(loop);
  }
  window.addEventListener("resize", resize);
  resize(); loop();
})();
