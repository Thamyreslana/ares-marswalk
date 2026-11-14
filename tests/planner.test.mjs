import test from 'node:test';
import assert from 'node:assert/strict';
import { TARGETS,HAZARDS,findRoute,length,segmentBlocked,budget,toGeo,fromGeo } from '../dist/planner.js';
test('todos os destinos têm percurso que evita zonas, incluindo cada segmento',()=>{
  for(const target of TARGETS){const route=findRoute({x:0,y:0},target);assert.ok(route);assert.deepEqual(route[0],{x:0,y:0});assert.equal(route.at(-1),target);for(let i=1;i<route.length;i++)assert.equal(segmentBlocked(route[i-1],route[i]),false);assert.ok(length(route)>Math.hypot(target.x,target.y));}
});
test('linha direta fornece referência e cruza zonas do cenário',()=>{const route=findRoute({x:0,y:0},TARGETS[0],false);assert.equal(route.length,2);assert.equal(segmentBlocked(...route),true);});
test('destino ou origem em zona bloqueada não produz rota',()=>{assert.equal(findRoute({x:0,y:0},HAZARDS[0]),null);assert.equal(findRoute(HAZARDS[0],TARGETS[0]),null);});
test('autonomia inclui ida e volta, pesquisa e reserva; igualdade é viável',()=>{const distance=length([{x:0,y:0},{x:3000,y:0}])*2;assert.equal(budget(distance,3,20,180,40).total,140);assert.equal(budget(distance,3,20,180,40).feasible,true);assert.equal(budget(distance,3,20,179,40).feasible,false);assert.equal(budget(distance,3,20,100,40).remaining,-40);});
test('coordenadas locais usam Marte e preservam sinais e escala',()=>{for(const p of [{x:0,y:0},{x:-2300,y:1800},{x:1200,y:-300}]){const result=fromGeo(toGeo(p));assert.ok(Math.abs(result.x-p.x)<1e-6);assert.ok(Math.abs(result.y-p.y)<1e-6);}});
test('modelo recusa velocidade inválida',()=>{assert.throws(()=>budget(1000,0,20,200,30));});
