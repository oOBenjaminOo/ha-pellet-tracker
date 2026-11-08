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

test("season calendar explicitly carries through leap years and year boundaries", () => {
  const p = panel();
  p.data = { season_month: 7, summary: { season: "2015/2016" } };
  assert.equal(p.seasonDates().start, "2015-07-01");
  assert.equal(p.seasonDates().end, "2016-06-30");
  assert.equal(p.seasonDates().next, "2016-07-01");
  p.data.season_month = 3;
  assert.equal(p.seasonDates().end, "2016-02-29");
  p.data.summary.season = "2016/2017";
  assert.equal(p.seasonDates().end, "2017-02-28");
});

test("dashboard YAML uses renamed live entities and confirms write actions", () => {
  const p = panel();
  p.data = { name: 'Poêle "salon"', entities: [
    {key:"stock",entity_id:"sensor.my_renamed_stock",available:true},
    {key:"used",entity_id:"sensor.disabled_usage",available:false},
    {key:"add_bag",entity_id:"button.my_renamed_add",available:true}
  ] };
  const yaml = p.dashboardYaml();
  assert.match(yaml,/sensor.my_renamed_stock/);
  assert.match(yaml,/button.my_renamed_add/);
  assert.match(yaml,/confirmation:\n\s+text:/);
  assert.match(yaml,/perform_action: button.press/);
  assert.equal(yaml.includes("sensor.disabled_usage"),false);
  assert.equal(yaml.includes("undefined"),false);
  p.data.entities = [];
  assert.match(p.dashboardYaml(),/^# Aucun capteur/);
});

function fixture() {
  const p = panel();
  const season = {used:9,purchased:47,cleanings:3,spend:298.45,cost:null,average_price:6.35,first_start:"2018-10-23"};
  p.data = {name:"Test",currency:"EUR",season_month:7,revision:4,events:[],audit:[],settings:{low_stock:10},entities:[],summary:{season:"2018/2019",seasons:{"2018/2019":season},monthly:{"2018/2019":[]},same_date:[],stock:38,autonomy_days:null,stock_history:[]}};
  const nodes = new Map();
  p.shadowRoot = {
    querySelector: id => { if(!nodes.has(id)) nodes.set(id,{}); return nodes.get(id); },
    querySelectorAll: () => []
  };
  p.localDate = () => "2018-11-08";
  p.bindStatistics = () => {};
  return {p,nodes};
}

test("navigation renders separate pages rather than anchors or a hidden giant form", () => {
  const {p,nodes} = fixture();
  p.view = "overview";
  Panel.prototype.render.call(p);
  let html = nodes.get("#content").innerHTML;
  assert.match(html,/Votre réserve/);
  assert.equal(html.includes('id="operation"'),false);
  assert.equal(html.includes('id="settingsForm"'),false);
  assert.equal(html.includes('id="monthlyContent"'),false);
  p.view = "seasons";
  Panel.prototype.render.call(p);
  html = nodes.get("#content").innerHTML;
  assert.match(html,/01\/07\/2019/);
  assert.match(html,/stock restant est conservé/);
  assert.equal(html.includes('id="operation"'),false);
  assert.equal(html.includes("Votre réserve"),false);
});

test("statistical views show one analysis at a time", () => {
  const {p} = fixture();
  p.statsTab="monthly";
  let html=p.statisticsView();
  assert.match(html,/id="monthlyContent"/);
  assert.equal(html.includes("Cumul de chaque saison"),false);
  p.statsTab="compare";
  html=p.statisticsView();
  assert.match(html,/Cumul de chaque saison/);
  assert.equal(html.includes('id="monthlyContent"'),false);
  p.compareMode="full";
  html=p.statisticsView();
  assert.match(html,/Coût utilisé FIFO/);
  assert.equal(html.includes("Cumul de chaque saison"),false);
});

test("history filters before pagination so it mounts at most 25 operations", () => {
  const {p} = fixture();
  p.data.events=Array.from({length:80},(_,i)=>({id:String(i),order:i,date:"2018-11-07",kind:i<60?"use":"clean",quantity:1,unit_price:null,comment:"",supplier:"",brand:""}));
  let html=p.journalView();
  assert.equal((html.match(/data-edit=/g)||[]).length,25);
  assert.match(html,/Page 1 \/ 4/);
  p.journalKind="clean";
  html=p.journalView();
  assert.equal((html.match(/data-edit=/g)||[]).length,20);
  assert.match(html,/Page 1 \/ 1/);
});
