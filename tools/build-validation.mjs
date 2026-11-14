import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {BASE,HABITAT,TARGET,DEFAULT_POLICY,WALKBACK_PACE_FACTOR,createTerrain,findTerrainRoute,analyzeRoute,sensitivity,walkback} from '../dist/planner.js';
import {compareRoutes,DEMO_PARAMETERS,DEMO_LONG_WORK} from '../dist/decision.js';
const file=new URL('../dist/assets/jezero-terrain.json',import.meta.url),raw=fs.readFileSync(file),terrain=createTerrain(JSON.parse(raw));
const waypoint=JSON.parse(fs.readFileSync(new URL('../dist/assets/rochette-waypoint.geojson',import.meta.url),'utf8')).features[0];
const start={x:HABITAT.x,y:HABITAT.y},path=findTerrainRoute(start,TARGET,terrain),direct=analyzeRoute([start,TARGET],terrain),recommended=analyzeRoute(path,terrain);
const {maxSlope,...parameters}=DEMO_PARAMETERS,longWork={...parameters,work:DEMO_LONG_WORK};
const summarize=p=>Object.fromEntries(Object.entries(compareRoutes({direct,terrain:recommended},p)).map(([key,{analysis,...summary}])=>[key,summary]));
const routeTimeComparison=summarize(parameters),longWorkComparison=summarize(longWork);
const checks={
  targetMatchesPreservedNasaWaypoint:waypoint.properties.RMC===TARGET.waypoint&&waypoint.geometry.coordinates[0]===TARGET.lon&&waypoint.geometry.coordinates[1]===TARGET.lat,
  routeFound:!!path,noUnknownCells:recommended?.unknownCells===0,slopePolicyRespected:recommended?.maxSlope<=DEFAULT_POLICY.maxSlope,
  directLineExceedsSlopePolicy:direct.passable===false&&direct.blockedCells>0,roundTripIncluded:recommended?.roundTripMeters===recommended?.outboundMeters*2,
  terrainCostReduced:recommended?.terrainCost<direct.terrainCost,maxMappedSlopeReduced:recommended?.maxSlope<direct.maxSlope,climbReduced:recommended?.roundTripAscentMeters<direct.roundTripAscentMeters,
  defaultPlanHoldsReserve:routeTimeComparison.terrain.status==='robust'&&routeTimeComparison.terrain.walkback.status==='ok',
  longFieldworkTriggersWalkbackRule:longWorkComparison.terrain.status==='conditional'&&longWorkComparison.terrain.walkback.status==='shortWork'
};
for(const [name,value]of Object.entries(checks))assert.equal(value,true,name);
const report={schemaVersion:2,title:'ARES-03 reproducible reference scenario',generatedAt:new Date().toISOString(),
  humanMission:{hypothetical:true,habitat:HABITAT,habitatSelection:'Flat site (under 4° within 120 m) chosen with tools/find-habitat.mjs so that the straight line to Rochette crosses steep mapped terrain.',projectionOrigin:BASE},
  target:TARGET,policy:{...DEFAULT_POLICY,assumption:true},parameters,
  source:{id:terrain.id,url:terrain.sourceUrl,sourceSha256:terrain.sourceSha256,gridSha256:crypto.createHash('sha256').update(raw).digest('hex'),sourceResolutionMeters:terrain.sourceResolutionMeters,planningGridMeters:terrain.step},
  direct,recommended,
  improvement:{additionalRoundTripMeters:recommended.roundTripMeters-direct.roundTripMeters,additionalRoundTripPercent:(recommended.roundTripMeters/direct.roundTripMeters-1)*100,directCellsAboveLimit:direct.blockedCells,reductionInMaximumMappedSlopeDegrees:direct.maxSlope-recommended.maxSlope,reductionInRoundTripClimbMeters:direct.roundTripAscentMeters-recommended.roundTripAscentMeters,relativeTerrainCostReduction:1-recommended.terrainCost/direct.terrainCost},
  scenarios:sensitivity(recommended.roundTripMeters,parameters),
  walkback:{returnPaceFactor:WALKBACK_PACE_FACTOR,default:walkback(recommended.outboundMeters,parameters),longFieldwork:{workMinutes:DEMO_LONG_WORK,...walkback(recommended.outboundMeters,longWork)}},
  routeTimeComparison,longWorkComparison,checks,
  validationScope:{automatedReferenceScenario:true,humanUsabilityStudyCompleted:false,independentAbsoluteImageDemAlignmentValidated:false,operationalSafetyValidated:false},
  limitations:'Prototype terrain cost, slope threshold and walkback pace factor are assumptions, not NASA EVA policy. The habitat location is hypothetical. Orbital terrain cannot resolve every hazard. Time scenarios are what-if assumptions, not statistical confidence intervals or suit-performance predictions.'};
const output=new URL('../dist/assets/validation-report.json',import.meta.url);
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
process.stdout.write(JSON.stringify({checks,direct:{roundTripMeters:direct.roundTripMeters,maxSlope:direct.maxSlope,blockedCells:direct.blockedCells,climb:direct.roundTripAscentMeters},recommended:{roundTripMeters:recommended.roundTripMeters,maxSlope:recommended.maxSlope,climb:recommended.roundTripAscentMeters},walkback:report.walkback,conservativeMinutes:report.scenarios[2].total},null,2)+'\n');
