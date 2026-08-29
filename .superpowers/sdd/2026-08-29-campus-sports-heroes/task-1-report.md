# Task 1 實作報告：校園社團英雄角色名冊契約

## 實作摘要

- 在 `web/js/campus-heroes.mjs` 擴充角色 helper，為 12 位既有角色加入 `gender` 與 `artBrief`。
- 性別配置為 `female` 6 位、`male` 6 位；保留既有角色 ID、名稱、顏色、攻擊資料、場景與遊戲介面。
- 每位角色的 `artBrief` 均為唯一文字，包含角色定位、運動／校園服裝、髮型輪廓、配件與非版權專屬色彩描述。
- 在 `tests/campus-heroes.test.mjs` 新增 roster 性別平衡與 brief 唯一性測試。

## TDD 與驗證

- RED：`node --test tests/campus-heroes.test.mjs`，新增測試因 `gender` 為 `undefined` 而失敗（4 passed、1 failed）。
- GREEN：`node --test tests/campus-heroes.test.mjs`，5/5 通過。
- Self-review：`node --check web/js/campus-heroes.mjs` 通過；`git diff --check` 通過；差異僅限角色 metadata 與 roster 測試，未修改輸入、音效、暫停、題庫或戰鬥規則。

## Commit

`2815da5f11a98a68138ccf643d5f0d8a6bb32da8`
