import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchJson, normalizeBootstrapResults } from '../web/js/resource-loader.mjs';

test('fetchJson 在 HTTP 非成功狀態時拒絕資料', async () => {
  let parsed = false;
  await assert.rejects(
    fetchJson('./missing.json', async () => ({
      ok: false,
      status: 404,
      async json() { parsed = true; return {}; },
    })),
    /HTTP 404.*missing\.json/,
  );
  assert.equal(parsed, false);
});

test('啟動資料正規化會保留已載入資料並停用不可開始的模式', () => {
  const result = normalizeBootstrapResults([
    { status: 'fulfilled', value: { quizzes: [{ id: 'math' }] } },
    { status: 'rejected', reason: new Error('manifest unavailable') },
  ]);

  assert.deepEqual(result.catalog, [{ id: 'math' }]);
  assert.deepEqual(result.manifest, { scenes: [], characters: [], sfx: {} });
  assert.equal(result.ready, false);
  assert.match(result.message, /對戰素材載入失敗/);
  assert.match(result.message, /重試/);
});

test('題庫與可用對戰素材均載入後允許開始', () => {
  const manifest = {
    scenes: [{ id: 'school' }],
    characters: [{ id: '1' }, { id: '2' }],
    sfx: {},
  };
  const result = normalizeBootstrapResults([
    { status: 'fulfilled', value: { quizzes: [{ id: 'math' }] } },
    { status: 'fulfilled', value: manifest },
  ]);

  assert.equal(result.ready, true);
  assert.equal(result.message, '');
  assert.equal(result.manifest, manifest);
});
