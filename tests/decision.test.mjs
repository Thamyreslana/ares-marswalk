import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compareRoutes,summarizeComparison,DEMO_PARAMETERS} from '../dist/decision.js';
const report=JSON.parse(fs.readFileSync(new URL('../dist/assets/validation-report.json',import.meta.url),'utf8'));
const analyses={direct:report.direct,terrain:report.recommended};
test('the comparison exposes the reserve tradeoff under the same assumptions',()=>{const c=compareRoutes(analyses,DEMO_PARAMETERS);assert.equal(c.direct.status,'robust');assert.equal(c.terrain.status,'robust');assert.ok(Math.abs(c.direct.reserveMargin-12.77446)<.001);assert.ok(Math.abs(c.terrain.reserveMargin-3.06767)<.001);assert.ok(c.direct.conservative.total<c.terrain.conservative.total);});
test('a 50 minute reserve distinguishes the two actual routes without changing terrain',()=>{const c=compareRoutes(analyses,{...DEMO_PARAMETERS,reserve:50});assert.equal(c.direct.status,'robust');assert.equal(c.terrain.status,'conditional');assert.ok(c.direct.reserveMargin>0);assert.ok(c.terrain.reserveMargin<0);assert.equal(c.direct.analysis,analyses.direct);assert.equal(c.terrain.analysis,analyses.terrain);});
test('a blocked route never receives a positive overall verdict from spare time',()=>{const c=compareRoutes({...analyses,direct:{...analyses.direct,passable:false}},DEMO_PARAMETERS);assert.ok(c.direct.reserveMargin>0);assert.equal(c.direct.status,'blocked');});
test('an unavailable route has no invented time or reserve result',()=>{const c=compareRoutes({direct:analyses.direct,terrain:null},DEMO_PARAMETERS);assert.equal(c.terrain.status,'noRoute');assert.deepEqual(c.terrain.scenarios,[]);assert.equal(c.terrain.reserveMargin,null);});

test('the decision summary changes with the actual reserve requirement',()=>{
  assert.deepEqual(summarizeComparison(compareRoutes(analyses,DEMO_PARAMETERS)),{key:'decisionBoth',kind:null});
  assert.deepEqual(summarizeComparison(compareRoutes(analyses,{...DEMO_PARAMETERS,reserve:50})),{key:'decisionOne',kind:'direct'});
  assert.equal(summarizeComparison(compareRoutes(analyses,{...DEMO_PARAMETERS,autonomy:210})).key,'decisionConditional');
  assert.equal(summarizeComparison(compareRoutes(analyses,{...DEMO_PARAMETERS,autonomy:60})).key,'decisionRevise');
});

test('summary never treats a blocked route as an option just because time remains',()=>{
  const blocked={...analyses,direct:{...analyses.direct,passable:false}};
  assert.deepEqual(summarizeComparison(compareRoutes(blocked,DEMO_PARAMETERS)),{key:'decisionOne',kind:'terrain'});
  assert.equal(summarizeComparison(compareRoutes(blocked,{...DEMO_PARAMETERS,reserve:50})).key,'decisionConditional');
});

test('summary does not make a route choice without terrain data',()=>{
  assert.equal(summarizeComparison(null).key,'decisionUnavailable');
  assert.equal(summarizeComparison(compareRoutes({},DEMO_PARAMETERS)).key,'decisionUnavailable');
});
