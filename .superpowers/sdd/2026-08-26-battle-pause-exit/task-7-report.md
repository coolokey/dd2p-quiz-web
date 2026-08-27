# Task 7：完整回歸與本機瀏覽器驗收報告

- 驗收日期：2026-08-27
- 分支：`codex/battle-pause-exit`
- 本機網址：`http://localhost:4190/`
- 瀏覽器：Codex in-app Browser；另開新分頁，未覆蓋使用者既有版型預覽頁
- 結論：通過。未發現可重現的 production bug，因此沒有修改 `web` production code。

## README contract RED→GREEN

1. 在 `tests/app-integration.test.mjs` 新增 README contract，要求文件說明頂端「Ⅱ 暫停」與鍵盤 `Esc`、四項暫停選單動作、後三項確認，以及直向返回首頁確認。
2. RED：`node --test tests/app-integration.test.mjs` 為 33 pass／1 fail；唯一失敗為舊 README 缺少新暫停 contract。
3. 最小更新 `README.md`，保留既有鍵盤與行動載具說明，並移除「直向 blocker 可直接返回主選單」的舊宣稱。
4. GREEN：focused suite 為 34 pass／0 fail。

## 自動化與靜態檢查

| 檢查 | 結果 |
| --- | --- |
| `npm test` | 246 tests pass、0 fail |
| `node --check web/js/app.mjs` | 通過 |
| `Get-ChildItem web/js -Filter *.mjs \| ForEach-Object { node --check $_.FullName }` | 全部模組通過 |
| `git diff --check` | 通過；僅顯示 Git 的 LF→CRLF 工作複本提示，沒有 whitespace error |

## 單人模式

- 使用「玩家 VS 電腦」、`(國小)99乘法表`、固定 10 題、神殿決鬥、玩家角色 1 驗收。
- 滑鼠暫停前後完整狀態一致：題目 `8x8=?`、四個 choices、進度 `9／10`、分數 `0：8`、HP `20：100` 與狀態文字均未改變；暫停 2.5 秒後仍完全一致。
- 繼續後 CPU 僅各執行一次合法作答；沒有同題重複提交。最後實際造成 KO，直接進入結果頁，DOM 中沒有 battle shell 或 pause modal。
- `Esc` 在 live battle 開啟「遊戲暫停」；進入「返回首頁？」確認後再按 `Esc`，只返回暫停主選單。各次切換前後題目、choices、score、HP 與 progress 一致。
- 重新開始：取消時保留 `2／10`、`1：0`、HP `100：90`；確認後保留神殿、固定 10 題、玩家角色 1，並重設為 `1／10`、`0：0`、HP `100：100`。
- 更換題庫：取消後仍在暫停主選單；確認後回到 31 份題庫清單，單人模式仍保留，重新選題時仍顯示 CPU 難度。
- 返回首頁：取消後仍在暫停主選單；確認後 battle shell 消失並回到模式選擇首頁。
- 限時制另以 15 秒、簡單 CPU 驗收：暫停時顯示 `7s`，等待 2.2 秒後仍為 `7s`；繼續 3.2 秒後為 `4s`，符合單一每秒 interval，未出現重複遞減。

## 本機雙人與輸入

- 使用角色 1／角色 2 開局，設定頁沒有 CPU 難度群組。
- 左方鍵盤以正解位置 3 實際按下 `3`：分數由 `0：0` 變為 `1：0`、右方 HP 由 100 變 90、進度由 `1／10` 變 `2／10`。
- 右方鍵盤以正解位置 1 實際按下 `0`：分數由 `1：0` 變為 `1：1`、左方 HP 由 100 變 90、進度由 `2／10` 變 `3／10`。
- 本機雙人按 `Esc` 只開啟暫停，沒有計分、扣血或推進題目。

## Viewport 與尺寸

| Viewport | 暫停鍵 computed size | 水平 overflow | modal／confirm | 遮擋 |
| --- | --- | --- | --- | --- |
| desktop landscape `1936×1048` | `69.22×48 CSS px` | 0 | 遊戲暫停與重新開始確認均可見 | 未與 progress、audio 或觸控鍵相交 |
| tablet landscape `1024×768` | `69.22×48 CSS px` | 0 | modal `460×369.59`、confirm `460×287.94` | 未與 progress、audio 或觸控鍵相交 |
| short landscape `640×360` | `51.53×48 CSS px` | 0 | modal 四個按鈕 bottom 最大 `348.59`，confirm 完整位於 viewport | 未與 progress、audio 或觸控鍵相交 |

- `640×360` 暫停 overlay 的 scroll height 為 402 px、client height 為 360 px；四個實際操作按鈕仍全數位於可視範圍，確認畫面 scroll height 為 360 px。
- 所有 viewport 的暫停按鈕高至少 48 CSS px；`640×360` 左右觸控鍵也各為 `48×48 CSS px`。
- 驗收完成後已清除 viewport override；回復 `1936×1048`，水平 overflow 仍為 0。

## Touch capability

- in-app Browser 執行頁面的根節點為 `touch-capable`；本機雙人模式實際渲染 8 個可見觸控答案鍵。
- 以可見觸控答案鍵的 pointer click 路徑實際回答 `4x9=?` 正解位置 2：分數 `1：1`→`2：1`、右方 HP `90`→`80`、進度 `3／10`→`4／10`，證明 DOM pointerdown 綁定與作答流程可用。
- Browser surface 沒有提供指定 `pointerType=touch` 或實體多點觸控手勢的能力，因此實體觸控、雙人同時觸碰仍列為未驗證，不能視為實機通過。

## 多重暫停與動畫邊界

- 在 `4／10` 手動暫停後切為 `360×640` portrait：方向 blocker 與 manual dialog 同時存在；方向 blocker 依既有 top-dialog 規則取得焦點。切回 `640×360` landscape 後，manual dialog 仍存在且焦點回到「繼續遊戲」。清除方向原因後仍維持 manual pause；最後按繼續才真正恢復。
- 攻擊動畫中只按一次暫停：動畫前分數 `2：1`、HP `90：80`、進度 `4／10`；pending 時僅一次變成 `3：1`、HP `90：70`，按鈕顯示「等待本次攻擊結束……」且尚未出現 modal；動畫收尾後進度 `5／10` 並顯示暫停選單，沒有第二次扣血或計分。
- KO 以實際單人流程驗收：HP `0` 後動畫完成直接顯示結果頁，沒有 pause modal。

## Console 與未驗證項目

- 全流程最後讀取 console warning／error：空陣列；沒有 uncaught error。
- 未驗證：真實 browser background／foreground 切換；本次依 brief 允許的替代路徑完成 portrait／landscape pause-reason 疊加。
- 未驗證：實體觸控裝置的 `pointerType=touch`、雙人同時多點觸控、安全區瀏海／圓角裝置。需用手機或平板實機最終複驗。
- 疑慮：`640×360` 暫停選單使用可垂直捲動 overlay，四個按鈕均可見，但實機安全區可能壓縮底部空間，建議列入實機複驗。
