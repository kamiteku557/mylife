# mylife MVP 仕様書 v0.1

## 1. 概要
- プロダクト名: mylife
- 目的: ポモドーロ、メモログ、日記を1つのWebアプリに集約し、PC/iOSから同じデータを使えるようにする。
- 対象ユーザー: 単一ユーザー（本人のみ）
- 運用方針: 0円運用を前提に、無料枠で成立する構成を優先する。

## 2. スコープ
### 2.1 MVPに含む機能
1. ポモドーロセッションの実行・記録
2. ポモドーロセッション設定の変更
3. ポモドーロ集計（期間別）
4. メモログの作成・閲覧（Markdown）
5. メモログ集計（タグ/期間）
6. 日記の作成・閲覧
7. 全データのMarkdownエクスポート

### 2.2 MVPに含めない機能
- 複数ユーザー対応
- SNS連携/共有
- 高度な通知連携（MVPではWeb内通知のみ）
- 課金機能

## 3. 画面仕様
1. ダッシュボード
- 今日のポモドーロ回数
- 今日のメモ件数
- 今日の日記有無
- 直近ログへのショートカット

2. ポモドーロ画面
- タイマー表示（作業/休憩種別、残り時間）
- 操作: 開始/一時停止/再開/終了
- セッション入力: タイトル、タグ
- サイクル進行: 作業→短休憩を繰り返し、指定回数後に長休憩

3. メモログ画面
- 一覧（新しい順）
- 作成/編集（Markdown）
- メモに紐づけ: 日付、タグ、関連ポモドーロセッション（任意）

4. 日記画面
- 日付ごとに1件を基本
- 作成/編集（Markdown）
- 一覧表示

5. 設定画面
- 作業時間（分）
- 短休憩時間（分）
- 長休憩時間（分）
- 長休憩に入るまでの作業回数
- エクスポート実行

## 4. ユースケースと受け入れ条件
### US-01 ポモドーロセッション実行
- 条件
  - 作業/休憩セッションを開始できる
  - 一時停止/再開/終了できる
  - セッションにタイトル・タグを付けられる
  - サイクルは以下を満たす
    - 既定: 作業25分 → 短休憩5分 × 3回
    - 4回目作業後は長休憩20分

### US-02 ポモドーロ設定変更
- 条件
  - 作業/短休憩/長休憩の長さを変更できる
  - 長休憩に入る作業回数を変更できる
  - 変更後の新規セッションに反映される

### US-03 メモログ
- 条件
  - Markdownでメモを保存できる
  - メモ一覧と詳細を表示できる
  - タグでフィルタできる

### US-04 日記
- 条件
  - 日付を指定してMarkdownで日記を書ける
  - 日付ごとに保存・再編集できる
  - 一覧表示できる

### US-05 Markdownエクスポート
- 条件
  - 任意期間のデータをMarkdownで出力できる
  - 種別（ポモドーロ/メモ/日記）を選択して出力できる
  - UTF-8で文字化けしない

## 5. データモデル
### 5.1 entities
1. users
- id (uuid, pk)
- display_name (text, nullable)
- created_at (timestamptz)

2. pomodoro_settings
- id (uuid, pk)
- user_id (uuid, fk -> users.id, unique)
- focus_minutes (int, default 25)
- short_break_minutes (int, default 5)
- long_break_minutes (int, default 20)
- long_break_every (int, default 4)
- updated_at (timestamptz)

3. pomodoro_sessions
- id (uuid, pk)
- user_id (uuid, fk)
- title (text)
- session_type (enum: focus|short_break|long_break)
- planned_seconds (int)
- actual_seconds (int)
- started_at (timestamptz)
- ended_at (timestamptz, nullable)
- status (enum: running|paused|completed|cancelled)
- cycle_index (int)
- created_at (timestamptz)

4. tags
- id (uuid, pk)
- user_id (uuid, fk)
- name (text)
- created_at (timestamptz)
- unique(user_id, name)

5. pomodoro_session_tags
- session_id (uuid, fk -> pomodoro_sessions.id)
- tag_id (uuid, fk -> tags.id)
- pk(session_id, tag_id)

6. memo_logs
- id (uuid, pk)
- user_id (uuid, fk)
- title (text)
- body_md (text)
- log_date (date)
- related_session_id (uuid, fk -> pomodoro_sessions.id, nullable)
- created_at (timestamptz)
- updated_at (timestamptz)

7. memo_log_tags
- memo_log_id (uuid, fk -> memo_logs.id)
- tag_id (uuid, fk -> tags.id)
- pk(memo_log_id, tag_id)

8. diaries
- id (uuid, pk)
- user_id (uuid, fk)
- diary_date (date)
- title (text, nullable)
- body_md (text)
- mood (smallint, nullable)
- created_at (timestamptz)
- updated_at (timestamptz)
- unique(user_id, diary_date)

## 6. API仕様（MVP）
ベース: `/api/v1`

1. pomodoro
- `POST /pomodoro/start`
- `POST /pomodoro/{id}/pause`
- `POST /pomodoro/{id}/resume`
- `POST /pomodoro/{id}/finish`
- `GET /pomodoro/sessions?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /pomodoro/summary?group_by=day|week|month`

2. settings
- `GET /settings/pomodoro`
- `PUT /settings/pomodoro`

3. memo logs
- `POST /memos`
- `GET /memos?from=&to=&tag=`
- `GET /memos/{id}`
- `PUT /memos/{id}`
- `DELETE /memos/{id}`
- `GET /memos/summary?group_by=day|week|month`

4. diaries
- `POST /diaries`
- `GET /diaries?from=&to=`
- `GET /diaries/{date}`
- `PUT /diaries/{date}`

5. export
- `POST /export/markdown`
  - request: `from`, `to`, `types: [pomodoro,memo,diary]`
  - response: markdown text または zip

## 7. 非機能要件（MVP）
- 可用性: 無料枠前提、単一ユーザー利用で実用レベル
- 性能: 主要一覧APIは通常1秒以内
- セキュリティ:
  - 認証必須
  - データはユーザー単位で分離
  - 入力はサニタイズ
- バックアップ:
  - 週1回のMarkdownエクスポートを推奨

## 8. 技術方針（0円運用前提）
- Frontend: React + Vite + TypeScript
- Backend: Python FastAPI
- DB/Auth: Supabase Postgres + Supabase Auth
- Hosting（第一候補）:
  - Frontend: Cloudflare Pages Free
  - Backend: Render Free Web Service
  - DB/Auth/Storage: Supabase Free
- Hosting（代替）:
  - Frontend: Vercel Hobby
  - Backend: Render Free Web Service
  - DB/Auth/Storage: Supabase Free
- CI: GitHub Actions（無料枠）
- 方針:
  - Railwayは恒久無料運用に向かないためMVP構成から除外

## 9. 無料運用の実装構成
1. アプリ構成
- Frontend（Cloudflare Pages or Vercel Hobby）からBackend API（Render）を呼ぶ
- Backend（FastAPI）はSupabase Postgresに接続
- 認証はSupabase Auth（メールリンク）を使用

2. ストレージ構成
- 主データ: Supabase Postgres
  - pomodoro_sessions, memo_logs, diaries, tags などを保存
- ファイルストレージ: Supabase Storage
  - 原則未使用（MVPではMarkdownをDBまたはダウンロードで扱う）
  - 必要時のみ `exports` バケットを使い、短期保持で運用
- バックアップ: ローカル保存
  - エクスポートしたMarkdown/zipをPC側にも保存する

3. 無料枠内に収める運用ルール
- Render Freeのスピンダウン（15分アイドル）を許容する
- 重い定期バッチを作らない（集計はオンデマンド）
- Markdownエクスポートは手動実行（週1目安）
- 添付ファイル機能はMVPで入れない（Storage使用量抑制）
- 単一ユーザー運用を維持する（同時アクセス増を避ける）

4. 無料運用の制約
- コールドスタートにより初回API応答が遅くなる
- 無料枠超過時は停止/制限/課金対象になりうる
- 商用化時はVercel Hobbyの制約を再確認し、必要なら有料移行

## 10. 開発優先順位
- Must
  - ポモドーロ実行・記録
  - メモログCRUD
  - 日記CRUD
  - Markdownエクスポート
- Should
  - 集計グラフ
  - タグフィルタ強化
- Could
  - PWA化（iOSホーム画面追加）

## 11. 未確定事項（次回決定）
1. 認証方法
- 候補A: Supabase Auth（メールリンク）
- 候補B: ローカル固定ユーザー（開発簡易）

2. エクスポート形式
- 候補A: 1ファイル結合Markdown
- 候補B: 種別ごとMarkdown + zip

3. 通知
- 候補A: ブラウザ通知
- 候補B: 音のみ
