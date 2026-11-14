import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compareRoutes,summarizeComparison,DEMO_PARAMETERS,DEMO_LONG_WORK} from '../dist/decision.js';
const report=JSON.parse(fs.readFileSync(new URL('../dist/assets/validation-report.json',import.meta.url),'utf8'));
const analyses={direct:report.direct,terrain:report.recommended};

test('the direct line is blocked by terrain and the detour holds the reserve by default',()=>{const c=compareRoutes(analyses,DEMO_PARAMETERS);assert.equal(c.direct.status,'blocked');assert.equal(c.terrain.status,'robust');assert.ok(c.terrain.reserveMargin>0);assert.equal(c.terrain.walkback.status,'ok');assert.ok(c.terrain.walkback.maxWork>DEMO_PARAMETERS.work);});
test('longer fieldwork keeps the base case but triggers the walkback rule',()=>{const c=compareRoutes(analyses,{...DEMO_PARAMETERS,work:DEMO_LONG_WORK});assert.ok(c.terrain.base.feasible);assert.equal(c.terrain.status,'conditional');assert.equal(c.terrain.walkback.status,'shortWork');assert.ok(c.terrain.walkback.maxWork<DEMO_LONG_WORK);assert.equal(c.terrain.walkback.leaveBy,compareRoutes(analyses,DEMO_PARAMETERS).terrain.walkback.leaveBy);});
test('a blocked route never receives a positive overall verdict from spare time',()=>{const c=compareRoutes(analyses,DEMO_PARAMETERS);assert.ok(c.direct.reserveMargin>0);assert.equal(c.direct.status,'blocked');});
test('an unavailable route has no invented time, reserve or walkback result',()=>{const c=compareRoutes({direct:analyses.direct,terrain:null},DEMO_PARAMETERS);assert.equal(c.terrain.status,'noRoute');assert.deepEqual(c.terrain.scenarios,[]);assert.equal(c.terrain.reserveMargin,null);assert.equal(c.terrain.walkback,null);});

test('the decision summary follows the actual terrain and time checks',()=>{
  assert.deepEqual(summarizeComparison(compareRoutes(analyses,DEMO_PARAMETERS)),{key:'decisionOne',kind:'terrain',kinds:['terrain']});assert.deepEqual(summarizeComparison(compareRoutes({...analyses,loose:analyses.terrain},DEMO_PARAMETERS)),{key:'decisionMany',kind:null,kinds:['terrain','loose']});
  assert.equal(summarizeComparison(compareRoutes(analyses,{...DEMO_PARAMETERS,work:DEMO_LONG_WORK})).key,'decisionConditional');
  assert.equal(summarizeComparison(compareRoutes(analyses,{...DEMO_PARAMETERS,autonomy:60})).key,'decisionRevise');
  const bothPassable={...analyses,direct:{...analyses.direct,passable:true}};
  assert.deepEqual(summarizeComparison(compareRoutes(bothPassable,DEMO_PARAMETERS)),{key:'decisionMany',kind:null,kinds:['direct','terrain']});
});

test('summary does not make a route choice without terrain data',()=>{
  assert.equal(summarizeComparison(null).key,'decisionUnavailable');
  assert.equal(summarizeComparison(compareRoutes({},DEMO_PARAMETERS)).key,'decisionUnavailable');
});
