# 無料枠チェックリスト（mylife）

最終更新: 2026-03-01

## 1. 構成確認
- [ ] Frontend: Cloudflare Pages Free（または Vercel Hobby）
- [ ] Backend: Render Free Web Service
- [ ] DB/Auth: Supabase Free
- [ ] Railwayは使っていない

## 2. Render（無料）
- [ ] Free Web Serviceで作成した
- [ ] ヘルスチェック `/api/v1/health` が200
- [ ] アイドル時スピンダウンを許容する運用になっている
- [ ] 常時起動を前提にしたSLA期待を置いていない

## 3. Supabase（無料）
- [ ] プロジェクト数が無料枠内（2プロジェクト）
- [ ] DB容量が無料枠内（500MB/プロジェクト）
- [ ] 添付ファイル機能をMVPで無効化しStorage肥大化を防いでいる
- [ ] 認証はSupabase Authを利用している

## 4. Frontendホスティング
- [ ] Cloudflare Pages Free もしくは Vercel Hobbyで公開
- [ ] CORS設定が本番ドメインを許可
- [ ] 商用利用や制約変更時のプラン見直し方針がある

## 5. 運用ルール
- [ ] 週1回、Markdownエクスポートをローカル保管
- [ ] 重い定期バッチを導入していない（集計はオンデマンド）
- [ ] 無料枠を超える機能追加時は事前に見積もる
- [ ] Push dispatch は GitHub Actions の 5分 schedule で運用し、通知遅延（最大5分）を許容している
- [ ] GitHub Actions の実行時間（minutes）が無料枠内に収まるよう監視している
- [ ] Render / Frontend / GitHub Actions の `PUSH_DISPATCH_TOKEN` が一致している

## 6. リリース前確認
- [ ] ログインできる
- [ ] ポモドーロ記録、メモ、日記の保存ができる
- [ ] エクスポートが文字化けしない
- [ ] モバイル幅で主要画面が操作可能
