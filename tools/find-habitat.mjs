// Search for a hypothetical habitat site whose straight line to Rochette crosses steep terrain.
import fs from 'node:fs';
import {TARGET,DEFAULT_POLICY,createTerrain,findTerrainRoute,analyzeRoute,segmentCells,cellId,toGeo,sensitivity} from '../dist/terrain-planner.js';
const t=createTerrain(JSON.parse(fs.readFileSync(new URL('../dist/assets/jezero-terrain.json',import.meta.url),'utf8')));
const P={autonomy:240,work:30,speed:2.5,reserve:45};
const flat=(p,r=120,lim=4)=>{for(let dx=-r;dx<=r;dx+=40)for(let dy=-r;dy<=r;dy+=40){const id=cellId({x:p.x+dx,y:p.y+dy},t);if(id<0||!t.valid[id]||t.slopes[id]>lim)return false;}return true;};
const out=[];
for(let x=t.xMin+400;x<t.xMin+t.cols*t.step-400;x+=160)for(let y=t.yMax-400;y>t.yMax-t.rows*t.step+400;y-=160){
  const p={x,y},d=Math.hypot(TARGET.x-x,TARGET.y-y);if(d<1600||d>3200||!flat(p))continue;
  const cells=segmentCells(p,TARGET,t).filter(id=>id>=0&&t.valid[id]);const steep=cells.filter(id=>t.slopes[id]>12);
  if(steep.length<4)continue;const maxS=Math.max(...cells.map(id=>t.slopes[id]));
  const route=findTerrainRoute(p,TARGET,t,DEFAULT_POLICY);if(!route||route.length<3)continue;
  const a=analyzeRoute(route,t,DEFAULT_POLICY),dA=analyzeRoute([p,TARGET],t,DEFAULT_POLICY);if(!a.passable)continue;
  const sc=sensitivity(a.roundTripMeters,P);
  out.push({x,y,geo:toGeo(p),oneWay:Math.round(d),steepCells:steep.length,directMax:+maxS.toFixed(1),routeKm:+(a.roundTripMeters/1000).toFixed(2),ratio:+(a.outboundMeters/d).toFixed(2),routeMax:+a.maxSlope.toFixed(1),consLeft:+sc[2].remaining.toFixed(1),consOk:sc[2].feasible,baseOk:sc[1].feasible,directBlocked:dA.blockedCells});
}
out.sort((a,b)=>b.directMax-a.directMax);
console.log(out.length,'candidates');
for(const c of out.filter(c=>c.ratio<=1.45).slice(0,25))console.log(JSON.stringify(c));
