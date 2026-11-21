# DDP 網路雙人對戰架構與部署說明（Cloudflare Workers × Supabase）

本分支（`feat/online-battle`）以 `origin/main` 已完成版本為基底，在完整保留既有「玩家 VS 電腦」與「本機雙人對戰」的前提下，新增第三種模式「網路雙人對戰」。

## 系統架構

```
瀏覽器 A（紅隊） ──┐                          ┌──▶ Supabase PostgreSQL
                  ├──▶ Cloudflare Worker ────┤     public.ddp_online_rooms
瀏覽器 B（藍隊） ──┘     (online-worker/)      └──▶ Atomic SECURITY DEFINER RPCs
```

1. **純前端靜態網頁（`web/`）**：
   - 新增 `web/js/online/` 模組（`online-config.mjs`、`room-code.mjs`、`online-transport.mjs`、`online-controller.mjs`、`online-views.mjs`）。
   - 兩端依伺服器產生的 `questionSeed` 以確定性 PRNG（Mulberry32）搭配既有的答案位置平衡袋，產生完全一致的題序與選項排列。
   - 不包含任何 Supabase 金鑰或管理憑證；僅與 Cloudflare Worker HTTPS 端點通訊。
2. **Cloudflare Worker（`online-worker/src/worker.mjs`）**：
   - 驗證所有輸入與 6 碼房間格式，將 `resumeToken` 以 SHA-256 雜湊後呼叫 Supabase PostgREST RPC。
   - 採 `redirect: 'manual'` 與 8 秒逾時保護，且絕不向瀏覽器洩漏金鑰或上游錯誤原文。
3. **Supabase PostgreSQL（`online-worker/supabase/schema.sql`）**：
   - 啟用 RLS 且不授予 `anon` 直接讀寫資料表權限，所有變更皆透過 `SECURITY DEFINER` RPC（`set search_path = ''`）執行。
   - 搶答（`ddp_online_submit_answer`）、選角、準備開局、到期結算與再戰皆以 `SELECT ... FOR UPDATE` 鎖定該房間列，避免兩人同時搶答產生競態條件。
   - 房間僅保存暫時性狀態（未開局 30 分鐘、結束後 15 分鐘自動清理），無登入帳號與個人資料。

## 啟用與部署流程

1. 於 Supabase 專案（`adnuyyhfxnzwfqmhizcr`）SQL Editor 執行 [`online-worker/supabase/schema.sql`](../online-worker/supabase/schema.sql)。
2. 參考 [`online-worker/README.md`](../online-worker/README.md) 建立本機 `online-worker/secrets.local.json`（不進 Git）並執行：
   ```powershell
   cd online-worker
   npx --yes wrangler@4.156.0 deploy --secrets-file secrets.local.json
   ```
3. 將部署後的 Worker 網址填入 `web/js/online/online-config.mjs` 的 `DEFAULT_ONLINE_API_URL`，或在遊戲內「網路雙人對戰 → 伺服器設定」貼上網址並測試連線。
