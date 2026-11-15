import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {constrainCamera,coverageBounds,pixelSize,tileBounds,scaleBar,registration,drawTiles} from '../dist/map-view.js';
import {fromGeo} from '../dist/planner.js';
const manifest=JSON.parse(fs.readFileSync(new URL('../dist/assets/data-manifest.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
test('zoom and pan never expose edges outside the local subset',()=>{
  for(const key of ['optical','topography','thermal'])for(const [width,height] of [[990,560],[354,490],[1920,1080]])for(const scale of [.00001,100]){
    const layer=manifest.layers[key],b=coverageBounds(layer),camera=constrainCamera({scale,center:{x:1e9,y:-1e9}},layer,width,height);
    assert.ok(camera.center.x-width/2/camera.scale>=b.minX-1e-6);assert.ok(camera.center.x+width/2/camera.scale<=b.maxX+1e-6);
    assert.ok(camera.center.y-height/2/camera.scale>=b.minY-1e-6);assert.ok(camera.center.y+height/2/camera.scale<=b.maxY+1e-6);
    assert.ok(camera.scale*pixelSize(layer)<=2+1e-6);
  }
});
test('zoom resolution comes from the subset, not the nominal product resolution',()=>{assert.ok(pixelSize(manifest.layers.optical)>10);assert.ok(pixelSize(manifest.layers.topography)>300);assert.ok(pixelSize(manifest.layers.thermal)>150);});
test('the scale bar follows local and regional zoom and fits on the map',()=>{for(const scale of [.003,.01,.05,.2]){const bar=scaleBar(scale);assert.ok(bar.pixels>0&&bar.pixels<=100);assert.equal(bar.meters*scale,bar.pixels);assert.match(bar.label,/ (km|m)$/);}});
test('the optical mosaic is a contiguous grid with consistent KML coordinates',()=>{const layer=manifest.layers.optical;assert.equal(layer.tiles.length,49);assert.equal(new Set(layer.tiles.map(t=>`${t.row}/${t.col}`)).size,49);for(const tile of layer.tiles){const {bounds,...indices}=tile;const calculated=tileBounds(indices,layer);for(const k of ['north','south','east','west'])assert.ok(Math.abs(calculated[k]-bounds[k])<1e-9);assert.ok(fs.existsSync(new URL('../dist/'+tile.path,import.meta.url)));}});
test('only the CTX mosaic gets the registration measured against the USGS reference',()=>{
  const reg=registration(manifest.layers.optical);assert.deepEqual({...reg},{east:-55,north:105});
  for(const key of ['topography','thermal','context'])assert.deepEqual(registration(manifest.layers[key]),{east:0,north:0});
  const report=JSON.parse(fs.readFileSync(new URL('../dist/assets/alignment-measurement.json',import.meta.url),'utf8'));
  assert.deepEqual(report.displayRegistration,{product:manifest.layers.optical.product,east:reg.east,north:reg.north});
  for(const l of report.landmarks)assert.ok(Math.hypot(l.aresCtxRegistered.east,l.aresCtxRegistered.north)<=20,l.id);
});
test('CTX tiles are drawn with the registration shift, in metres',()=>{
  const layer=manifest.layers.optical,tile=layer.tiles[0],calls=[];const ctx={save(){},restore(){},drawImage:(...a)=>calls.push(a)};
  const images=new Map([[tile.path,{complete:true,naturalWidth:256}]]),screen=p=>({x:p.x+1e6,y:1e6-p.y});
  drawTiles(ctx,{...layer,tiles:[tile]},images,screen,1e9,1e9);
  const b=tileBounds(tile,layer),nw=fromGeo({lon:b.west,lat:b.north});
  assert.ok(Math.abs(calls[0][1]-(nw.x-55+1e6))<1e-6);assert.ok(Math.abs(calls[0][2]-(1e6-(nw.y+105)))<1e-6);
});
