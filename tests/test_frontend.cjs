// Regression tests for delayed responses and submission state, without a browser.
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const assert = require("node:assert/strict");

let Panel;
const encodeCsv = vm.runInNewContext(
  readFileSync(join(__dirname, "../custom_components/pellet_tracker/frontend/translations.js"), "utf8").replace("export const", "const") + "\n" +
  readFileSync(join(__dirname, "../custom_components/pellet_tracker/frontend/panel.js"), "utf8").replace(/^import .*;\n/, "") + "\n csvCell;",
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
    querySelector: id => { if(!nodes.has(id)) nodes.set(id,{addEventListener(){},setAttribute(){}}); return nodes.get(id); },
    querySelectorAll: () => []
  };
  p.bindSeasonReport = () => {};
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

test("operation popup stays on the current page and adapts purchase and cleaning fields", () => {
  const p=panel();
  p.data={currency:"EUR"};p.view="journal";p.localDate=()=>"2018-11-08";
  const labels={}; const inputs={};
  for(const name of ["kind","date","quantity","unit_price","shipping","discount","supplier","brand","cleaned"]){
    labels[name]={hidden:false};inputs[name]={value:"",disabled:false,closest:()=>labels[name],focus(){}};
  }
  inputs.kind.value="purchase";inputs.quantity.value="10";inputs.unit_price.value="5";inputs.shipping.value="10";inputs.discount.value="5";
  const listeners={},nodes={"#entryHelp":{},"#formTotal":{},"#cancel":{}};
  const form={elements:inputs,addEventListener:(name,fn)=>listeners[name]=fn};
  p.showEditor=(_title,html)=>{
    assert.match(html,/id="operation"/);
    return {querySelector:selector=>selector==="#operation"?form:selector==='[name="date"]'?inputs.date:nodes[selector]};
  };
  p.openOperation("purchase");
  assert.equal(p.view,"journal");
  assert.match(nodes["#formTotal"].textContent,/55,00/);
  assert.equal(labels.shipping.hidden,false);
  inputs.kind.value="clean";listeners.input();
  assert.equal(labels.quantity.hidden,true);
  assert.equal(labels.unit_price.hidden,true);
  assert.equal(inputs.cleaned.disabled,true);
});

test("successful popup saving closes it and retains the original page", async () => {
  const p=panel();p.view="journal";p.data={revision:4};
  p.shadowRoot={querySelectorAll:()=>[]};let closed=0;
  p.closeEditor=force=>{assert.equal(force,true);closed++;};
  p._hass={callWS:async()=>({revision:5})};
  await p.mutate("add",{});
  assert.equal(closed,1);
  assert.equal(p.view,"journal");
  p._hass.callWS=async()=>{throw Error("save failed");};
  await p.mutate("add",{});
  assert.equal(closed,1);
});

test("dashboard card insertion preserves existing config and never mutates the input", () => {
  const p=panel(), original={title:"Home",custom:{keep:true},views:[{title:"Main",path:"home",background:"red",cards:[{type:"clock"}]},{title:"Other",cards:[]}]};
  const before=JSON.stringify(original), card={type:"vertical-stack",cards:[{type:"custom:mushroom-title-card",title:"Pellets"}]};
  const next=p.buildDashboardConfig(original,0,"new",card);
  assert.equal(JSON.stringify(original),before);
  assert.equal(next.views[0].cards.length,2);
  assert.equal(JSON.stringify(next.views[0].cards[1]),JSON.stringify(card));
  assert.equal(next.views[0].background,"red");
  assert.equal(next.custom.keep,true);
  assert.equal(next.views[1].cards.length,0);
  assert.throws(()=>p.buildDashboardConfig(next,0,"new",card),/déjà présente/);
});

test("dashboard insertion handles sections and refuses strategies and occupied panel views", () => {
  const p=panel(), card={type:"vertical-stack",cards:[]};
  const config={views:[{type:"sections",sections:[{type:"grid",cards:[{type:"clock"}]}]}]};
  const next=p.buildDashboardConfig(config,0,"new",card);
  assert.equal(next.views[0].sections.length,2);
  assert.equal(next.views[0].sections[0].cards.length,1);
  assert.equal(next.views[0].sections[1].cards[0].grid_options.columns,"full");
  assert.equal(p.buildDashboardConfig(config,0,0,card).views[0].sections[0].cards.length,2);
  assert.throws(()=>p.buildDashboardConfig({strategy:{type:"original-states"}},0,"new",card),/automatiquement/);
  assert.throws(()=>p.buildDashboardConfig({views:[{type:"panel",cards:[{type:"clock"}]}]},0,"new",card),/seule carte/);
  assert.throws(()=>p.buildDashboardConfig(config,0,99,card),/Section/);
});

test("dashboard changes between selection and submission prevent a write", async () => {
  const p=panel(), controls=[{disabled:false,isConnected:true}];
  const original={views:[{cards:[]}]}, current={views:[{cards:[{type:"clock"}]}]};
  const flow={config:original,original:JSON.stringify(original),path:"lovelace",card:{type:"vertical-stack",cards:[]},dialog:{isConnected:true,querySelector:()=>({value:"0"})}};
  p.shadowRoot={querySelectorAll:()=>controls};
  p.loadDashboardTarget=async()=>{flow.config=current;};
  const calls=[];p._hass={callWS:async args=>{calls.push(args.type);return current;}};
  await p.installDashboardCard(flow);
  assert.deepEqual(calls,["lovelace/config"]);
  assert.equal(p.messages.some(m=>m.includes("dashboard a changé")),true);
  assert.equal(p.busy,false);
  assert.equal(controls[0].disabled,false);
});

test("journal language is isolated, formats values and keeps user text unchanged", () => {
  const {p} = fixture(), {p: french} = fixture();
  p.data.settings.language = "en";
  p.data.events = [{id:"sample",kind:"note",date:"2018-11-07",quantity:0,order:1,comment:"Réapprovisionnement chez François <test>",supplier:"Marque",brand:"Poêle"}];
  assert.equal(p.labels.purchase, "Restock");
  assert.equal(french.labels.purchase, "Réapprovisionnement");
  assert.equal(p.number(1234.5), "1,234.5");
  assert.equal(french.number(1234.5), "1 234,5");
  assert.equal(p.seasonDates().label, "July");
  assert.match(p.overviewView(), /Your stock/);
  assert.match(p.overviewView(), /Réapprovisionnement chez François &lt;test&gt;/);
  assert.match(p.journalView(), /Include cancelled entries/);
  assert.match(p.seasonsView(), /How does the changeover work/);
  assert.match(p.settingsForm(), /Tracker language/);
  assert.match(p.seasonReport(), /Heating report and budget/);
  assert.match(p.dashboardsView(), /Copy Mushroom card/);
  assert.match(p.cleaningRule(), /reminder disabled/);
  p.data.settings.cleaning_bags=5;
  assert.equal(p.cleaningRule(), "alert after 5 bags used");
  assert.equal(p.number(null), "Not provided");
  p.data.settings.language = "fr";
  assert.match(p.overviewView(), /Votre réserve/);
});

test("English operations, validation and generated native card keep protocol identifiers", () => {
  const {p} = fixture(); p.data.settings.language="en";
  p.data.entities=[{key:"add_bag",entity_id:"button.poele_ajouter",available:true},{key:"stock",entity_id:"sensor.poele_stock",available:true}];
  const yaml=p.dashboardYaml();
  assert.match(yaml,/Add one bag to today’s consumption\?/);
  assert.match(yaml,/sensor.poele_stock/);
  assert.match(yaml,/button.press/);
  let title, markup;
  p.showEditor=(t,html)=>{title=t;markup=html;return null;};
  p.openOperation("purchase");
  assert.equal(title,"Add action");
  assert.match(markup,/Unit price/);
  assert.match(markup,/name="unit_price"/);
  assert.match(markup,/value="purchase"/);
  const box={};p.shadowRoot={querySelector:()=>box};
  Panel.prototype.notice.call(p,"Insufficient stock on 2018-11-07 (secret-id)",true);
  assert.match(box.textContent,/Insufficient stock on 07\/11\/2018/);
  assert.equal(box.textContent.includes("secret-id"),false);
});
