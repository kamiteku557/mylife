# mylife 無料運用可否の調査（2026-02-25）

## 結論（先に要点）
- 現在の候補構成のうち、`Railway` をバックエンドに使う案は **恒久0円ではない**。
- `Render Free Web Service + Supabase Free + Vercel Hobby` または `Render Free Web Service + Supabase Free + Cloudflare Pages Free` なら、**制限付きで0円運用は可能**。
- ただし、無料枠を超えた場合は「課金」または「機能停止/一時停止」が発生する。常時安定運用（SLA相当）は無料構成では難しい。

---

## 1. 候補別の可否

### A. Vercel + Railway + Supabase
- 判定: **0円継続は不可（原則）**
- 根拠:
  - Railway Pricing では Free に「30日トライアル後、$1/月」と明記。
  - そのため、バックエンドを Railway に置くと継続無料にならない。

### B. Vercel + Render + Supabase
- 判定: **0円運用は可能（制限付き）**
- 根拠:
  - Render は Free web service を提供（Python web app対象）。
  - ただし 15分アイドルでスピンダウン、再起動に約1分、月750インスタンス時間など制限あり。
  - Supabase Free は2プロジェクト、無料クォータ内なら課金なし。
  - Vercel Hobby は free tier（個人・非商用向け）で、上限超過時は多くの機能で待機が必要。

### C. Cloudflare Pages + Render + Supabase
- 判定: **0円運用は可能（制限付き）**
- 根拠:
  - Cloudflare Pages Free はビルド回数など無料枠あり。
  - 静的アセット配信は無料・無制限（Functions未実行時）。
  - Functions/Workers は無料枠（日次リクエスト上限）がある。

---

## 2. 現仕様（mylife MVP）での現実性

単一ユーザー（本人のみ）・個人用途・低トラフィック前提なら、以下で0円運用できる可能性が高い。

- 推奨0円構成（Pythonバックエンド維持）
  - Frontend: Vercel Hobby **または** Cloudflare Pages Free
  - Backend: Render Free Web Service（FastAPI）
  - DB/Auth: Supabase Free

理由:
- 想定ユーザー1名で、リクエスト量・データ量とも無料枠内に収まりやすい。
- Supabaseの無料クォータ（DB 500MB/プロジェクトなど）は個人MVPでは現実的。

注意:
- Render Free はスピンダウンがあるため、最初のAPI応答が遅くなる（コールドスタート）。
- Vercel Hobby は「個人・非商用」制約がある。
- 無料枠超過時の扱いはサービスごとに異なる（停止・制限・請求）。

---

## 3. 0円を維持する運用ルール（推奨）
- 1. Railwayは使わない（使うと月額が発生しうる）
- 2. RenderはFree Web Service 1本に絞る
- 3. 大きなファイル保管を避ける（Supabase Storage 1GB無料枠を意識）
- 4. 監視は「無料枠超過前提」で、超えたら機能縮退する設計にする
- 5. 商用化する場合はVercel Hobby制約に抵触しないようPro移行を検討

---

## 4. 仕様書への反映提案
既存 `docs/spec.md` の「技術方針」の以下を更新する:
- `Backend Hosting` を `Render free または Railway free枠` から、
- `Render Free Web Service（Railwayは恒久無料ではないためMVP 0円運用対象外）` に変更。

---

## 5. 参照ソース（公式）
- Supabase: About billing on Supabase
  - https://supabase.com/docs/guides/platform/billing-on-supabase
- Supabase: Control your costs (Spend Cap)
  - https://supabase.com/docs/guides/platform/cost-control#spend-cap
- Render: Deploy for Free
  - https://render.com/docs/free
- Railway: Pricing
  - https://railway.com/pricing
- Vercel: Hobby Plan
  - https://vercel.com/docs/plans/hobby
- Vercel: Pricing
  - https://vercel.com/pricing
- Vercel: Limits
  - https://vercel.com/docs/limits
- Cloudflare Pages: Limits
  - https://developers.cloudflare.com/pages/platform/limits/
- Cloudflare Pages Functions: Pricing
  - https://developers.cloudflare.com/pages/functions/pricing/
- Cloudflare Workers: Pricing
  - https://developers.cloudflare.com/workers/platform/pricing/

