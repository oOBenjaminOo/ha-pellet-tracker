// Regression tests for delayed responses and submission state, without a browser.
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const assert = require("node:assert/strict");

let Panel;
const encodeCsv = vm.runInNewContext(
  readFileSync(join(__dirname, "../custom_components/pellet_tracker/frontend/panel.js"), "utf8") + "\n csvCell;",
  { HTMLElement: class {}, customElements: { define(_name, value) { Panel = value; } }, Intl, Date, Set, console },
);

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function panel() {
  const instance = Object.create(Panel.prototype);
  instance.entry = "A";
  instance.loadGeneration = 0;
  instance.busy = false;
  instance.messages = [];
  instance.notice = (message) => instance.messages.push(message);
  instance.render = () => {};
  return instance;
}

test("late response from previous journal never replaces selected journal", async () => {
  const p = panel(), first = deferred(), second = deferred();
  p._hass = { callWS: ({ entry_id }) => entry_id === "A" ? first.promise : second.promise };
  const oldLoad = p.load();
  p.entry = "B";
  const newLoad = p.load();
  second.resolve({ name: "B" });
  await newLoad;
  first.resolve({ name: "A" });
  await oldLoad;
  assert.equal(p.data.name, "B");
});

test("late error from previous journal does not mask current success", async () => {
  const p = panel(), first = deferred(), second = deferred();
  p._hass = { callWS: ({ entry_id }) => entry_id === "A" ? first.promise : second.promise };
  const oldLoad = p.load();
  p.entry = "B";
  const newLoad = p.load();
  second.resolve({ name: "B" });
  await newLoad;
  first.reject(new Error("stale error"));
  await oldLoad;
  assert.equal(p.messages.includes("stale error"), false);
});

test("double submit sends one request and restores original disabled controls", async () => {
  const p = panel(), response = deferred();
  const controls = [{ disabled: false }, { disabled: true }];
  p.shadowRoot = { querySelectorAll: () => controls };
  p.data = { revision: 3 };
  let calls = 0;
  p._hass = { callWS: () => { calls++; return response.promise; } };
  const saving = p.mutate("add", {});
  assert.equal(controls.every(c => c.disabled), true);
  await p.mutate("add", {});
  assert.equal(calls, 1);
  response.reject(new Error("rejected"));
  await saving;
  assert.deepEqual(controls.map(c => c.disabled), [false, true]);
  assert.equal(p.busy, false);
});

test("stock error displays a readable date without internal operation IDs", () => {
  const p = panel(), box = {};
  p.shadowRoot = { querySelector: () => box };
  Panel.prototype.notice.call(p, "Insufficient stock on 2018-11-07 (internal-id)", true);
  assert.match(box.textContent, /Stock insuffisant au 07\/11\/2018/);
  assert.equal(box.textContent.includes("internal-id"), false);
});

test("CSV neutralizes spreadsheet formulas and escapes quotes while keeping numbers numeric",()=>{
  assert.equal(encodeCsv('=1+1'),'"\'=1+1"');
  assert.equal(encodeCsv('A"B'),'"A""B"');
  assert.equal(encodeCsv(-2),'"-2"');
  assert.equal(encodeCsv(null),'""');
});

test("monthly chart distinguishes unknown prices from future months",()=>{
  const p=panel();p.statsSeason='2018/2019';p.statsMetric='cost';
  p.data={currency:'EUR',summary:{monthly:{'2018/2019':[
    {month:'2018-10',used:2,purchased:10,spend:null,cost:null,average_price:null,future:false},
    {month:'2018-11',used:0,purchased:0,spend:0,cost:0,average_price:null,future:true}
  ]}}};
  const html=p.monthlyContent();
  assert.match(html,/Non renseigné/);
  assert.match(html,/À venir/);
  assert.equal(html.includes('NaN'),false);
  assert.equal(html.includes('Infinity'),false);
});
