import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {constrainCamera,coverageBounds,pixelSize,tileBounds,scaleBar} from '../dist/map-view.js';
const manifest=JSON.parse(fs.readFileSync(new URL('../dist/assets/data-manifest.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
test('zoom e deslocamento nunca expõem bordas fora do recorte local',()=>{
  for(const key of ['optical','topography','thermal'])for(const [width,height] of [[990,560],[354,490],[1920,1080]])for(const scale of [.00001,100]){
    const layer=manifest.layers[key],b=coverageBounds(layer),camera=constrainCamera({scale,center:{x:1e9,y:-1e9}},layer,width,height);
    assert.ok(camera.center.x-width/2/camera.scale>=b.minX-1e-6);assert.ok(camera.center.x+width/2/camera.scale<=b.maxX+1e-6);
    assert.ok(camera.center.y-height/2/camera.scale>=b.minY-1e-6);assert.ok(camera.center.y+height/2/camera.scale<=b.maxY+1e-6);
    assert.ok(camera.scale*pixelSize(layer)<=2+1e-6);
  }
});
test('a resolução usada no zoom vem do recorte, não do tamanho nominal do produto',()=>{assert.ok(pixelSize(manifest.layers.optical)>10);assert.ok(pixelSize(manifest.layers.topography)>300);assert.ok(pixelSize(manifest.layers.thermal)>150);});
test('a escala gráfica acompanha zoom local e regional e cabe no mapa',()=>{for(const scale of [.003,.01,.05,.2]){const bar=scaleBar(scale);assert.ok(bar.pixels>0&&bar.pixels<=100);assert.equal(bar.meters*scale,bar.pixels);assert.match(bar.label,/ (km|m)$/);}});
test('o mosaico óptico tem grade contígua e coordenadas KML consistentes',()=>{const layer=manifest.layers.optical;assert.equal(layer.tiles.length,49);assert.equal(new Set(layer.tiles.map(t=>`${t.row}/${t.col}`)).size,49);for(const tile of layer.tiles){const {bounds,...indices}=tile;const calculated=tileBounds(indices,layer);for(const k of ['north','south','east','west'])assert.ok(Math.abs(calculated[k]-bounds[k])<1e-9);assert.ok(fs.existsSync(new URL('../dist/'+tile.path,import.meta.url)));}});
