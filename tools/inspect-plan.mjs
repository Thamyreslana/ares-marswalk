import fs from 'node:fs';
import {createTerrain,findTerrainRoute,analyzeRoute,BASE,TARGET,DEFAULT_POLICY} from '../dist/terrain-planner.js';
const terrain=createTerrain(JSON.parse(fs.readFileSync(new URL('../dist/assets/jezero-terrain.json',import.meta.url),'utf8')));
for(const limit of [5,8,10,12,15,20]){
  const policy={...DEFAULT_POLICY,maxSlope:limit},start={x:0,y:0},route=findTerrainRoute(start,TARGET,terrain,policy);
  const optimized=analyzeRoute(route,terrain,policy),direct=analyzeRoute([start,TARGET],terrain,policy);
  const brief=a=>a&&Object.fromEntries(Object.entries(a).filter(([key])=>key!=='profile'));
  process.stdout.write(JSON.stringify({maxSlope:limit,points:route?.length,optimized:brief(optimized),direct:brief(direct)})+'\n');
}
