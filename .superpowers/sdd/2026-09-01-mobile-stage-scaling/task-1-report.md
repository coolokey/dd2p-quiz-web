# Task 1：裝置辨識備援

## 測試結果

- RED：`node --test tests/battle-orientation.test.mjs`；`15` 項中 `13` 項通過、`2` 項失敗。新增的未知識別窄觸控裝置辨識與控制器測試依預期失敗，原因是實作尚未使用螢幕尺寸。
- GREEN：`node --test tests/battle-orientation.test.mjs`；`15/15` 通過、`0` 失敗。
- 品質檢查：`git diff --check` 通過。

## 變更檔案

- `tests/battle-orientation.test.mjs`
  - `fakeBrowser` 的 `screenRef` 加入 `width` 與 `height`。
  - 新增未知識別字串窄觸控螢幕的裝置辨識與控制器生命週期測試。
  - 桌機控制器測試明確使用 `1920×1080` 螢幕尺寸。
- `web/js/battle-orientation.mjs`
  - `isMobileBattleDevice` 以觸控點數與螢幕短邊 `<= 1024` 作為未知識別字串的行動載具備援。
  - 控制器以實際 `screen` 參與裝置辨識。

## 規格符合性

- 已保留已知行動裝置辨識規則。
- 未知識別字串的窄觸控螢幕會判定為行動載具。
- Windows 觸控筆電在寬螢幕下維持桌機判定。
- 行動載具進入對戰會請求全螢幕並鎖定 `landscape`，離場會解除方向鎖定。

## Commit

`fix: detect mobile battle browsers with touch fallback`

## Fix round 1

- 原因：螢幕短邊 fallback 未排除 Windows 平台，會將 `1366×768` Windows 觸控筆電誤判為行動載具。
- RED：新增 `1366×768`、`Win32`、`maxTouchPoints: 10` 回歸測試；執行 `node --test tests/battle-orientation.test.mjs`，`15` 項通過、`1` 項失敗（預期 `false`、實際 `true`）。
- GREEN：以 `/^Win/i` 排除 fallback；執行 `node --test tests/battle-orientation.test.mjs`，`16/16` 通過。
- 影響範圍：僅修改 `web/js/battle-orientation.mjs` 的 fallback 條件與 `tests/battle-orientation.test.mjs` 的 Windows 回歸測試；已知 Android／iOS／iPad 與 Linux 未知 UA 窄觸控判定不變。
- 修正 commit：`fix: detect mobile battle browsers with touch fallback`。
