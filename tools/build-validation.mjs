import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {BASE,HABITAT,TARGET,DEFAULT_POLICY,WALKBACK_PACE_FACTOR,RAD_GCR_MSV_PER_DAY,createTerrain,createNightIr,loosePenalty,LOOSE_GROUND_PENALTY,analyzeSurface,nightClass,findTerrainRoute,analyzeRoute,sensitivity,walkback,evaTimeline,evaStateAt,gcrDose} from '../dist/planner.js';
import {compareRoutes,DEMO_PARAMETERS,DEMO_LONG_WORK} from '../dist/decision.js';
const file=new URL('../dist/assets/jezero-terrain.json',import.meta.url),raw=fs.readFileSync(file),terrain=createTerrain(JSON.parse(raw));
const waypoint=JSON.parse(fs.readFileSync(new URL('../dist/assets/rochette-waypoint.geojson',import.meta.url),'utf8')).features[0];
const start={x:HABITAT.x,y:HABITAT.y},path=findTerrainRoute(start,TARGET,terrain),direct=analyzeRoute([start,TARGET],terrain),recommended=analyzeRoute(path,terrain);
const {maxSlope,...parameters}=DEMO_PARAMETERS,longWork={...parameters,work:DEMO_LONG_WORK};
const summarize=p=>Object.fromEntries(Object.entries(compareRoutes({direct,terrain:recommended},p)).map(([key,{analysis,...summary}])=>[key,summary]));
const routeTimeComparison=summarize(parameters),longWorkComparison=summarize(longWork);
const report_base_minutes=()=>sensitivity(recommended.roundTripMeters,parameters)[1].total;
const night=createNightIr(JSON.parse(fs.readFileSync(new URL('../dist/assets/jezero-night-ir.json',import.meta.url),'utf8')),terrain);
const loosePath=findTerrainRoute(start,TARGET,terrain,{...DEFAULT_POLICY,cellPenalty:loosePenalty(night)}),looseRoute=analyzeRoute(loosePath,terrain);
const surface={direct:analyzeSurface([start,TARGET],terrain,night),terrain:analyzeSurface(path,terrain,night),loose:analyzeSurface(loosePath,terrain,night)};
const bands=[['<3',0,3],['3-8',3,8],['8-12',8,12],['>12',12,90]].map(([label,lo,hi])=>{let n=0,warm=0;for(let i=0;i<terrain.slopes.length;i++){const s=terrain.slopes[i];if(!terrain.valid[i]||night.values[i]<0||s<lo||s>=hi)continue;n++;if(nightClass(night.values[i],night)==='warm')warm++;}return {slopeBand:label,cells:n,warmShare:warm/n};});
const baseTimeline=evaTimeline(recommended.outboundMeters,parameters),longTimeline=evaTimeline(recommended.outboundMeters,longWork);
const checks={
  nightIrCoversRoute:surface.terrain.share.unknown===0,routeCAvoidsMostLooseGround:!!loosePath&&looseRoute.passable&&surface.loose.share.cool<surface.terrain.share.cool/3,warmNightShareRisesWithSlope:bands.every((b,i)=>i===0||b.warmShare>bands[i-1].warmShare),
  playbackFlagsLateDeparture:evaStateAt(longTimeline,Math.floor(longTimeline.leaveBy)+1).pastLeaveBy===true&&evaStateAt(baseTimeline,baseTimeline.outbound+parameters.work-1).pastLeaveBy===false,
  playbackReturnsWithReserveByDefault:baseTimeline.reserveAtArrival>=parameters.reserve,
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
  routeTimeComparison,longWorkComparison,
  surface:{source:night.product,classes:night.classes,interpretation:night.interpretation,direct:surface.direct,terrain:surface.terrain,plausibility:{description:'Share of warm-at-night cells by mapped slope band; rocky slopes are expected to be warmer at night.',bands}},
  radiation:{gcrDoseEquivalentMsvPerDay:RAD_GCR_MSV_PER_DAY,source:'Curiosity RAD, Gale crater, Aug 2012-Jun 2013; Hassler et al. (2014) Science 343, doi:10.1126/science.1244797; value as reported by SwRI',baseCaseEvaMinutes:report_base_minutes(),baseCaseEvaDoseMsv:gcrDose(report_base_minutes()),longestShelterWalkMinutes:walkback(recommended.outboundMeters,parameters).slowReturn},
  playback:{default:baseTimeline,longFieldwork:longTimeline},
  routeC:{experimental:true,loosePenaltyWeight:LOOSE_GROUND_PENALTY,description:'Terrain-aware cost multiplied by (1 + weight) on cells in the coolest night-IR quartile. Uncalibrated brightness; advisory route.',analysis:looseRoute,additionalRoundTripMetersVsB:looseRoute.roundTripMeters-recommended.roundTripMeters,nightCoolShareB:surface.terrain.share.cool,nightCoolShareC:surface.loose.share.cool},
  checks,
  validationScope:{automatedReferenceScenario:true,humanUsabilityStudyCompleted:false,independentAbsoluteImageDemAlignmentValidated:false,operationalSafetyValidated:false},
  limitations:'Prototype terrain cost, slope threshold and walkback pace factor are assumptions, not NASA EVA policy. The habitat location is hypothetical. Orbital terrain cannot resolve every hazard. Time scenarios are what-if assumptions, not statistical confidence intervals or suit-performance predictions.'};
const output=new URL('../dist/assets/validation-report.json',import.meta.url);
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
process.stdout.write(JSON.stringify({checks,direct:{roundTripMeters:direct.roundTripMeters,maxSlope:direct.maxSlope,blockedCells:direct.blockedCells,climb:direct.roundTripAscentMeters},recommended:{roundTripMeters:recommended.roundTripMeters,maxSlope:recommended.maxSlope,climb:recommended.roundTripAscentMeters},walkback:report.walkback,conservativeMinutes:report.scenarios[2].total},null,2)+'\n');
