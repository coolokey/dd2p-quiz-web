# 手機橫向完整戰鬥舞台高度 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 僅在手機橫向解除戰場及角色過度壓縮，桌機與平板不變。

### Task 1：手機限定高度修正

**Files:**
- Modify: `web/js/battle-orientation.mjs`、`web/js/app.mjs`、`web/assets/app.css`
- Modify: `tests/battle-orientation.test.mjs`、`tests/app-integration.test.mjs`、`tests/battle-renderer.test.mjs`

- [ ] 先寫失敗測試：Android 手機 `844 × 390` 的 `isPhoneBattleDevice` 為 true；Android 平板 `1180 × 820` 為 false；app 同步 `phone-battle-device`；CSS 有手機限定 `.arena` 高度與 `.fighter-sprite` 高度覆蓋。
- [ ] Run: `node --test tests/battle-orientation.test.mjs tests/app-integration.test.mjs tests/battle-renderer.test.mjs`。Expected: FAIL。
- [ ] 實作 `isPhoneBattleDevice`：先呼叫 `isMobileBattleDevice`，再以螢幕短邊 `<= 600` 判定。方向控制器公開 `isPhoneDevice()`。
- [ ] 對戰 render 後以 `document.documentElement.classList.toggle('phone-battle-device', orientationController.isPhoneDevice())` 同步；離場移除類別。
- [ ] 在既有矮橫式規則後新增手機限定 CSS：`.phone-battle-device.touch-capable .arena { height:clamp(220px,52vh,420px); }` 與 `.phone-battle-device.touch-capable .fighter-sprite { height:82%; }`。
- [ ] Run: `npm test` 與 `git diff --check`。Expected: all tests PASS。
- [ ] Commit with `fix: restore full battle height on phones`，推送 main，確認 GitHub Pages 成功。
