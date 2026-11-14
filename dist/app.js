import { BASE, TARGETS, HAZARDS, toGeo, fromGeo, length, findRoute, segmentBlocked, budget } from './planner.js';
import {constrainCamera,scaleBar,drawTiles,pixelSize,cameraLimits} from './map-view.js';
const $=id=>document.getElementById(id);
const fmt=(n,d=0)=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:d,minimumFractionDigits:d}).format(n);
const canvas=$('map'),ctx=canvas.getContext('2d'),dialog=$('sources-dialog');
const state={target:TARGETS[0],avoid:true,layer:'optical',center:{x:-500,y:200},scale:.085,route:null,manifest:null,images:new Map(),width:900,height:460,budget:null,drag:null,overlays:true,ready:false,views:{}};
let toastTimer;
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3500);}
function number(id,min,max){const input=$(id),n=Number(input.value);if(input.value.trim()===''||!Number.isFinite(n)||n<min||n>max){input.value=Math.max(min,Math.min(max,Number.isFinite(n)&&input.value.trim()!==''?n:min));toast('Parâmetro ajustado ao intervalo permitido.');}return Number(input.value);}
function params(){return {autonomy:number('autonomy',60,480),work:number('work',0,120),speed:number('speed',.5,6),reserve:number('reserve',0,180)};}
function plan(){
  const p=params();$('autonomy-value').textContent=p.autonomy+' min';$('work-value').textContent=p.work+' min';
  state.route=findRoute({x:0,y:0},state.target,state.avoid);
  if(!state.route){state.budget=null;$('result-chip').textContent='SEM PERCURSO';$('result-chip').className='result-chip danger';for(const id of ['distance-metric','time-metric','remaining-metric'])$(id).textContent='—';$('insight').textContent='Não foi possível encontrar um percurso fora das zonas de exclusão simuladas.';for(const id of ['walking-bar','work-bar','reserve-bar'])$(id).style.width='0';draw();return;}
  const distance=length(state.route)*2,b=budget(distance,p.speed,p.work,p.autonomy,p.reserve);state.budget=b;
  $('distance-metric').textContent=fmt(distance/1000,2)+' km';$('time-metric').textContent=fmt(b.total)+' min';$('remaining-metric').textContent=fmt(b.remaining)+' min';$('reserve-caption').textContent='Reserva configurada: '+p.reserve+' min';
  const crosses=state.route.some((point,i)=>i>0&&segmentBlocked(state.route[i-1],point));
  $('result-chip').textContent=!b.feasible?'RESERVA INSUFICIENTE':crosses?'CRUZA ZONA SIMULADA':'DENTRO DA AUTONOMIA';
  $('result-chip').className='result-chip'+(!b.feasible?' danger':crosses?' warning':'');
  const baseline=Math.hypot(state.target.x,state.target.y)*2,extra=Math.max(0,distance-baseline);
  const explanation=state.avoid?`O desvio contorna as zonas simuladas${extra>1?' e acrescenta '+fmt(extra)+' m ao percurso de ida e volta':''}.`:'A linha direta é uma referência de distância e pode atravessar zonas de exclusão simuladas.';
  $('insight').replaceChildren();const strong=document.createElement('strong');strong.textContent=b.feasible?`Reserva preservada: ${fmt(b.remaining-p.reserve)} min de folga. `:`Faltam ${fmt(b.excess)} min para preservar a reserva. `;$('insight').append(strong,document.createTextNode(explanation));
  const denominator=Math.max(p.autonomy,b.total+p.reserve);$('walking-bar').style.width=(b.walking/denominator*100)+'%';$('work-bar').style.width=(p.work/denominator*100)+'%';$('reserve-bar').style.width=(p.reserve/denominator*100)+'%';
  $('target-description').textContent=state.target.description;
  draw();
}
function screen(p){return {x:(p.x-state.center.x)*state.scale+state.width/2,y:state.height/2-(p.y-state.center.y)*state.scale};}
function ground(p){return {x:(p.x-state.width/2)/state.scale+state.center.x,y:(state.height/2-p.y)/state.scale+state.center.y};}
function constrain(){if(state.manifest?.layers?.[state.layer])Object.assign(state,constrainCamera(state,state.manifest.layers[state.layer],state.width,state.height));}
function resize(){const rect=canvas.getBoundingClientRect();state.width=rect.width;state.height=rect.height;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=rect.width*dpr;canvas.height=rect.height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);if(state.ready)recenter();else draw();}
function draw(){
  const {width:w,height:h}=state;ctx.clearRect(0,0,w,h);ctx.fillStyle='#292e25';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#bac6a50a';ctx.lineWidth=1;for(let x=0;x<w;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}for(let y=0;y<h;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
  const layer=state.manifest?.layers?.[state.layer];
  const visible=drawTiles(ctx,layer,state.images,screen,w,h);
  if(state.overlays && state.layer==='optical'){
  for(const hazard of HAZARDS){const p=screen(hazard),r=hazard.r*state.scale;ctx.save();ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fillStyle='#df9d4930';ctx.fill();ctx.strokeStyle='#edbd78aa';ctx.setLineDash([4,4]);ctx.lineWidth=1;ctx.stroke();ctx.clip();ctx.strokeStyle='#edbd7833';ctx.setLineDash([]);for(let x=p.x-r*2;x<p.x+r*2;x+=9){ctx.beginPath();ctx.moveTo(x,p.y-r);ctx.lineTo(x+r*2,p.y+r);ctx.stroke();}ctx.restore();}
  if(state.route){ctx.save();ctx.beginPath();state.route.forEach((p,i)=>{p=screen(p);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});ctx.strokeStyle='#241b10dd';ctx.lineWidth=5;ctx.stroke();ctx.strokeStyle='#ffd0a1';ctx.lineWidth=2;ctx.setLineDash([7,5]);ctx.stroke();ctx.restore();}
  for(const t of TARGETS){const p=screen(t),selected=state.target.id===t.id;ctx.save();ctx.beginPath();ctx.arc(p.x,p.y,selected?13:9,0,Math.PI*2);ctx.fillStyle=selected?'#efaa7d33':'#171e16cc';ctx.fill();ctx.strokeStyle=selected?'#ffc99b':'#e7e9d1';ctx.lineWidth=1.2;ctx.stroke();ctx.beginPath();ctx.arc(p.x,p.y,selected?4:2.5,0,Math.PI*2);ctx.fillStyle=selected?'#ffd4ad':'#e4e8d4';ctx.fill();if(selected){ctx.beginPath();ctx.arc(p.x,p.y,19,0,Math.PI*2);ctx.strokeStyle='#f5c39b55';ctx.stroke();}label(t.name,p.x+22,p.y-4,selected?'#f9d1ac':'#e1e6d4',t.tag);ctx.restore();}
  const base=screen({x:0,y:0});ctx.fillStyle='#e6ead5';ctx.strokeStyle='#283320';ctx.lineWidth=3;ctx.fillRect(base.x-7,base.y-7,14,14);ctx.strokeRect(base.x-7,base.y-7,14,14);label('Habitat ARES',base.x+18,base.y-3,'#eef0db','BASE HIPOTÉTICA');
  }else if(state.overlays){
    const base=screen({x:0,y:0});ctx.beginPath();ctx.arc(base.x,base.y,8,0,Math.PI*2);ctx.fillStyle='#f5b08a';ctx.fill();ctx.strokeStyle='#273022';ctx.lineWidth=3;ctx.stroke();label('Área da missão',base.x+18,base.y-3,'#f8d7be','JEZERO · CENÁRIO ARES');
  }
  // Norte é a direção positiva da latitude na projeção equiretangular.
  ctx.font='10px monospace';ctx.fillStyle='#e4e8d5';ctx.textAlign='center';ctx.fillText('N',w-32,h-99);ctx.beginPath();ctx.moveTo(w-32,h-91);ctx.lineTo(w-36,h-79);ctx.lineTo(w-32,h-83);ctx.lineTo(w-28,h-79);ctx.closePath();ctx.fill();
  const bar=scaleBar(state.scale);document.querySelector('.scale div').style.width=bar.pixels+'px';$('scale-text').textContent=bar.label;
  $('map-empty').hidden=visible>0||!state.ready;
  const limits=cameraLimits(layer,w,h);$('zoom-in').disabled=!!layer&&state.scale>=limits.maxScale*.999;$('zoom-out').disabled=!!layer&&state.scale<=limits.minScale*1.001;
}
function label(title,x,y,color,subtitle){if(x< -150||x>state.width+25||y< -20||y>state.height+20)return;ctx.font='500 11px Arial';const width=Math.max(ctx.measureText(title).width,subtitle.length*4.9)+18;const rightInset=y>110&&y<280?65:12;x=Math.max(12,Math.min(x,state.width-width-rightInset));y=Math.max(25,Math.min(y,state.height-100));if(x<Math.min(270,state.width-60)&&y<145)y=160;ctx.fillStyle='#172016e8';ctx.beginPath();ctx.roundRect(x-7,y-16,width,38,4);ctx.fill();ctx.textAlign='left';ctx.fillStyle=color;ctx.fillText(title,x,y-2);ctx.fillStyle='#b8c5a7';ctx.font='7px monospace';ctx.fillText(subtitle,x,y+12);}
function setLayer(key){
  state.views[state.layer]={scale:state.scale,center:{...state.center}};state.layer=key;
  document.querySelectorAll('[data-layer]').forEach(b=>{const selected=b.dataset.layer===key;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',selected);});
  const captions={optical:'MRO · CTX / ÓPTICO',topography:'MGS · MOLA / RELEVO',thermal:'ODYSSEY · THEMIS / INFRAVERMELHO'};$('layer-caption').textContent=captions[key];
  const l=state.manifest?.layers?.[key];$('tile-status').textContent=l?.tiles?.length?'Recorte NASA · salvo localmente':'Camada indisponível';
  $('resolution-note').textContent=l?' · visualização ≈ '+fmt(pixelSize(l))+' m/px':'';$('coverage-note').textContent=key==='optical'?' · NASA Mars 2020 / Caltech':'';
  $('map-source-credit').textContent=key==='optical'?'NASA / MSSS / Caltech · CTX':'NASA / JPL-Caltech · Mars Trek';
  $('layer-description').textContent=key==='optical'?'Detalhe da exploração · mosaico CTX de Jezero':key==='topography'?'Relevo regional · observe a cratera e seu entorno':'Infravermelho diurno · contexto regional da superfície';
  $('view-mission').hidden=key==='optical';$('map-legend').hidden=!state.overlays||key!=='optical';
  if(state.views[key]){Object.assign(state,state.views[key]);constrain();draw();}else recenter();
}
function recenter(){
  if(state.layer==='optical'){
    const xs=[0,...TARGETS.map(t=>t.x)],ys=[0,...TARGETS.map(t=>t.y)];
    state.center={x:(Math.min(...xs)+Math.max(...xs))/2,y:(Math.min(...ys)+Math.max(...ys))/2};
    state.scale=Math.min(Math.max(100,state.width-160)/(Math.max(...xs)-Math.min(...xs)),Math.max(150,state.height-190)/(Math.max(...ys)-Math.min(...ys)));
  }else{state.center={x:0,y:0};state.scale=state.height/(state.layer==='topography'?85000:55000);}
  constrain();draw();
}
function sourceCard(title,body){return `<article class="source-item"><h3>${title}</h3>${body}</article>`;}
function showSources(){
  const manifest=state.manifest,layer=key=>manifest?.layers?.[key];
  $('sources-content').innerHTML=`<p class="source-note">As imagens são produtos históricos de missões NASA. Habitat, destinos, zonas de exclusão e parâmetros de caminhada são um cenário de demonstração. O planejamento usa distância e essas zonas; não calcula declividade nem valida segurança operacional.</p>`+
  sourceCard('Desafio NASA Space Apps 2026',`<p><a href="https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/?tab=resources" target="_blank" rel="noopener noreferrer">Interplanetary Survival Guide: Martian Map — Recursos ↗</a></p><p>Lista oficial conferida em 14/11/2026. Recurso integrado: <a href="https://trek.nasa.gov/mars/" target="_blank" rel="noopener noreferrer">NASA / JPL Mars Trek</a>, origem das camadas de relevo e infravermelho. O mapa óptico utiliza um mosaico local do projeto NASA Mars 2020 / Caltech.</p><p>Os demais recursos indicados pelo desafio são: <a href="https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars" target="_blank" rel="noopener noreferrer">Mapas geológicos USGS–NASA</a>; <a href="https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/" target="_blank" rel="noopener noreferrer">exemplo de rota do Curiosity</a>; <a href="https://worldview.earthdata.nasa.gov/" target="_blank" rel="noopener noreferrer">NASA Worldview</a> (Terra, referência de interface); e <a href="https://mars.nasa.gov/mars2020/multimedia/raw-images/" target="_blank" rel="noopener noreferrer">galeria de imagens do Perseverance</a>. São referências complementares, não camadas integradas nesta versão.</p><p><a href="assets/challenge-resources.json" target="_blank" rel="noopener noreferrer">Registro das referências oficiais ↗</a></p>`)+
  sourceCard('01 / Óptico · Mars Reconnaissance Orbiter',`<p>Mosaico CTX de Jezero e Northeast Syrtis, preparado pelo Murray Lab / Caltech para o grupo de seleção de local do projeto NASA Mars 2020. Produto nominal de 5 m/pixel; os recortes desta visualização têm aproximadamente ${fmt(pixelSize(layer('optical')))} m/pixel. A cobertura local foi verificada para evitar as lacunas do mosaico global beta usado anteriormente.</p><p>As imagens são exibidas sem filtros de cor ou escurecimento. O zoom é limitado à resolução dos recortes, e o deslocamento fica dentro da área disponível. O produto é registrado ao mosaico THEMIS, mas não é quantitativamente controlado nem validado para navegação operacional.</p><code>Mars2020CTX_E76_N16</code><p><a href="https://murray-lab.caltech.edu/Mars2020/index.html" target="_blank" rel="noopener noreferrer">Produto NASA Mars 2020 / Caltech ↗</a> · <a href="https://murray-lab.caltech.edu/Mars2020/kml/CTX/Mars2020CTX_E76_N16/Mars2020CTX_E76_N16.kml" target="_blank" rel="noopener noreferrer">Georreferência KML ↗</a> · ${layer('optical')?.tiles.length??0} tiles locais</p>`)+
  sourceCard('02 / Topográfico · Mars Global Surveyor',`<p>MOLA Color Hillshade, produto nominal de 463 m/pixel. É uma representação colorida do relevo regional. As cores e o sombreado não são usados como valores de elevação. Não há cálculo de declividade local nesta versão.</p><code>Mars_MGS_MOLA_ClrShade_merge_global_463m</code><p><a href="https://trek.nasa.gov/tiles/Mars/EQ/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/WMTSCapabilities.xml" target="_blank" rel="noopener noreferrer">Metadados WMTS ↗</a> · ${layer('topography')?.tiles.length??0} tiles locais</p>`)+
  sourceCard('03 / Térmico · Mars Odyssey',`<p>Mosaico infravermelho diurno THEMIS, produto nominal de 100 m/pixel. Mostra contexto em infravermelho; o brilho não é convertido em temperatura. O mosaico não representa o clima atual nem uma previsão.</p><code>Mars_MO_THEMIS-IR-Day_mosaic_global_100m_v12_clon0_ly</code><p><a href="https://trek.nasa.gov/tiles/Mars/EQ/Mars_MO_THEMIS-IR-Day_mosaic_global_100m_v12_clon0_ly/1.0.0/WMTSCapabilities.xml" target="_blank" rel="noopener noreferrer">Metadados WMTS ↗</a> · ${layer('thermal')?.tiles.length??0} tiles locais</p>`)+
  sourceCard('Contexto óptico / Viking — arquivo complementar',`<p>O mosaico Viking de 232 m/pixel permanece no arquivo de dados para consulta. Não é sobreposto ao mosaico CTX local nesta versão; cada camada é exibida separadamente para preservar sua legibilidade.</p><code>Mars_Viking_MDIM21_ClrMosaic_global_232m</code><p><a href="https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/WMTSCapabilities.xml" target="_blank" rel="noopener noreferrer">Metadados WMTS ↗</a> · ${layer('context')?.tiles.length??0} tiles locais</p>`)+
  sourceCard('Modelo de planejamento',`<p>A* em grade de 80 m, seguido de simplificação de segmentos, desvia de três zonas circulares hipotéticas com margem de 80 m. A linha direta permite comparação. A distância inclui retorno pelo mesmo percurso. O tempo soma caminhada a velocidade constante e pesquisa; a reserva é descontada da autonomia disponível.</p><p>Coordenadas locais em projeção equiretangular centrada em Jezero; raio equatorial de Marte de 3.396.190 m. Distâncias aproximadas para uma pequena região. Nenhum cálculo de radiação, oxigênio, esforço fisiológico ou abrigo foi inferido das imagens.</p>`)+
  sourceCard('Origem e reprodução',`<p>Créditos: NASA / JPL-Caltech / MSSS / Caltech (CTX); NASA / GSFC (MOLA); NASA / JPL-Caltech / Arizona State University (THEMIS). Consulte os metadados de cada produto.</p><p>As URLs de origem, a data do download e os índices de todos os tiles estão no <a href="assets/data-manifest.json" target="_blank" rel="noopener noreferrer">manifesto de dados ↗</a>. ${manifest?.retrievedAt?'Download: '+new Date(manifest.retrievedAt).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'})+'.':''} As datas das observações variam entre produtos; o download não é a data de aquisição.</p>`);
  if(!dialog.open)dialog.showModal();
}
function exportPlan(){if(!state.route||!state.budget){toast('Calcule um percurso antes de exportar.');return;}const p=params(),outbound=state.route.map(toGeo),data={name:'ARES-01',prototype:true,exportedAt:new Date().toISOString(),target:{name:state.target.name,coordinates:toGeo(state.target),simulated:true},habitat:{...BASE,simulated:true},strategy:state.avoid?'avoid_simulated_zones':'direct',parameters:{...p,speedUnit:'km/h',timeUnit:'minutes'},results:{distanceMeters:length(state.route)*2,...state.budget},route:{type:'LineString',coordinates:[...outbound,...outbound.slice(0,-1).reverse()].map(p=>[p.lon,p.lat])},hazards:{simulated:true,bufferMeters:80,zones:HAZARDS},sources:state.manifest,limitations:'Distância e autonomia simuladas. Sem declividade, consumo de O2, previsão meteorológica ou avaliação operacional de segurança.'};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='ares-plano-missao.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Plano exportado com parâmetros e fontes.');}
for(const id of ['sources-top','sources-bottom','nav-data'])$(id).addEventListener('click',showSources);
$('close-sources').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
$('destination').addEventListener('change',()=>{state.target=TARGETS.find(t=>t.id===$('destination').value);plan();recenter();});
for(const id of ['autonomy','work'])$(id).addEventListener('input',plan);for(const id of ['speed','reserve'])$(id).addEventListener('change',plan);
for(const avoid of [true,false])$(avoid?'route-avoid':'route-direct').addEventListener('click',()=>{state.avoid=avoid;for(const a of [true,false]){const b=$(a?'route-avoid':'route-direct');b.classList.toggle('selected',a===avoid);b.setAttribute('aria-pressed',a===avoid);}plan();});
$('plan').addEventListener('click',()=>{plan();recenter();toast('Plano recalculado com os parâmetros selecionados.');});$('export').addEventListener('click',exportPlan);
document.querySelectorAll('[data-layer]').forEach(b=>b.addEventListener('click',()=>setLayer(b.dataset.layer)));
function zoom(factor){state.scale*=factor;constrain();draw();}
$('zoom-in').addEventListener('click',()=>zoom(1.35));$('zoom-out').addEventListener('click',()=>zoom(1/1.35));$('recenter').addEventListener('click',recenter);
$('toggle-overlays').addEventListener('click',()=>{state.overlays=!state.overlays;$('toggle-overlays').setAttribute('aria-pressed',state.overlays);$('toggle-overlays').textContent=state.overlays?'Ocultar marcações':'Mostrar marcações';$('map-legend').hidden=!state.overlays||state.layer!=='optical';draw();});
$('view-mission').addEventListener('click',()=>{setLayer('optical');recenter();});
const mapCard=canvas.closest('.map-card');
function updateExpanded(){const expanded=!!document.fullscreenElement||mapCard.classList.contains('map-expanded');$('fullscreen-map').textContent=expanded?'×':'⛶';$('fullscreen-map').setAttribute('aria-label',expanded?'Sair da tela cheia':'Ampliar mapa em tela cheia');}
function expandedFallback(enabled){mapCard.classList.toggle('map-expanded',enabled);document.body.classList.toggle('map-is-expanded',enabled);updateExpanded();}
$('fullscreen-map').addEventListener('click',async()=>{if(document.fullscreenElement){await document.exitFullscreen();return;}if(mapCard.classList.contains('map-expanded')){expandedFallback(false);return;}try{await mapCard.requestFullscreen();}catch{expandedFallback(true);}updateExpanded();});
document.addEventListener('fullscreenchange',updateExpanded);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&mapCard.classList.contains('map-expanded'))expandedFallback(false);});
$('nav-map').addEventListener('click',()=>{$('map').scrollIntoView({behavior:'smooth',block:'center'});canvas.focus({preventScroll:true});});$('nav-targets').addEventListener('click',()=>$('destination').focus());
canvas.addEventListener('pointerdown',e=>{state.drag={x:e.clientX,y:e.clientY,start:{...state.center},moved:false};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!state.drag)return;const dx=e.clientX-state.drag.x,dy=e.clientY-state.drag.y;if(Math.hypot(dx,dy)>5)state.drag.moved=true;state.center={x:state.drag.start.x-dx/state.scale,y:state.drag.start.y+dy/state.scale};constrain();draw();});
canvas.addEventListener('pointerup',e=>{if(state.drag&&!state.drag.moved){const r=canvas.getBoundingClientRect(),p=ground({x:e.clientX-r.left,y:e.clientY-r.top}),t=TARGETS.find(t=>Math.hypot(p.x-t.x,p.y-t.y)<25/state.scale);if(t){state.target=t;$('destination').value=t.id;plan();}}state.drag=null;});canvas.addEventListener('pointercancel',()=>state.drag=null);
canvas.addEventListener('wheel',e=>{e.preventDefault();const rect=canvas.getBoundingClientRect(),point={x:e.clientX-rect.left,y:e.clientY-rect.top},before=ground(point);state.scale*=e.deltaY<0?1.12:1/1.12;constrain();const after=ground(point);state.center.x+=before.x-after.x;state.center.y+=before.y-after.y;constrain();draw();},{passive:false});
canvas.addEventListener('keydown',e=>{const move=50/state.scale;if(e.key==='ArrowLeft')state.center.x-=move;else if(e.key==='ArrowRight')state.center.x+=move;else if(e.key==='ArrowUp')state.center.y+=move;else if(e.key==='ArrowDown')state.center.y-=move;else return;e.preventDefault();constrain();draw();});
document.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='d'&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)&&!dialog.open){e.preventDefault();showSources();}});
new ResizeObserver(resize).observe(canvas);plan();resize();recenter();
try{
  const response=await fetch('assets/data-manifest.json',{cache:'no-store'});if(!response.ok)throw new Error('Manifesto indisponível');state.manifest=await response.json();
  const tasks=Object.values(state.manifest.layers).flatMap(layer=>layer.tiles.map(tile=>new Promise(resolve=>{const img=new Image();state.images.set(tile.path,img);img.onload=()=>{draw();resolve();};img.onerror=()=>{resolve();draw();};img.src=tile.path;})));
  await Promise.all(tasks);state.ready=true;setLayer(state.layer);recenter();
}catch(error){state.manifest={layers:{}};state.ready=true;$('tile-status').textContent='Cartografia indisponível';$('map-empty').hidden=false;draw();console.error(error);}
