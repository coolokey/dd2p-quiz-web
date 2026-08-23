# 雙人知識對決

以 `A_QuizBase` 題庫重製的雙人同機搶答網頁遊戲。網站為純靜態 HTML、CSS 與 JavaScript，可部署至 GitHub Pages。

## 遊戲方式

1. 選擇題庫。
2. 選擇固定題數制或限時制。
3. 兩位玩家完成按鍵測試後開始。
4. 先按答案鍵者取得作答權；答對加 1 分，答錯不扣分，另一方可再答。

| 玩家 | 移動鍵 | 答題鍵 |
| --- | --- | --- |
| 左方紅隊 | `W`、`X`、`A`、`D` | `1`、`2`、`3`、`4` |
| 右方藍隊 | 方向鍵 | `0`、`-`、`=`、`\` |

## 本機執行

需要 Node.js 22 或更新版本。

```powershell
npm test
npm run convert
npm start
```

開啟 `http://localhost:3000` 即可遊玩。`npm run convert` 會從本機的 `A_QuizBase` 讀取題庫並重新建立 `web/data` 與 `web/images`。

## GitHub Pages

推送至 GitHub 的 `main` 分支後，`.github/workflows/pages.yml` 會先執行測試，確認已產生的題庫資料與圖片存在，再部署 `web` 資料夾。題庫更新時，請先在本機執行 `npm run convert`，並把更新後的 `web/data` 與 `web/images` 一併提交。首次使用時，請在該 GitHub 儲存庫的 Settings → Pages 將 Source 設為 GitHub Actions。

## 隱私

網站不讀取 `D_Dual`，不包含學生姓名、登入、雲端戰績或資料蒐集功能。
