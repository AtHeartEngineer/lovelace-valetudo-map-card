const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
function setup(config) {
    const dom = new JSDOM('', {runScripts: 'outside-only'});
    dom.window.console.info = () => {};
    const Native = dom.window.HTMLElement;
    function HTMLElementShim() {return Reflect.construct(Native, [], this.constructor);}
    HTMLElementShim.prototype = Native.prototype;
    Object.setPrototypeOf(HTMLElementShim, Native);
    dom.window.HTMLElement = HTMLElementShim;
    dom.window.eval(fs.readFileSync('dist/valetudo-map-card.js', 'utf8'));
    const card = dom.window.document.createElement('valetudo-map-card');
    card.setConfig({vacuum: 'robot', show_map: false, ...config});
    const states = {
        'vacuum.robot': {state: 'docked', last_updated: 'fixed', attributes: {}},
        'select.robot_mode': {state: 'vacuum', last_updated: '1', attributes: {options: ['vacuum', 'mop']}},
        'sensor.robot_last_clean': {state: 'ready', last_updated: '1', attributes: {finished_at: '2026-10-03T14:49:00Z', mode: 'vacuum', duration: 2940, battery_start: 100, battery_end: 52}}
    };
    const calls = [];
    const hass = {states, locale: {language: 'en-US'}, callService: async (...args) => calls.push(args)};
    return {card, hass, calls};
}
test('new options are disabled by default', () => {
    const {card, hass, calls} = setup({});
    card.hass = hass;
    assert.equal(card.shadowRoot.querySelector('.cleaning-summary'), null);
    assert.equal(card.shadowRoot.querySelector('select'), null);
    assert.equal(calls.length, 0);
});
test('summary and mode update independently of map polling and vacuum timestamp', () => {
    const {card, hass, calls} = setup({show_last_clean: true, last_clean_entity: 'sensor.robot_last_clean', show_cleaning_mode: true, cleaning_mode_entity: 'select.robot_mode'});
    card.hass = hass;
    assert.match(card.shadowRoot.querySelector('.cleaning-summary').textContent, /49 min/);
    assert.equal(card.shadowRoot.querySelector('select').value, 'vacuum');
    hass.states['select.robot_mode'] = {...hass.states['select.robot_mode'], state: 'mop', last_updated: '2'};
    hass.states['sensor.robot_last_clean'] = {...hass.states['sensor.robot_last_clean'], last_updated: '2', attributes: {duration: 60, mode: 'mop', finished_at: '2026-10-03T15:01:00Z'}};
    card.hass = hass;
    assert.equal(card.shadowRoot.querySelector('select').value, 'mop');
    assert.match(card.shadowRoot.querySelector('.cleaning-summary').textContent, /1 min/);
    assert.equal(calls.length, 0);
});

test('saved run mode stays separate from the next selected mode and summary fields can be hidden', () => {
    const {card, hass} = setup({show_last_clean: true, last_clean_entity: 'sensor.robot_last_clean', last_clean_fields: ['mode', 'duration'], show_cleaning_mode: true, cleaning_mode_entity: 'select.robot_mode'});
    hass.states['select.robot_mode'].state = 'mop';
    card.hass = hass;
    const summary = card.shadowRoot.querySelector('.cleaning-summary');
    assert.match(summary.textContent, /Vacuum only/);
    assert.doesNotMatch(summary.textContent, /Battery/);
    assert.equal(card.shadowRoot.querySelector('select').value, 'mop');
    hass.states['sensor.robot_last_clean'].attributes = {};
    card.hass = hass;
    assert.match(card.shadowRoot.querySelector('.cleaning-summary').textContent, /No completed clean/);
    delete hass.states['sensor.robot_last_clean'];
    card.hass = hass;
    assert.match(card.shadowRoot.querySelector('.cleaning-summary').textContent, /history unavailable/);
});

test('rejects invalid summary fields and a mode entity from the wrong domain', () => {
    assert.throws(() => setup({last_clean_fields: ['invented']}), /supported cleaning summary fields/);
    assert.throws(() => setup({cleaning_mode_entity: 'sensor.mode'}), /select entity/);
});
