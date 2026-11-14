// Clip NASA/JPL's Perseverance traverse (MMGIS GeoJSON) to the ARES terrain subset, in local metres.
// Output: dist/assets/perseverance-traverse.json. Run: node tools/prepare-traverse.mjs (no dependencies).
import fs from 'node:fs';
import crypto from 'node:crypto';
import {fromGeo,createTerrain,cellId} from '../dist/terrain-planner.js';

const SOURCE='https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json';
const root=new URL('../',import.meta.url),cache=new URL('.local/downloads/traverse/M20_traverse.json',root);
if(!fs.existsSync(cache)){fs.mkdirSync(new URL('.',cache),{recursive:true});const r=await fetch(SOURCE);if(!r.ok)throw new Error('Traverse HTTP '+r.status);fs.writeFileSync(cache,Buffer.from(await r.arrayBuffer()));}
const raw=fs.readFileSync(cache),geo=JSON.parse(raw);
const terrain=createTerrain(JSON.parse(fs.readFileSync(new URL('dist/assets/jezero-terrain.json',root),'utf8')));
const MIN_SPACING=8; // metres between kept vertices; display only
const segments=[];let kept=0,inputInside=0;
for(const f of geo.features){
  if(f.geometry?.type!=='LineString')continue;let run=[];
  const flush=()=>{if(run.length>1){segments.push({sol:f.properties.sol,points:run});kept+=run.length;}run=[];};
  for(const [lon,lat]of f.geometry.coordinates){
    const p=fromGeo({lon,lat});if(cellId(p,terrain)<0){flush();continue;}inputInside++;
    const last=run.at(-1);if(!last||Math.hypot(p.x-last[0],p.y-last[1])>=MIN_SPACING)run.push([Math.round(p.x*10)/10,Math.round(p.y*10)/10]);
  }
  flush();
}
const sols=segments.map(s=>s.sol);
const out={id:'M20_traverse_ARES_subset',title:'Perseverance traverse inside the ARES map',source:SOURCE,sourceSha256:crypto.createHash('sha256').update(raw).digest('hex'),preparedAt:new Date().toISOString(),
  origin:terrain.origin,solRange:[Math.min(...sols),Math.max(...sols)],segmentCount:segments.length,vertexCount:kept,inputVerticesInside:inputInside,simplification:`Consecutive vertices closer than ${MIN_SPACING} m dropped for display. Coordinates in metres in the ARES local frame.`,
  meaning:'Ground a NASA rover has already driven. It shows proven trafficability for a rover at the time of the drive; it is not a certified walking path.',segments};
fs.writeFileSync(new URL('dist/assets/perseverance-traverse.json',root),JSON.stringify(out));
console.log(JSON.stringify({segments:segments.length,vertices:kept,inputInside,solRange:out.solRange,bytes:fs.statSync(new URL('dist/assets/perseverance-traverse.json',root)).size}));
