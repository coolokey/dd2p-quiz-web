# 雙人知識對決

以 `A_QuizBase` 題庫重製的雙人同機搶答網頁遊戲。網站為純靜態 HTML、CSS 與 JavaScript，可部署至 GitHub Pages。

## 遊戲方式

1. 選擇題庫。
2. 選擇固定題數制或限時制。
3. 從神殿、校園、船艦三個原版場景中選擇戰場。
4. 左右玩家從 12 名原版角色中各選一名；雙方不能使用同一角色。
5. 兩位玩家完成按鍵測試後開始。
6. 先按答案鍵者取得作答權；答對加 1 分並使對手減少 10 HP，答錯不扣分、不扣血，另一方可再答。

雙方初始生命值為 100 HP。生命值歸零時立即以 KO 結束；題數或時間結束後依分數判定，平分則進入驟死題。三個場景各自搭配原版背景音樂，並包含搶答、答對、答錯、攻擊、命中、KO 與勝負音效；戰鬥畫面右上角可切換靜音。

| 玩家 | 移動鍵 | 答題鍵 |
| --- | --- | --- |
| 左方紅隊 | `W`、`X`、`A`、`D` | `1`、`2`、`3`、`4` |
| 右方藍隊 | 方向鍵 | `0`、`-`、`=`、`\` |

## 本機執行

需要 Node.js 22 或更新版本。

```powershell
npm run prepare:battle
npm run convert
npm test
npm start
```

開啟終端機顯示的本機網址即可遊玩。`npm run convert` 會從本機的 `A_QuizBase` 讀取題庫並重新建立 `web/data` 與 `web/images`。`npm run prepare:battle` 會從 `D_Unit/Game_03` 複製三個場景與背景音樂，並透過 `.tools` 內的 portable FFDec／Java 擷取 12 名角色、武器和音效；替換原始 SWF 後需重新執行此命令。

## GitHub Pages

推送至 GitHub 的 `main` 分支後，`.github/workflows/pages.yml` 會先執行測試，確認題庫與對戰素材存在，再部署 `web` 資料夾。題庫更新時，請先在本機執行 `npm run convert`；戰鬥素材更新時執行 `npm run prepare:battle`，並提交產生的網頁檔案。

## 隱私

網站不讀取 `D_Dual`，不包含學生姓名、登入、雲端戰績或資料蒐集功能。
