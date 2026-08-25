# Task 3：可取消的電腦玩家實作報告

## RED

先建立 `tests/cpu-player.test.mjs`，涵蓋三種難度設定、依答對率選擇答案，以及取消後舊計時器不得提交答案。

執行：

```text
node --test tests/cpu-player.test.mjs
```

結果：FAIL；模組尚不存在，Node 回報 `ERR_MODULE_NOT_FOUND`（`web/js/cpu-player.mjs`）。

## GREEN

新增 `web/js/cpu-player.mjs`，提供 brief 指定的：

- `CPU_DIFFICULTIES`
- `getCpuDelay`
- `chooseCpuAnswer`
- `createCpuController`（以 generation 防止取消後的舊計時器提交答案）

focused 測試：

```text
node --test tests/cpu-player.test.mjs
```

結果：PASS，3 tests、0 failures。

完整測試：

```text
npm test
```

結果：PASS，89 tests、0 failures、0 cancelled、0 skipped。

## 變更檔案

- `tests/cpu-player.test.mjs`
- `web/js/cpu-player.mjs`
- 本報告檔案

## 自我審查

- 難度數值、未知難度 fallback、延遲邊界與錯誤選項選擇均依 brief 實作。
- `schedule` 會先取消既有計時器；`cancel` 增加世代編號並清除計時器；舊 callback 即使被手動觸發也不會呼叫 `onAnswer`。
- `git diff --check` 通過，未發現空白錯誤。
- 未修改既有檔案或既有行為。

## 疑慮

目前沒有已知疑慮。控制器的題目格式假設與 brief 相同，且 `question.choices` 至少包含一個錯誤選項。
