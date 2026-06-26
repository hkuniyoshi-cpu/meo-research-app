let turnstileToken = "";
let tokenWaiters = [];
window.onTurnstile = (t) => { turnstileToken = t; const w = tokenWaiters; tokenWaiters = []; w.forEach(fn => fn(t)); };

/* ===== i18n（日本語／英語） ===== */
let LANG = (() => {
  let saved = "";
  try { saved = localStorage.getItem("meo_lang") || ""; } catch (e) {}
  if (saved === "ja" || saved === "en") return saved;
  try { if (navigator.language && navigator.language.toLowerCase().startsWith("ja")) return "ja"; } catch (e) {}
  return navigator.language ? "en" : "ja";
})();

const T = {
  ja: {
    /* 静的（data-i18n） */
    hdr_tag: "Googleマップ 無料診断",
    lp_label: "SEARCHMANIA ・ MEO診断",
    hero_h1_html: '事業名＋住所で、<br><span class="grad">Googleマップ整備度</span>を<br>その場で無料診断。',
    hero_sub: "入力は2つだけ。整備スコア・競合比較・改善プランを、その場でレポート化します。",
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
    freshness_note: "※「直近クチコミ」など最新の動きは、データ更新の都合で数日〜数週間前の状態を表示する場合があります（Googleの各種レポートと同様）。最新の実状況はGoogleマップでご確認ください。",
    part1_t: "整備度", part1_s: "あなたのGoogleプロフィールの「完成度」を採点します",
    part2_t: "知名度", part2_s: "近隣同業の中での「評価・順位」と競合比較",
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
    pred_score_top: (v) => `<b>整備度は上位水準</b>：現在${v.cur}点を維持すれば、上位表示を保ちやすい状態です。`,
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
    ranking_head: (v) => `検索評価（想定）— 近隣${v.total}件中 ${v.rank}位`,
    ranking_note_full: "※整備スコア(/100)とは別の指標です。口コミ数・評価などから算出した「近隣同業内での知名度の相対値」を示します。各競合は「整備度を調査」ボタンで、TOPに戻らず整備スコアを調べて比較できます。",
    ranking_head_plain: "検索評価（想定）",
    ranking_note_plain: "※整備スコア(/100)とは別の指標です。口コミ数・評価などから算出した知名度の相対値です。",
    comp_you_badge: "調査対象",
    comp_diag_btn: "🔍 この店舗を調査",
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
    hero_h1_html: 'Enter your business name and address to<br>check your <span class="grad">Google Maps profile completeness</span><br>for free, right now.',
    hero_sub: "Just two inputs. Get a profile-completeness score, competitor comparison, and an improvement plan as an instant report.",
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
    freshness_note: "* The latest activity, such as \"recent reviews,\" may reflect a state from a few days to a few weeks ago due to data update timing (as with Google's own reports). Please check Google Maps for the most current status.",
    part1_t: "Profile completeness", part1_s: "We score how \"complete\" your Google profile is",
    part2_t: "Prominence", part2_s: "Your rating/ranking among nearby peers and competitor comparison",
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
    pred_score_top: (v) => `<b>Your completeness is top-tier</b>: maintaining your current ${v.cur} keeps you well positioned for top placement.`,
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
    ranking_head: (v) => `Search rating (estimated) — #${v.rank} of ${v.total} nearby`,
    ranking_note_full: "* This is a separate metric from the completeness score (/100). It shows a \"relative prominence value among nearby peers\" calculated from review count, rating, and more. Use the \"Check completeness\" button on each competitor to look up their completeness score and compare without leaving this page.",
    ranking_head_plain: "Search rating (estimated)",
    ranking_note_plain: "* This is a separate metric from the completeness score (/100). It's a relative prominence value calculated from review count, rating, and more.",
    comp_you_badge: "This business",
    comp_diag_btn: "🔍 Check this business",
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
  const h1 = document.getElementById("hero-h1");
  if (h1) h1.innerHTML = t("hero_h1_html");
  const steps = document.getElementById("load-steps");
  if (steps) steps.innerHTML = (t("load_steps") || []).map(s => `<li>${esc(s)}</li>`).join("");
  document.documentElement.lang = LANG;
  const tog = document.getElementById("lang-toggle");
  if (tog) tog.textContent = t("lang_label");
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
    hide("loading-view"); show("result-view");
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

function backToInput(msg) { hide("loading-view"); show("input-view"); showErr(msg); resetTurnstile(); }
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
  return `<svg class="donut" viewBox="0 0 140 140">
    <circle cx="70" cy="70" r="${R}" fill="none" stroke="rgba(120,160,210,.18)" stroke-width="14"/>
    <circle class="donut-val" cx="70" cy="70" r="${R}" fill="none" stroke="${color}" stroke-width="14"
      stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 70 70)"/>
    <text x="70" y="74" text-anchor="middle" class="donut-num" id="dnum" fill="${color}">0</text>
    <text x="70" y="92" text-anchor="middle" class="donut-sub">/ 100</text>
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
  return `<svg class="radar" viewBox="-22 -22 244 244">${grid}${axes}
    <polygon class="radar-val" points="${valPts}" fill="rgba(66,133,244,.25)" stroke="#4285F4" stroke-width="2"/>
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

/* ===== メイン描画 ===== */
function renderResult(d) {
  const r = rankOf(d.profile.total);
  const health = healthOf(d.profile.total);
  // 順位を主役にした分かりやすい表現（「上位90%」のような誤解を招く表記は使わない）
  let benchHTML = "";
  if (d.ranking) benchHTML = `<div class="benchmark">${t("bench_simple", { total: d.ranking.total, rank: d.ranking.rank })}</div>`;

  const BADGE = { high: { t: t("badge_high"), cls: "pri-high" }, mid: { t: t("badge_mid"), cls: "pri-mid" }, info: { t: t("badge_info"), cls: "pri-info" } };
  const plan = d.tipsVisible.map((tip) => {
    const b = BADGE[tip.level] || BADGE.mid;
    return `<li><div class="tip-head"><span class="pri ${b.cls}">${b.t}</span><b>${esc(tip.title)}</b></div><div class="tip-detail">${esc(tip.detail)}</div></li>`;
  }).join("");
  const lockedPlan = d.tipsLockedCount > 0
    ? `<li class="more">${t("plan_more", { n: d.tipsLockedCount })}</li>` : "";

  // 実データ補足チップ（Outscraper enrichmentがある時のみ）
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
  const chipsHTML = chips.length ? `<div class="chips">${chips.join("")}</div>` : "";

  // 今後の見通し（予測）— 店ごとに弱点・数値が変わる具体予測
  const pr = d.prediction;
  const gapNames = (pr?.topGaps || []).map(g => t("pred_gap_name", { cat: SHORT()[g.key] || g.label, gain: g.gain }));
  const predHTML = pr ? `
    <div class="glass">
      <div class="g-head"><span class="g-ico">🔮</span>${t("pred_head")}</div>
      <div class="note">${t("pred_note")}</div>
      <ul class="predlist">
        ${pr.scoreGain > 0 && gapNames.length
          ? `<li>${t("pred_score_gaps", { gain: pr.scoreGain, cur: d.profile.total, pot: pr.potentialScore, names: gapNames.join(LANG === "ja" ? "・" : ", ") })}</li>`
          : pr.scoreGain > 0
            ? `<li>${t("pred_score_plain", { gain: pr.scoreGain, cur: d.profile.total, pot: pr.potentialScore })}</li>`
            : `<li>${t("pred_score_top", { cur: d.profile.total })}</li>`}
        ${pr.nextRank
          ? `<li>${t("pred_rank", { gap: pr.nextRank.gap, total: pr.nextRank.total, rank: pr.nextRank.rank, pace: pr.monthlyPace || 0 })}</li>`
          : ""}
        ${pr.reviewIn6m != null
          ? `<li>${t("pred_review6m", { now: pr.reviewNow, pace: pr.monthlyPace, in6m: pr.reviewIn6m, milestone: pr.nextMilestone || 0, months: pr.monthsToMilestone != null ? pr.monthsToMilestone : null })}</li>`
          : pr.nextMilestone != null
            ? `<li>${t("pred_review_goal", { now: pr.reviewNow, milestone: pr.nextMilestone })}</li>`
            : ""}
      </ul>
    </div>` : "";

  // ⚠️ 放置した場合のリスク（マイナス予測シミュレーション）
  const hoursCat = d.profile.categories.find(c => c.key === "hours");
  const revCat = d.profile.categories.find(c => c.key === "reviews");
  const hoursDecay = hoursCat ? Math.min(hoursCat.score, hoursCat.max * 0.5) : 0; // 投稿停止で鮮度部分が消える
  const revDecay = revCat ? revCat.score * 0.3 : 0; // 新規クチコミが止まると鮮度評価が目減り
  const decline = Math.round(hoursDecay + revDecay);
  const base = d.profile.total;
  const gain = pr ? pr.scoreGain : 0;
  const riskItems = [];
  if (hoursDecay >= 1) riskItems.push({ t: t("risk_item_hours_t"), d: t("risk_item_hours_d", { n: Math.round(hoursDecay) }) });
  if (revDecay >= 1) riskItems.push({ t: t("risk_item_rev_t"), d: t("risk_item_rev_d", { n: Math.round(revDecay) }) });
  riskItems.push({ t: t("risk_item_misc_t"), d: t("risk_item_misc_d") });
  const riskHTML = (pr && decline >= 1) ? `
    <div class="glass risk-card">
      <div class="g-head"><span class="g-ico">⚠️</span>${t("risk_head")}</div>
      <div class="note">${t("risk_note")}</div>
      ${riskChart(base, gain, decline)}
      <div class="rc-legend"><span class="lg lg-up">${t("risk_legend_up")}</span><span class="lg lg-dn">${t("risk_legend_dn")}</span></div>
      <ul class="risklist">
        ${riskItems.map(x => `<li><b>${esc(x.t + t("risk_item_join"))}</b>${esc(x.d)}</li>`).join("")}
      </ul>
      <div class="risk-warn">${t("risk_warn", { decline, diff: (base + gain) - (base - decline) })}</div>
    </div>` : "";

  // ✨ あなたの店の強み（高スコアのカテゴリ＋良好な実データ）
  const strong = [];
  [...d.profile.categories].sort((a, b) => (b.score / b.max) - (a.score / a.max))
    .forEach(c => { if (c.score / c.max >= 0.8) strong.push(SHORT()[c.key] || c.label); });
  if (d.verified === true) strong.push(t("str_owner"));
  if (d.photosCount != null && d.photosCount >= (d.recPhotos || 200)) strong.push(t("str_photos"));
  if (d.reviewActivity && d.reviewActivity.latestDays != null && d.reviewActivity.latestDays <= 30) strong.push(t("str_reviews"));
  const strongHTML = strong.length ? `
    <div class="glass strengths-card">
      <div class="g-head"><span class="g-ico">✨</span>${t("str_head")}</div>
      <div class="str-tags">${strong.slice(0, 6).map(s => `<span class="str-tag">${esc(s)}</span>`).join("")}</div>
      <div class="note">${t("str_note")}</div>
    </div>` : "";

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


  // 知名度の上位1〜3位にメダルを付ける（自店も含めた全体の順位）
  const allIdxSorted = [d.prominence, ...(d.ranking ? d.ranking.competitors.map(c => c.index) : [])].sort((a, b) => b - a);
  const medalFor = (idx) => {
    const pos = allIdxSorted.indexOf(idx);
    return pos === 0 ? '<span class="medal">🥇</span>' : pos === 1 ? '<span class="medal">🥈</span>' : pos === 2 ? '<span class="medal">🥉</span>' : "";
  };
  const compRow = (name, rating, reviews, index, isYou) => `
    <div class="comp ${isYou ? "you" : ""}">
      <div class="comp-top">
        <span class="comp-name">${isYou ? `<span class="you-badge">${t("comp_you_badge")}</span>` : ""}${esc(name)}${!isYou ? `<button class="comp-diag" data-name="${esc(name)}">${t("comp_diag_btn")}</button>` : ""}</span>
        <span class="comp-idx">${medalFor(index)}${t("comp_index", { n: index })}</span>
      </div>
      ${(rating != null || reviews != null) ? `<div class="comp-meta">${rating != null ? `★${rating}` : ""}${reviews != null ? `${rating != null ? " ・ " : ""}${t("comp_reviews", { n: reviews })}` : ""}</div>` : ""}
      <div class="comp-bar"><i data-w="${Math.max(4, Math.min(100, index))}"></i></div>
    </div>`;
  const ranking = d.ranking ? `
    <div class="glass">
      <div class="g-head"><span class="g-ico">📊</span>${t("ranking_head", { total: d.ranking.total, rank: d.ranking.rank })}</div>
      <div class="note">${t("ranking_note_full")}</div>
      ${compRow(d.name, d.rating, d.reviewCount, d.prominence, true)}
      ${d.ranking.competitors.slice(0, 7).map(c => compRow(c.name, c.rating, c.reviews, c.index, false)).join("")}
    </div>` : `
    <div class="glass"><div class="g-head"><span class="g-ico">📊</span>${t("ranking_head_plain")}</div>
      <div class="note">${t("ranking_note_plain")}</div>
      ${compRow(d.name, d.rating, d.reviewCount, d.prominence, true)}</div>`;

  $("result-view").innerHTML = `
    <div class="report-title"><span class="g-ico">📋</span>${t("report_title")}</div>
    <div class="report-sub">${t("report_sub", { name: esc(d.name), addr: esc(d.address || d.area) })}</div>
    ${d.investigatedAt ? `<div class="report-date">${t("report_date", { date: esc(d.investigatedAt) })}</div>` : ""}
    ${chipsHTML}
    ${d.investigatedAt ? `<div class="freshness-note">${t("freshness_note")}</div>` : ""}

    <div class="section-head sec-seibi">
      <span class="sec-num">1</span>
      <div class="sec-txt"><span class="sec-eyebrow">PART 1</span><b>${t("part1_t")}</b><small>${t("part1_s")}</small></div>
    </div>

    <div class="report-grid">
      <div class="glass score-card">
        <div class="g-head"><span class="g-ico">🎯</span>${t("score_head")}</div>
        ${donutSVG(r.c)}
        <div class="rankbadge" style="background:${r.c}">${t("rank_suffix", { l: r.l })}<small>${r.label}</small></div>
        <div class="health" style="border-color:${health.c}55"><span class="health-ico">${health.icon}${health.sky}</span>${t("health_head")}${LANG === "ja" ? "：" : ": "}<b style="color:${health.c}">${health.label}</b></div>
        ${benchHTML}
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

    <div class="section-head sec-chimei">
      <span class="sec-num">2</span>
      <div class="sec-txt"><span class="sec-eyebrow">PART 2</span><b>${t("part2_t")}</b><small>${t("part2_s")}</small></div>
    </div>

    ${ranking}

    ${ctaGap(d)}

    <div id="compare-host"></div>

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

  // アニメ起動
  countUp($("dnum"), d.profile.total);
  requestAnimationFrame(() => {
    const ring = document.querySelector(".donut-val");
    if (ring) { const C = parseFloat(ring.getAttribute("stroke-dasharray")); ring.style.strokeDashoffset = (C * (1 - d.profile.total / 100)).toFixed(1); }
    const rv = document.querySelector(".radar-val"); if (rv) rv.classList.add("in");
    document.querySelectorAll(".comp-bar i").forEach(el => { el.style.width = el.dataset.w + "%"; });
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

  currentResult = d;
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
    document.getElementById("compare-host")?.scrollIntoView({ behavior: "smooth", block: "center" });
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
  const cv = document.createElement("canvas"); cv.width = 1080; cv.height = 1080;
  const x = cv.getContext("2d");
  const g = x.createLinearGradient(0, 0, 1080, 1080);
  g.addColorStop(0, "#e9f3ff"); g.addColorStop(1, "#c2dcff");
  x.fillStyle = g; x.fillRect(0, 0, 1080, 1080);
  x.textAlign = "center";
  x.fillStyle = "#1a73e8"; x.font = "bold 42px sans-serif"; x.fillText(t("img_title"), 540, 120);
  x.fillStyle = "#13294b"; x.font = "bold 50px sans-serif"; x.fillText(d.name.slice(0, 18), 540, 200);
  x.fillStyle = "#3a5a85"; x.font = "28px sans-serif"; x.fillText(d.address || d.area, 540, 248);
  const r = rankOf(d.profile.total);
  x.beginPath(); x.arc(540, 470, 150, 0, Math.PI * 2); x.lineWidth = 30; x.strokeStyle = "rgba(120,160,210,.25)"; x.stroke();
  x.beginPath(); x.lineCap = "round"; x.arc(540, 470, 150, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (d.profile.total / 100)); x.lineWidth = 30; x.strokeStyle = r.c; x.stroke();
  x.fillStyle = r.c; x.font = "bold 120px sans-serif"; x.fillText(String(d.profile.total), 540, 505);
  x.fillStyle = "#8aa3c2"; x.font = "30px sans-serif"; x.fillText("/ 100", 540, 560);
  x.fillStyle = r.c; roundRect(x, 400, 615, 280, 74, 20); x.fill();
  x.fillStyle = "#fff"; x.font = "bold 40px sans-serif"; x.fillText(t("img_rank", { l: r.l, label: r.label }), 540, 666);
  x.textAlign = "left"; x.fillStyle = "#1c3a63"; x.font = "32px sans-serif";
  const stats = [];
  const bench = d.ranking ? t("img_bench", { total: d.ranking.total, rank: d.ranking.rank }) : null;
  if (bench) stats.push("🏆 " + bench);
  if (d.verified) stats.push(t("img_verified"));
  if (d.photosCount != null) stats.push(t("img_photos", { n: d.photosCount }));
  if (d.reviewActivity && d.reviewActivity.latestDays != null) stats.push(t("img_reviews", { days: d.reviewActivity.latestDays }));
  stats.slice(0, 4).forEach((s, i) => x.fillText(s, 200, 770 + i * 56));
  x.textAlign = "center"; x.fillStyle = "#1a73e8"; x.font = "bold 32px sans-serif";
  x.fillText("SearchMania ・ search-mania.net", 540, 1020);
  cv.toBlob((blob) => {
    if (!blob) return;
    const file = new File([blob], t("img_filename") + ".png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: t("img_share_title") }).catch(() => {});
    } else {
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = t("img_filename") + "_" + d.name + ".png"; a.click();
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
  hide("result-view"); show("input-view");
  if (clear) { $("f-name").value = ""; $("f-area").value = ""; $("f-compare").checked = true; }
  $("err").hidden = true;
  resetTurnstile();
  if (location.search) history.replaceState(null, "", location.pathname); // 共有URLの再自動実行を防ぐ
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ===== i18n 言語トグル＆初期適用 ===== */
(function initI18n() {
  applyStaticI18n();
  const tog = document.getElementById("lang-toggle");
  if (tog) tog.addEventListener("click", () => {
    LANG = LANG === "ja" ? "en" : "ja";
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
  const COLORS = ["#4285F4", "#EA4335", "#FBBC05", "#34A853"];
  let w, h, pts;
  function resize() {
    w = cv.width = window.innerWidth;
    h = cv.height = window.innerHeight;
    const n = Math.max(28, Math.min(72, Math.floor(w * h / 24000)));
    pts = Array.from({ length: n }, (_, i) => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5,
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
        if (d < 140) {
          ctx.globalAlpha = (1 - d / 140) * 0.4;
          ctx.strokeStyle = a.c; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 0.85;
    for (const p of pts) { ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, 6.3); ctx.fill(); }
    requestAnimationFrame(loop);
  }
  window.addEventListener("resize", resize);
  resize(); loop();
})();
