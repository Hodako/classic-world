const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function storage() {
  const data = new Map();
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) };
}

function load(path, globals = {}, functionName) {
  let source = fs.readFileSync(path, 'utf8');
  if (functionName) {
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    const fn = file.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === functionName);
    source = fn.getText(file);
  }
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, console, ...globals });
  return exports;
}

test('Bluetooth keyboard scanner matches complete codes and preserves leading zeroes', () => {
  const { findProductsByScannedCode: find } = load('src/lib/pos-hardware.ts');
  const products = [{ id: 'one', barcode: '00123' }, { id: 'two', barcode: '123' }, { id: 'old', barcode: '00123', archived: true }];
  assert.equal(find(products, '00123')[0].id, 'one');
  assert.equal(find(products, ' 123 ')[0].id, 'two');
  assert.equal(find(products, 'prefix00123').length, 0);
  assert.equal(find([...products, { id: 'duplicate', barcode: '00123' }], '00123').length, 2);
  assert.equal(find([{ id: 'sku', sku: 'SKU-1' }], 'sku-1')[0].id, 'sku');
});

test('HID key streams support Enter and Tab, Bluetooth delays, and repeated items', () => {
  const { createHidScanBuffer } = load('src/lib/pos-hardware.ts');
  for (const suffix of ['Enter', 'Tab']) {
    const scanner = createHidScanBuffer(suffix);
    let at = 1000;
    for (let scan = 0; scan < 2; scan++) {
      for (const key of '00123') { at += 150; assert.equal(scanner.push(key, at), null); }
      assert.equal(scanner.push(suffix, at + 150), '00123');
      at += 150;
    }
    scanner.push('x', at + 1);
    scanner.reset();
    assert.equal(scanner.push(suffix, at + 2), null);
    scanner.push('1', at + 10);
    scanner.push('2', at + 1000);
    assert.equal(scanner.push(suffix, at + 1010), null);
  }
});

test('flexible bank loans keep zero installments and reject negative principal', async () => {
  const records = [];
  const { fsCreateBankLoan } = load('src/lib/firestore-service.ts', {
    db: {}, collection: (_db, name) => name,
    addDoc: async (name, value) => { records.push({ name, value }); return { id: 'loan-1' }; },
    Timestamp: { now: () => 1 },
  }, 'fsCreateBankLoan');
  await fsCreateBankLoan({ bank_name: 'Existing lender', principal_amount: 1000, total_repayable: 1000, has_installments: false, total_installments: 0, receive_to_cashbox: true });
  assert.equal(records[0].value.total_installments, 0);
  assert.equal(records[0].value.installment_amount, 0);
  assert.equal(records[0].value.bank_name, 'Existing lender');
  assert.equal(records[1].value.amount, 1000);
  await assert.rejects(fsCreateBankLoan({ principal_amount: -1 }), /valid loan/);
  assert.equal(records.length, 2);
});

test('scanner suffix and print preferences survive independent updates and old settings', () => {
  const localStorage = storage();
  const hardware = load('src/lib/pos-hardware.ts', { localStorage, window: { dispatchEvent() {} }, Event: class {} });
  localStorage.setItem('classicworld_pos_hardware_v1', '{"printMode":"automatic"}');
  assert.equal(hardware.getPosHardwareSettings().scannerSuffix, 'Enter');
  hardware.savePosHardwareSettings({ scannerSuffix: 'Tab' });
  assert.equal(hardware.getPosHardwareSettings().printMode, 'automatic');
  hardware.savePosHardwareSettings({ printMode: 'manual' });
  assert.equal(hardware.getPosHardwareSettings().scannerSuffix, 'Tab');
  localStorage.setItem('classicworld_pos_hardware_v1', 'null');
  assert.equal(hardware.getPosHardwareSettings().printMode, 'manual');
});

test('expired cached products are not reused, fresh products remain available', () => {
  const localStorage = storage();
  const cache = load('src/lib/query-cache.ts', { localStorage, window: {} });
  cache.writeQueryCache(['products'], [{ id: 'fresh' }]);
  assert.equal(cache.readQueryCache(['products'])[0].id, 'fresh');
  localStorage.setItem('df-cache:["products"]', JSON.stringify({ data: ['old'], updatedAt: Date.now() - 31 * 86400000 }));
  assert.equal(cache.readQueryCache(['products']), undefined);
});

test('invalid saved print margins never produce NaN in receipt CSS', () => {
  const localStorage = storage();
  const paper = load('src/lib/pos-print.ts', { localStorage, window: {} });
  localStorage.setItem('dreamfashion_pos_paper_config', '{"marginMm":"invalid"}');
  assert.equal(paper.getPosPaperConfig().marginMm, 1);
  localStorage.setItem('dreamfashion_pos_paper_config', '{"marginMm":0}');
  assert.equal(paper.getPosPaperConfig().marginMm, 0);
});

test('accepting payment by cart ID counts each sale once and repeat acceptance adds no cash', async () => {
  const items = [
    { id: 'sale-a', value: { cart_id: 'cart-1', type: 'bkash', paid_amount: 100 } },
    { id: 'sale-b', value: { cart_id: 'cart-1', type: 'bkash', paid_amount: 200 } },
  ];
  const snapshot = item => ({ id: item.id, ref: { id: item.id }, data: () => item.value });
  const docs = items.map(snapshot);
  const logs = [];
  const { fsAcceptDigitalPayment } = load('src/lib/firestore-service.ts', {
    db: {}, doc: (_db, _col, id) => ({ id }),
    getDoc: async ref => { const item = items.find(i => i.id === ref.id); return { exists: () => !!item, data: () => item?.value }; },
    collection: (_db, name) => name, query: () => ({}), where: () => ({}),
    getDocs: async () => ({ empty: false, docs, forEach: callback => docs.forEach(callback) }),
    updateDoc: async (ref, patch) => Object.assign(items.find(i => i.id === ref.id).value, patch),
    addDoc: async (_col, data) => logs.push(data), Timestamp: { now: () => 1 },
  }, 'fsAcceptDigitalPayment');
  await fsAcceptDigitalPayment('cart-1');
  assert.equal(logs.length, 1);
  assert.equal(logs[0].amount, 300);
  await fsAcceptDigitalPayment('cart-1');
  assert.equal(logs.length, 1);
});

test('courier collection uses quantity and discount and does not credit twice on retry', async () => {
  const sale = { sell_price: 100, qty: 3, discount: 20, courier_status: 'pending' };
  const logs = [];
  const { fsApproveCourierPayment } = load('src/lib/firestore-service.ts', {
    db: {}, doc: () => ({}), getDoc: async () => ({ exists: () => true, data: () => sale }),
    updateDoc: async (_ref, patch) => Object.assign(sale, patch),
    collection: () => ({}), addDoc: async (_ref, log) => logs.push(log), Timestamp: { now: () => 1 },
  }, 'fsApproveCourierPayment');
  await fsApproveCourierPayment('sale-courier');
  assert.equal(sale.paid_amount, 280);
  assert.equal(logs[0].amount, 280);
  await fsApproveCourierPayment('sale-courier');
  assert.equal(logs.length, 1);
});
