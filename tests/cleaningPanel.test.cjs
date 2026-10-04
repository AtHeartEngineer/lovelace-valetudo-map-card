const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cleaningRows } = require('../.test-build/cleaningPanel.js');

test('shows the saved run mode, duration, timestamps, and battery endpoints', () => {
    const rows = Object.fromEntries(cleaningRows({
        finished_at: '2026-10-03T14:49:00Z', started_at: '2026-10-03T14:00:00Z',
        mode: 'vacuum_then_mop', duration: 2940, battery_start: 100, battery_end: 0,
    }, ['finished_at', 'mode', 'started_at', 'duration', 'battery_start', 'battery_end'], 'en-US'));
    assert.equal(rows.Mode, 'Vacuum then mop');
    assert.equal(rows.Duration, '49 min');
    assert.equal(rows['Battery at start'], '100%');
    assert.equal(rows['Battery at finish'], '0%');
    assert.equal(rows.Started, new Intl.DateTimeFormat('en-US', {dateStyle:'short',timeStyle:'short'}).format(new Date('2026-10-03T14:00:00Z')));
    assert.equal(rows['Last cleaned'], new Intl.DateTimeFormat('en-US', {dateStyle:'short',timeStyle:'short'}).format(new Date('2026-10-03T14:49:00Z')));
});

test('shows only requested fields and never invents values for invalid data', () => {
    assert.deepEqual(cleaningRows({duration: -1, battery_end: 101, started_at: 'unavailable'}, ['duration', 'battery_end', 'started_at']), [
        ['Duration', 'Unknown'], ['Battery at finish', 'Unknown'], ['Started', 'Unknown']
    ]);
    assert.deepEqual(cleaningRows({}, []), []);
});

const { JSDOM } = require('jsdom');
const panel = require('../.test-build/cleaningPanel.js');
test('mode selector uses supported robot options and sends an exact select service call', async () => {
    const document = new JSDOM().window.document;
    const calls = [];
    const element = panel.createModeControl(document, {state: 'vacuum', attributes: {options: ['vacuum', 'mop', 'vacuum_then_mop']}}, 'select.robot_mode', async (...args) => calls.push(args));
    const select = element.querySelector('select');
    assert.ok(select.getAttribute('aria-label'));
    assert.deepEqual([...select.options].map(o => o.textContent), ['Vacuum only', 'Mop only', 'Vacuum then mop']);
    assert.equal(calls.length, 0);
    select.value = 'mop';
    select.dispatchEvent(new document.defaultView.Event('change'));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls, [['select', 'select_option', {entity_id: 'select.robot_mode', option: 'mop'}]]);
});

test('disables unavailable mode controls and reports a failed change without losing the saved mode', async () => {
    const document = new JSDOM().window.document;
    const missing = panel.createModeControl(document, undefined, 'select.robot_mode', async () => assert.fail());
    assert.equal(missing.querySelector('select').disabled, true);
    assert.match(missing.textContent, /unavailable/);
    const element = panel.createModeControl(document, {state: 'vacuum', attributes: {options: ['vacuum', 'mop']}}, 'select.robot_mode', async () => {throw new Error('offline');});
    const select = element.querySelector('select');
    select.value = 'mop';
    select.dispatchEvent(new document.defaultView.Event('change'));
    assert.equal(select.disabled, true);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(select.value, 'vacuum');
    assert.equal(select.disabled, false);
    assert.match(element.querySelector('[role=status]').textContent, /Try again/);
});

test('a failed second change restores the last successful selection', async () => {
    const document = new JSDOM().window.document;
    let requests = 0;
    const element = panel.createModeControl(document, {state: 'vacuum', attributes: {options: ['vacuum', 'mop']}}, 'select.robot_mode', async () => {if (++requests === 2) throw new Error('offline');});
    const select = element.querySelector('select');
    select.value = 'mop'; select.dispatchEvent(new document.defaultView.Event('change'));
    await new Promise(resolve => setImmediate(resolve));
    select.value = 'vacuum'; select.dispatchEvent(new document.defaultView.Event('change'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(select.value, 'mop');
});
