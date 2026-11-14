export const RADIUS = 3396190;
export const BASE = Object.freeze({lon:77.4298,lat:18.4663});
export function toGeo(p){return {lon:BASE.lon+p.x/(RADIUS*Math.cos(BASE.lat*Math.PI/180))*180/Math.PI,lat:BASE.lat+p.y/RADIUS*180/Math.PI};}
export function fromGeo(p){return {x:(p.lon-BASE.lon)*Math.PI/180*RADIUS*Math.cos(BASE.lat*Math.PI/180),y:(p.lat-BASE.lat)*Math.PI/180*RADIUS};}
export const TARGET = Object.freeze({
  id:'rochette',name:'Rochette',lon:77.44436574,lat:18.4307394,
  ...fromGeo({lon:77.44436574,lat:18.4307394}),waypoint:'7_0',sol:180,
  coordinateSource:'https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json',
  scienceSource:'https://doi.org/10.1029/2022JE007474',
  nasaSource:'https://www.jpl.nasa.gov/news/nasas-perseverance-rover-collects-puzzle-pieces-of-mars-history/'
});
export const TARGETS = [TARGET];
// BASE is only the map/terrain projection origin. The habitat is a separate, hypothetical
// site: a flat area (< 4° within 120 m) west of a ~40 m hill that the straight line to Rochette crosses.
const HABITAT_GEO = {lon:77.3971,lat:18.4407};
export const HABITAT = Object.freeze({...HABITAT_GEO,...fromGeo(HABITAT_GEO)});
export const DEFAULT_POLICY = Object.freeze({maxSlope:12,slopeWeight:4});
// Same pace factor as the conservative scenario: the return leg is planned as if walking slows by 25%.
export const WALKBACK_PACE_FACTOR = 0.75;

export function createTerrain(raw){
  const size=raw.cols*raw.rows;
  if(!Number.isInteger(raw.cols)||!Number.isInteger(raw.rows)||raw.cols<2||raw.rows<2||!(raw.step>0)||raw.elevations?.length!==size||raw.slopes?.length!==size)throw new Error('Invalid terrain grid');
  if(Math.abs(raw.origin.lon-BASE.lon)>1e-8||Math.abs(raw.origin.lat-BASE.lat)>1e-8||raw.origin.radiusMeters!==RADIUS)throw new Error('Terrain origin mismatch');
  const elevations=Float32Array.from(raw.elevations,v=>v==null?NaN:v),slopes=Float32Array.from(raw.slopes,v=>v==null?NaN:v);
  const valid=Uint8Array.from(elevations,(v,i)=>Number.isFinite(v)&&Number.isFinite(slopes[i])&&slopes[i]>=0?1:0);
  return {...raw,elevations,slopes,valid};
}

export function cellId(p,t){const col=Math.floor((p.x-t.xMin)/t.step),row=Math.floor((t.yMax-p.y)/t.step);return col<0||col>=t.cols||row<0||row>=t.rows?-1:row*t.cols+col;}
export function cellPoint(id,t){return {x:t.xMin+(id%t.cols+.5)*t.step,y:t.yMax-(Math.floor(id/t.cols)+.5)*t.step};}
export function sampleTerrain(p,t){const id=cellId(p,t);return id<0||!t.valid[id]?null:{id,elevation:t.elevations[id],slope:t.slopes[id]};}
export function length(points){return points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-points[i].x,p.y-points[i].y),0);}

// Supercover traversal also checks the side cells when a line touches a grid corner.
export function segmentCells(a,b,t){
  const ax=(a.x-t.xMin)/t.step,ay=(t.yMax-a.y)/t.step,bx=(b.x-t.xMin)/t.step,by=(t.yMax-b.y)/t.step;
  let col=Math.floor(ax),row=Math.floor(ay);const endCol=Math.floor(bx),endRow=Math.floor(by),dx=bx-ax,dy=by-ay,sx=Math.sign(dx),sy=Math.sign(dy),ids=new Set();
  const add=(c,r)=>ids.add(c<0||c>=t.cols||r<0||r>=t.rows?-1:r*t.cols+c);
  const deltaX=sx?Math.abs(1/dx):Infinity,deltaY=sy?Math.abs(1/dy):Infinity;
  let tx=sx?((sx>0?col+1:col)-ax)/dx:Infinity,ty=sy?((sy>0?row+1:row)-ay)/dy:Infinity;
  add(col,row);
  for(let guard=0;(col!==endCol||row!==endRow)&&guard<t.cols+t.rows+10;guard++){
    if(Math.abs(tx-ty)<1e-12){add(col+sx,row);add(col,row+sy);col+=sx;row+=sy;tx+=deltaX;ty+=deltaY;}
    else if(tx<ty){col+=sx;tx+=deltaX;}else{row+=sy;ty+=deltaY;}
    add(col,row);
  }
  if(!sx&&Math.abs(ax-Math.round(ax))<1e-12)for(const id of [...ids])if(id>=0)add(id%t.cols-1,Math.floor(id/t.cols));
  if(!sy&&Math.abs(ay-Math.round(ay))<1e-12)for(const id of [...ids])if(id>=0)add(id%t.cols,Math.floor(id/t.cols)-1);
  return [...ids];
}

function segmentAnalysis(a,b,t,policy,collect=false){
  const distance=Math.hypot(b.x-a.x,b.y-a.y),n=Math.max(1,Math.ceil(distance/(t.step/4))),samples=[];
  const cells=segmentCells(a,b,t);let cost=0,allowed=cells.every(id=>id>=0&&t.valid[id]&&t.slopes[id]<=policy.maxSlope);
  for(let i=0;i<=n;i++){
    const p={x:a.x+(b.x-a.x)*i/n,y:a.y+(b.y-a.y)*i/n},sample=sampleTerrain(p,t);
    if(!sample||sample.slope>policy.maxSlope)allowed=false;
    if(i>0)cost+=distance/n*(1+policy.slopeWeight*((sample?.slope??policy.maxSlope)/policy.maxSlope)**2);
    if(collect)samples.push({...p,distance:distance*i/n,...sample,known:!!sample});
  }
  return {allowed,cost,samples,cells};
}
export function segmentAllowed(a,b,t,policy=DEFAULT_POLICY){return segmentAnalysis(a,b,t,policy).allowed;}

export function findTerrainRoute(start,end,t,policy=DEFAULT_POLICY){
  if(!t||!(policy.maxSlope>0)||!(policy.slopeWeight>=0))return null;
  const startId=cellId(start,t),endId=cellId(end,t);
  const pass=id=>id>=0&&t.valid[id]&&t.slopes[id]<=policy.maxSlope;
  if(!pass(startId)||!pass(endId))return null;
  const direct=segmentAnalysis(start,end,t,policy);
  const size=t.cols*t.rows,g=new Float64Array(size).fill(Infinity),came=new Int32Array(size).fill(-1),closed=new Uint8Array(size),heap=[];
  const push=node=>{heap.push(node);let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(heap[p].f<=node.f)break;heap[i]=heap[p];i=p;}heap[i]=node;};
  const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){let i=0;while(true){let c=i*2+1;if(c>=heap.length)break;if(c+1<heap.length&&heap[c+1].f<heap[c].f)c++;if(last.f<=heap[c].f)break;heap[i]=heap[c];i=c;}heap[i]=last;}return top;};
  g[startId]=0;push({id:startId,f:0});
  while(heap.length){
    const {id}=pop();if(closed[id])continue;
    if(id===endId){
      const reverse=[];let cur=id;while(cur!==-1){reverse.push(cellPoint(cur,t));cur=came[cur];}
      const points=[start,...reverse.reverse(),end];
      if(points.slice(1).some((p,i)=>!segmentAllowed(points[i],p,t,policy)))return null;
      const simplified=[points[0]];let i=0;
      while(i<points.length-1){let chosen=i+1,originalCost=0;
        for(let j=i+1;j<Math.min(points.length,i+22);j++){
          originalCost+=segmentAnalysis(points[j-1],points[j],t,policy).cost;
          const candidate=segmentAnalysis(points[i],points[j],t,policy);
          if(candidate.allowed&&candidate.cost<=originalCost*1.005)chosen=j;
        }
        simplified.push(points[chosen]);i=chosen;
      }
      const cost=simplified.slice(1).reduce((sum,p,i)=>sum+segmentAnalysis(simplified[i],p,t,policy).cost,0);
      if(direct.allowed&&direct.cost<=cost)return [start,end];
      return simplified;
    }
    closed[id]=1;const col=id%t.cols,row=Math.floor(id/t.cols);
    for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
      if((!dr&&!dc)||row+dr<0||row+dr>=t.rows||col+dc<0||col+dc>=t.cols)continue;
      const next=(row+dr)*t.cols+col+dc;if(closed[next]||!pass(next))continue;
      if(dr&&dc&&(!pass(row*t.cols+col+dc)||!pass((row+dr)*t.cols+col)))continue;
      const distance=t.step*Math.hypot(dr,dc),slope=(t.slopes[id]+t.slopes[next])/2;
      const tentative=g[id]+distance*(1+policy.slopeWeight*(slope/policy.maxSlope)**2);
      if(tentative<g[next]){g[next]=tentative;came[next]=id;const p=cellPoint(next,t);push({id:next,f:tentative+Math.hypot(p.x-end.x,p.y-end.y)});}
    }
  }
  return null;
}

export function analyzeRoute(points,t,policy=DEFAULT_POLICY){
  if(!points?.length)return null;
  const samples=[],cells=new Set();let travelled=0,cost=0;
  for(let i=1;i<points.length;i++){
    const segment=segmentAnalysis(points[i-1],points[i],t,policy,true);
    segment.cells.forEach(id=>cells.add(id));
    for(let j=i===1?0:1;j<segment.samples.length;j++)samples.push({...segment.samples[j],distance:travelled+segment.samples[j].distance});
    travelled+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);cost+=segment.cost;
  }
  const known=samples.filter(s=>s.known),knownIds=[...cells].filter(id=>id>=0&&t.valid[id]),blocked=knownIds.filter(id=>t.slopes[id]>policy.maxSlope),unknown=[...cells].filter(id=>id<0||!t.valid[id]);
  let ascent=0,descent=0;for(let i=1;i<samples.length;i++){if(!samples[i].known||!samples[i-1].known)continue;const dz=samples[i].elevation-samples[i-1].elevation;ascent+=Math.max(0,dz);descent+=Math.max(0,-dz);}
  const profile=samples.filter((_,i)=>i%Math.max(1,Math.floor(samples.length/90))===0);if(samples.length&&profile.at(-1)!==samples.at(-1))profile.push(samples.at(-1));
  return {outboundMeters:travelled,roundTripMeters:travelled*2,maxSlope:knownIds.length?Math.max(...knownIds.map(id=>t.slopes[id])):null,meanSlope:known.length?known.reduce((sum,s)=>sum+s.slope,0)/known.length:null,blockedCells:blocked.length,unknownCells:unknown.length,unknownSamples:unknown.length,passable:blocked.length===0&&unknown.length===0,roundTripAscentMeters:ascent+descent,terrainCost:cost,profile};
}

export function budget(distance,speed,work,autonomy,reserve){
  if(![distance,speed,work,autonomy,reserve].every(Number.isFinite)||distance<0||speed<=0||work<0||autonomy<0||reserve<0)throw new Error('Invalid budget parameters');
  const walking=distance/(speed*1000)*60,total=walking+work,remaining=autonomy-total;
  return {walking,work,total,remaining,reserve,feasible:remaining>=reserve,excess:Math.max(0,total-(autonomy-reserve))};
}
// Walkback rule, inspired by the walkback constraints used to plan Apollo rover traverses:
// walk out at the planned pace, but plan the return as if the pace drops to WALKBACK_PACE_FACTOR.
// Times are minutes elapsed since leaving the habitat.
export function walkback(outboundMeters,p){
  if(![outboundMeters,p?.speed,p?.work,p?.autonomy,p?.reserve].every(Number.isFinite)||outboundMeters<0||p.speed<=0)throw new Error('Invalid walkback parameters');
  const metersPerMinute=p.speed*1000/60,outbound=outboundMeters/metersPerMinute,slowReturn=outbound/WALKBACK_PACE_FACTOR;
  const leaveBy=p.autonomy-p.reserve-slowReturn,maxWork=leaveBy-outbound;
  const limitMeters=Math.max(0,(p.autonomy-p.reserve)*metersPerMinute/(1+1/WALKBACK_PACE_FACTOR));
  const status=maxWork<0?'beyond':maxWork<p.work?'shortWork':'ok';
  return {outbound,slowReturn,leaveBy,maxWork,plannedDeparture:outbound+p.work,workMargin:maxWork-p.work,limitMeters,status};
}
export function pointAlong(points,distance){
  if(!points?.length)return null;let travelled=0;
  for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],d=Math.hypot(b.x-a.x,b.y-a.y);if(travelled+d>=distance){const f=d?(distance-travelled)/d:0;return {x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,index:i};}travelled+=d;}
  return {...points.at(-1),index:points.length-1};
}
export function sensitivity(distance,p){
  const scenarios=[{id:'optimistic',speedFactor:1.2,workFactor:.85},{id:'base',speedFactor:1,workFactor:1},{id:'conservative',speedFactor:.75,workFactor:1.25}];
  return scenarios.map(s=>({...s,speed:p.speed*s.speedFactor,...budget(distance,p.speed*s.speedFactor,p.work*s.workFactor,p.autonomy,p.reserve)}));
}
