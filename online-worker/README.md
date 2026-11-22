# DDP 知識對決 — Cloudflare Workers × Supabase 網路對戰後端

此目錄為 DDP 網路雙人對戰的獨立後端，負責房間建立、加入、角色同步、原子搶答裁定與斷線重連，不更動既有的 `cloudflare-supabase-connection-test` Worker。

## 架構說明

- **Cloudflare Worker（`src/worker.mjs` + `assets: ../web`）**：同時透過 Cloudflare Workers Static Assets 發布 `web/` 靜態網頁與 API 路由（共享同一組 `workers.dev` 網址）；Worker 驗證所有請求參數與玩家 Token（SHA-256 雜湊），轉發至 Supabase Data API RPC；瀏覽器不需持有任何 Supabase 金鑰。
- **Supabase PostgreSQL（`supabase/schema.sql`）**：
  - 資料表 `public.ddp_online_rooms` 啟用 RLS 且**不開放任何直接資料表存取**。
  - 所有操作透過 `SECURITY DEFINER` RPC（`set search_path = ''`）執行，並以 `SELECT ... FOR UPDATE` 確保兩人同時搶答時只會有一位玩家取得該題作答權。
  - 僅保存暫時性房間與分數狀態，未開局 30 分鐘、結束後 15 分鐘自動過期清理，不儲存帳號或學生個資。

## 部署步驟

### 1. 在 Supabase 建立資料表與 RPC

開啟 Supabase 專案 `adnuyyhfxnzwfqmhizcr` 的 **SQL Editor**，貼上並執行 [`supabase/schema.sql`](./supabase/schema.sql)。

### 2. 部署 Cloudflare Worker

在 `online-worker/` 目錄下建立本機 `secrets.local.json`（已被 `.gitignore` 排除，切勿提交到 Git）：

```json
{
  "SUPABASE_PUBLISHABLE_KEY": "你的_SUPABASE_PUBLISHABLE_KEY"
}
```

接著部署獨立 Worker：

```powershell
cd online-worker
npx --yes wrangler@4.156.0 deploy --secrets-file secrets.local.json
```

部署完成後可存取 `https://<你的-worker-網址>/health`，確認回傳：

```json
{
  "ok": true,
  "code": "CONNECTED",
  "service": "ddp-online-battle"
}
```

### 3. 前端連線設定

將部署後的 Worker 網址填入 `web/js/online/online-config.mjs` 的 `DEFAULT_ONLINE_API_URL`，或直接於遊戲內「網路雙人對戰 → 伺服器設定」輸入並測試連線（也支援透過網址參數 `?onlineApi=https://...` 臨時指定）。
