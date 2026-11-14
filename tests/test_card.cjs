const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};}
function environment(){
  let helpers;
  class Element {constructor(){this.isConnected=true;this.style={setProperty(){throw new Error("Custom element constructor must not add attributes");}};}attachShadow(){this.shadowRoot={children:[],replaceChildren:(...children)=>this.shadowRoot.children=children};}}
  const context={HTMLElement:Element,window:{loadCardHelpers:()=>helpers || Promise.resolve({createCardElement:config=>({config})})},customElements:{whenDefined:()=>new Promise(()=>{}),get:()=>null},document:{createElement:()=>({style:{},append(){}})},CustomEvent:class{}};
  const {Card, Value}=vm.runInNewContext(readFileSync('custom_components/pellet_tracker/frontend/card.js','utf8')+'\n({Card: PelletTrackerCard, Value: PelletTrackerValue});',context);
  return {Card,Value,setHelpers:value=>helpers=value};
}
const tick=()=>new Promise(r=>setImmediate(r));

test('settings pushes refresh the existing card and pass hass to native children',async()=>{
  const {Card}=environment(),card=new Card();let callback,subscriptions=0;
  const hass={connection:{subscribeMessage:async cb=>{subscriptions++;callback=cb;return()=>{};}}};
  card.setConfig({entry_id:'A'});card.hass=hass;await tick();
  callback({config:{type:'vertical-stack',language:'fr'}});await tick();
  const old=card.child;
  callback({config:{type:'vertical-stack',language:'en',control:true}});await tick();
  assert.notEqual(card.child,old);assert.equal(card.child.config.language,'en');
  assert.equal(card.child.hass,hass);assert.equal(subscriptions,1);
  callback({config:{type:'vertical-stack',language:'en',control:true}});await tick();
  const unchanged=card.child;card.hass={...hass,states:{changed:true}};
  assert.equal(card.child,unchanged);assert.equal(card.child.hass.states.changed,true);
});

test('old journal packets and delayed helper resolutions never replace current card',async()=>{
  const env=environment(),card=new env.Card(),callbacks=[];let removed=0;
  card.setConfig({entry_id:'A'});card.hass={connection:{subscribeMessage:async cb=>{callbacks.push(cb);return()=>removed++;}}};await tick();
  const delayed=deferred();env.setHelpers(delayed.promise);
  callbacks[0]({config:{journal:'A'}});
  card.setConfig({entry_id:'B'});await tick();
  callbacks[0]({config:{journal:'old-A'}});
  env.setHelpers(Promise.resolve({createCardElement:config=>({config})}));
  callbacks[1]({config:{journal:'B'}});await tick();
  delayed.resolve({createCardElement:config=>({config})});await tick();
  assert.equal(card.child.config.journal,'B');assert.equal(removed,1);
});

test('disconnect cleans subscriptions including late subscription acknowledgements',async()=>{
  const {Card}=environment(),card=new Card(),ack=deferred();let removed=0;
  card.setConfig({entry_id:'A'});card.hass={connection:{subscribeMessage:()=>ack.promise}};
  card.isConnected=false;card.disconnectedCallback();ack.resolve(()=>removed++);await tick();
  assert.equal(removed,1);assert.equal(card.child,undefined);
});

test('card values drop trailing zeros, preserve fractional bags and round autonomy down',()=>{
  const {Value}=environment(),element=new Value();
  element.setConfig({entity:'sensor.example', metric:'stock', language:'fr'});
  for(const [state,label] of [['26.0','26 Sacs'],['1.0','1 Sac'],['2.5','2,5 Sacs'],['unavailable','Indisponible']]){
    element.hass={states:{'sensor.example':{state}}};
    assert.equal(element.shadowRoot.textContent,label);
  }
  element.setConfig({entity:'sensor.example', metric:'autonomy_days', language:'fr'});
  element.hass={states:{'sensor.example':{state:'149.5'}}};
  assert.equal(element.shadowRoot.textContent,'≈ 149 jours de réserve');
});
