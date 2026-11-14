import {BASE,TARGET,DEFAULT_POLICY,createTerrain,findTerrainRoute,analyzeRoute,sensitivity,toGeo,sampleTerrain,cellId} from './planner.js';
import {constrainCamera,cameraLimits,scaleBar,drawTiles,pixelSize} from './map-view.js';
import {language,setLanguage,t,format as fmt,translatePage} from './i18n.js';
import {renderEvidence} from './evidence.js';

const $=id=>document.getElementById(id),canvas=$('map'),ctx=canvas.getContext('2d'),dialog=$('sources-dialog'),settingsDialog=$('settings-dialog');
const state={terrain:null,terrainError:false,manifest:null,images:new Map(),route:null,terrainRoute:null,directRoute:[{x:0,y:0},TARGET],analyses:null,scenarios:null,strategy:'terrain',layer:'optical',center:{x:400,y:-1000},scale:.1,width:900,height:510,drag:null,overlays:true,ready:false,views:{},routeCache:new Map(),slopeLayers:new Map()};
let toastTimer;
const localLayer=()=>state.layer==='optical'||state.layer==='slope';
const imageLayer=()=>state.manifest?.layers?.[state.layer==='slope'?'optical':state.layer];
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3200);}
function readNumber(id,min,max){const el=$(id),n=Number(el.value);if(el.value.trim()===''||!Number.isFinite(n)||n<min||n>max){el.value=Math.max(min,Math.min(max,Number.isFinite(n)&&el.value.trim()!==''?n:min));toast(t('adjusted'));}return Number(el.value);}
function params(){return {autonomy:readNumber('autonomy',60,480),work:readNumber('work',0,120),speed:readNumber('speed',.5,6),reserve:readNumber('reserve',0,180),maxSlope:readNumber('slope-limit',3,25)};}
function policy(){return {...DEFAULT_POLICY,maxSlope:Number($('slope-limit').value)};}
function setStatus(key,kind=''){const el=$('result-chip');el.textContent=t(key);el.className='result-chip'+(kind?' '+kind:'');}
function clearResults(key){for(const id of ['distance-metric','time-metric','remaining-metric'])$(id).textContent='—';for(const id of ['walking-bar','work-bar','reserve-bar'])$(id).style.width='0';$('insight').textContent=t(key);$('scenario-body').replaceChildren();$('elevation-profile').replaceChildren();$('ascent-metric').textContent='';state.scenarios=null;}

function calculate(){
  const p=params();$('autonomy-value').textContent=p.autonomy+' min';$('work-value').textContent=p.work+' min';$('slope-value').textContent=p.maxSlope+'°';$('reserve-caption').textContent=t('reserveConfigured')+': '+p.reserve+' min';
  if(!state.terrain){clearResults(state.terrainError?'dataFailed':'dataLoading');setStatus(state.terrainError?'noRoute':'statusLoading',state.terrainError?'danger':'');return;}
  if(!state.routeCache.has(p.maxSlope))state.routeCache.set(p.maxSlope,findTerrainRoute({x:0,y:0},TARGET,state.terrain,policy()));
  state.terrainRoute=state.routeCache.get(p.maxSlope);
  state.route=state.strategy==='terrain'?state.terrainRoute:state.directRoute;
  state.analyses={terrain:analyzeRoute(state.terrainRoute,state.terrain,policy()),direct:analyzeRoute(state.directRoute,state.terrain,policy())};
  const current=state.analyses[state.strategy];
  $('plan').disabled=false;$('export').disabled=!state.route;
  renderComparison();
  if(!state.route||!current){clearResults('noRouteText');setStatus('noRoute','danger');draw();return;}
  const scenarios=sensitivity(current.roundTripMeters,p),base=scenarios[1],conservative=scenarios[2];state.scenarios=scenarios;
  $('distance-metric').textContent=fmt(current.roundTripMeters/1000,2)+' km';$('time-metric').textContent=fmt(base.total)+' min';$('remaining-metric').textContent=fmt(base.remaining)+' min';
  if(!current.passable)setStatus('blocked','danger');else if(!base.feasible)setStatus('insufficient','danger');else if(!conservative.feasible)setStatus('conditional','warning');else setStatus('robust');
  const denominator=Math.max(p.autonomy,base.total+p.reserve);$('walking-bar').style.width=base.walking/denominator*100+'%';$('work-bar').style.width=base.work/denominator*100+'%';$('reserve-bar').style.width=p.reserve/denominator*100+'%';
  const note=base.feasible?(conservative.feasible?t('robustText',{margin:fmt(conservative.remaining-p.reserve)}):t('conditionalText',{short:fmt(conservative.excess)})):t('insufficientText',{short:fmt(base.excess)});
  let terrainNote='';if(current.unknownSamples)terrainNote=t('unknownText');else if(current.blockedCells)terrainNote=t('baselineWarn',{count:current.blockedCells,limit:p.maxSlope});
  $('insight').textContent=[terrainNote,note].filter(Boolean).join(' ');
  renderScenarios();renderProfile(current);draw();
}

function renderComparison(){
  const body=$('comparison-body');body.replaceChildren();
  for(const kind of ['direct','terrain']){
    const a=state.analyses?.[kind],tr=document.createElement('tr');tr.className=kind+'-row';
    const cells=[t(kind==='terrain'?'terrainAware':'direct'),a?fmt(a.roundTripMeters/1000,2)+' km':'—',a?.maxSlope!=null?fmt(a.maxSlope,1)+'°':'—',a?String(a.blockedCells):'—',a?fmt(a.terrainCost):'—'];
    for(const [i,value]of cells.entries()){const td=document.createElement(i===0?'th':'td');if(i===0)td.scope='row';td.textContent=value;tr.append(td);}body.append(tr);
  }
  const a=state.analyses?.terrain,d=state.analyses?.direct;
  $('route-explanation').textContent=!a?t('noRouteText'):a.roundTripMeters-d.roundTripMeters<1?t('sameRoute'):t('decision',{extra:fmt(a.roundTripMeters-d.roundTripMeters),before:fmt(d.maxSlope,1),after:fmt(a.maxSlope,1)});
}
function renderScenarios(){
  const body=$('scenario-body');body.replaceChildren();
  for(const s of state.scenarios??[]){const tr=document.createElement('tr');for(const value of [t(s.id),fmt(s.speed,2)+' km/h',fmt(s.total)+' min',fmt(s.remaining)+' min',t(s.feasible?'reserveHolds':'reserveFails')]){const td=document.createElement('td');td.textContent=value;tr.append(td);}tr.lastChild.className=s.feasible?'scenario-ok':'scenario-warn';body.append(tr);}
}
function renderProfile(analysis){
  const points=analysis.profile.filter(p=>p.known);if(!points.length){$('elevation-profile').replaceChildren();return;}
  const values=points.map(p=>p.elevation),min=Math.floor(Math.min(...values)-2),max=Math.ceil(Math.max(...values)+2),width=Math.max(280,Math.min(760,$('elevation-profile').clientWidth||760)),height=130,pad=48;
  const x=p=>pad+p.distance/Math.max(1,analysis.outboundMeters)*(width-pad-12),y=p=>14+(max-p.elevation)/Math.max(1,max-min)*(height-42);
  let penDown=false;const chunks=[],areas=[];let chunk=[];
  for(const p of analysis.profile){if(!p.known){if(chunk.length)areas.push(chunk);chunk=[];penDown=false;continue;}chunks.push((penDown?'L':'M')+x(p).toFixed(2)+' '+y(p).toFixed(2));chunk.push(p);penDown=true;}if(chunk.length)areas.push(chunk);
  const line=chunks.join(' '),area=areas.map(group=>group.map((p,i)=>(i?'L':'M')+x(p).toFixed(2)+' '+y(p).toFixed(2)).join(' ')+` L ${x(group.at(-1))} ${height-28} L ${x(group[0])} ${height-28} Z`).join(' ');
  $('elevation-profile').innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="profile-title"><title id="profile-title">${t('profile')}</title><defs><linearGradient id="elevation-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ef9a76" stop-opacity=".28"/><stop offset="1" stop-color="#ef9a76" stop-opacity=".03"/></linearGradient></defs><path d="M ${pad} 14 V ${height-28} H ${width-12}" fill="none" stroke="#48543c" stroke-width="1"/><path d="${area}" fill="url(#elevation-fill)"/><path d="${line}" stroke="#efb18b" stroke-width="2" fill="none"/><g fill="#9baa8b" font-size="9" font-family="monospace"><text x="0" y="18">${fmt(max)} m</text><text x="0" y="${height-30}">${fmt(min)} m</text><text x="${pad}" y="${height-8}">0</text><text text-anchor="end" x="${width-12}" y="${height-8}">${fmt(analysis.outboundMeters/1000,2)} km · Rochette</text></g></svg>`;
  $('ascent-metric').textContent=t('ascent')+': '+fmt(analysis.roundTripAscentMeters)+' m';
}

function screen(p){return {x:(p.x-state.center.x)*state.scale+state.width/2,y:state.height/2-(p.y-state.center.y)*state.scale};}
function ground(p){return {x:(p.x-state.width/2)/state.scale+state.center.x,y:(state.height/2-p.y)/state.scale+state.center.y};}
function constrain(){const layer=imageLayer();if(layer)Object.assign(state,constrainCamera(state,layer,state.width,state.height));}
function resize(){const rect=canvas.getBoundingClientRect();state.width=rect.width;state.height=rect.height;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);if(state.ready)recenter();else draw();if(state.analyses?.[state.strategy])renderProfile(state.analyses[state.strategy]);}
function recenter(){
  if(localLayer()){
    const points=state.terrainRoute??state.directRoute,xs=points.map(p=>p.x),ys=points.map(p=>p.y),minX=Math.min(...xs)-550,maxX=Math.max(...xs)+550,minY=Math.min(...ys)-500,maxY=Math.max(...ys)+500;
    state.center={x:(minX+maxX)/2,y:(minY+maxY)/2};state.scale=Math.min(Math.max(100,state.width-90)/(maxX-minX),Math.max(150,state.height-130)/(maxY-minY));
  }else{state.center={x:0,y:0};state.scale=state.height/(state.layer==='topography'?85000:55000);}
  constrain();draw();
}
function terrainImage(full){
  if(!state.terrain)return null;const key=(full?'full':'blocked')+policy().maxSlope;if(state.slopeLayers.has(key))return state.slopeLayers.get(key);
  const g=state.terrain,c=document.createElement('canvas');c.width=g.cols;c.height=g.rows;const context=c.getContext('2d'),image=context.createImageData(g.cols,g.rows),limit=policy().maxSlope;
  for(let i=0;i<g.slopes.length;i++){
    const offset=i*4;if(!g.valid[i]){if(full){image.data[offset]=75;image.data[offset+1]=80;image.data[offset+2]=70;image.data[offset+3]=180;}continue;}
    const slope=g.slopes[i],over=slope>limit;if(!full&&!over)continue;
    const color=over?[224,105,78,full?200:90]:slope>5?[219,184,99,130]:[95,155,111,100];image.data.set(color,offset);
  }
  context.putImageData(image,0,0);state.slopeLayers.set(key,c);return c;
}
function drawTerrain(){const full=state.layer==='slope',image=terrainImage(full);if(!image)return;const g=state.terrain,tl=screen({x:g.xMin,y:g.yMax}),br=screen({x:g.xMin+g.cols*g.step,y:g.yMax-g.rows*g.step});ctx.save();ctx.imageSmoothingEnabled=false;ctx.drawImage(image,tl.x,tl.y,br.x-tl.x,br.y-tl.y);ctx.restore();}
function drawPath(points,color,width,dash=[]){if(!points?.length)return;ctx.save();ctx.beginPath();points.forEach((p,i)=>{const q=screen(p);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y);});ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle='#102015b0';ctx.lineWidth=width+2.5;ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.stroke();ctx.restore();}
function label(title,p,subtitle,color='#eef0db'){
  if(p.x<0||p.x>state.width||p.y<0||p.y>state.height)return;
  ctx.save();ctx.font='500 11px Arial';const width=Math.max(ctx.measureText(title).width,subtitle.length*4.5)+18;
  let x=p.x+18,y=p.y-2;if(x+width>state.width-50)x=p.x-width-18;if(x<10)x=10;
  y=Math.max(135,Math.min(y,state.height-105));ctx.fillStyle='#142014ed';ctx.beginPath();ctx.roundRect(x-7,y-16,width,38,4);ctx.fill();ctx.fillStyle=color;ctx.textAlign='left';ctx.fillText(title,x,y-2);ctx.font='7px monospace';ctx.fillStyle='#b8c5a7';ctx.fillText(subtitle,x,y+12);ctx.restore();
}
function draw(){
  const {width:w,height:h}=state;ctx.clearRect(0,0,w,h);ctx.fillStyle='#3f473a';ctx.fillRect(0,0,w,h);
  const visible=drawTiles(ctx,imageLayer(),state.images,screen,w,h);
  if(localLayer()&&(state.overlays||state.layer==='slope'))drawTerrain();
  if(state.overlays){
    if(localLayer()){
      drawPath(state.directRoute,'#9dcee9',state.strategy==='direct'?3:1.8,[4,4]);drawPath(state.terrainRoute,'#ffc395',state.strategy==='terrain'?3:1.7,[]);
      const target=screen(TARGET);ctx.beginPath();ctx.arc(target.x,target.y,11,0,Math.PI*2);ctx.fillStyle='#ef9a7655';ctx.fill();ctx.strokeStyle='#ffe1bd';ctx.lineWidth=1.5;ctx.stroke();ctx.beginPath();ctx.arc(target.x,target.y,3.5,0,Math.PI*2);ctx.fillStyle='#ffe4ca';ctx.fill();label('Rochette',target,t('workspaceLabel'),'#ffceaa');
      const base=screen({x:0,y:0});ctx.fillStyle='#e5ecd6';ctx.strokeStyle='#26351b';ctx.lineWidth=2;ctx.fillRect(base.x-6,base.y-6,12,12);ctx.strokeRect(base.x-6,base.y-6,12,12);label('ARES',base,t('hypotheticalBase'));
    }else{
      drawPath(state.terrainRoute,'#ffd0a5',2,[]);const p=screen({x:TARGET.x/2,y:TARGET.y/2});ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.fillStyle='#f2b184';ctx.fill();label(t('areaLabel'),p,'ARES → ROCHETTE');
    }
  }
  ctx.save();ctx.fillStyle='#f7f2e7';ctx.shadowColor='#000';ctx.shadowBlur=3;ctx.textAlign='center';ctx.font='10px monospace';ctx.fillText('N',w-28,h-102);ctx.beginPath();ctx.moveTo(w-28,h-94);ctx.lineTo(w-32,h-82);ctx.lineTo(w-28,h-86);ctx.lineTo(w-24,h-82);ctx.closePath();ctx.fill();ctx.restore();
  const bar=scaleBar(state.scale,80);document.querySelector('.scale div').style.width=bar.pixels+'px';$('scale-text').textContent=bar.label;
  $('map-empty').hidden=visible>0||!state.ready;const limits=cameraLimits(imageLayer(),w,h);$('zoom-in').disabled=!!imageLayer()&&state.scale>=limits.maxScale*.999;$('zoom-out').disabled=!!imageLayer()&&state.scale<=limits.minScale*1.001;
}
function updateLayerText(){
  const key=state.layer,layer=imageLayer();$('layer-caption').textContent=t(key+'Caption');$('layer-description').textContent=t(key+'Description');$('tile-status').textContent=layer?.tiles?.length?t('cached'):t('unavailable');
  $('map-source-credit').textContent=key==='slope'?'USGS / NASA · CTX DEM':key==='optical'?'NASA / MSSS / Caltech · CTX':'NASA / JPL-Caltech · Mars Trek';
  $('resolution-note').textContent=key==='slope'?' · 20 m source → 40 m grid':layer?' · ≈ '+fmt(pixelSize(layer))+' m/px':'';
  document.querySelectorAll('[data-layer]').forEach(b=>{const selected=b.dataset.layer===key;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',selected);});
  $('view-mission').hidden=localLayer();$('map-legend').hidden=!state.overlays;$('slope-legend').hidden=key!=='slope';$('toggle-overlays').textContent=t(state.overlays?'hideMarks':'showMarks');
}
function setLayer(key){state.views[state.layer]={scale:state.scale,center:{...state.center}};state.layer=key;updateLayerText();if(state.views[key]){Object.assign(state,state.views[key]);constrain();draw();}else recenter();}
function inspect(p){
  if(!state.terrain)return;const id=cellId(p,state.terrain),sample=sampleTerrain(p,state.terrain);
  $('terrain-sample').textContent=id<0?t('sampleOutside'):!sample?t('sampleUnknown'):t('sample',{slope:fmt(sample.slope,1),elevation:fmt(sample.elevation)});
}
function showSources(){ $('sources-content').innerHTML=renderEvidence(state);if(!dialog.open)dialog.showModal(); }
function exportPlan(){
  if(!state.route||!state.analyses?.[state.strategy])return;
  const p=params(),coordinates=state.route.map(toGeo),tData=state.terrain,{elevations,slopes,valid,...terrainMetadata}=tData;
  const data={schemaVersion:2,name:'ARES-02',prototype:true,exportedAt:new Date().toISOString(),humanMission:{hypothetical:true,habitat:BASE},target:TARGET,strategy:state.strategy,policy:{...policy(),assumption:true},parameters:{...p,timeUnit:'minutes',speedUnit:'km/h'},analysis:state.analyses[state.strategy],comparison:state.analyses,scenarios:state.scenarios,route:{type:'Feature',properties:{includesReturn:true},geometry:{type:'LineString',coordinates:[...coordinates,...coordinates.slice(0,-1).reverse()].map(p=>[p.lon,p.lat])}},sources:{terrain:terrainMetadata,imageryManifest:'assets/data-manifest.json',waypoint:'assets/rochette-waypoint.geojson',scientificPaper:TARGET.scienceSource},limitations:'Research prototype. Historical terrain; no operational safety, oxygen, radiation, current weather, fatigue, or sub-resolution obstacle assessment. Pace scenarios are assumptions, not statistical confidence intervals.'};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ares-02-mission-plan.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(t('exported'));
}

function updateTerrainStatus(){$('terrain-status').textContent=t(state.terrain?'terrainReady':state.terrainError?'dataFailed':'dataLoading');}
function applyLanguage(next){setLanguage(next);$('language').value=language;translatePage();updateLayerText();updateTerrainStatus();calculate();updateExpanded();if(dialog.open)$('sources-content').innerHTML=renderEvidence(state);$('terrain-sample').textContent=t('inspectSample');document.title=language==='pt'?'ARES — Planejamento de exploração em Marte':'ARES — Evidence-based Marswalk Planning';}
let preferred='en';try{preferred=new URL(location.href).searchParams.get('lang')||localStorage.getItem('ares-language')||'en';}catch{}setLanguage(preferred);$('language').value=language;translatePage();
$('language').addEventListener('change',()=>applyLanguage($('language').value));
for(const id of ['sources-top','sources-bottom','nav-data'])$(id).addEventListener('click',showSources);$('close-sources').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
for(const id of ['autonomy','work','slope-limit'])$(id).addEventListener('input',calculate);for(const id of ['speed','reserve'])$(id).addEventListener('change',calculate);
for(const strategy of ['terrain','direct'])$('route-'+strategy).addEventListener('click',()=>{state.strategy=strategy;for(const kind of ['terrain','direct']){$('route-'+kind).classList.toggle('selected',kind===strategy);$('route-'+kind).setAttribute('aria-pressed',kind===strategy);}calculate();});
$('plan').addEventListener('click',()=>{calculate();recenter();toast(t('recalculated'));});$('export').addEventListener('click',exportPlan);
$('locate-target').addEventListener('click',()=>{closeSettings();setLayer('optical');recenter();canvas.scrollIntoView({block:'center',behavior:'smooth'});});
document.querySelectorAll('[data-layer]').forEach(b=>b.addEventListener('click',()=>setLayer(b.dataset.layer)));
function zoom(factor){state.scale*=factor;constrain();draw();}$('zoom-in').addEventListener('click',()=>zoom(1.35));$('zoom-out').addEventListener('click',()=>zoom(1/1.35));$('recenter').addEventListener('click',recenter);
$('toggle-overlays').addEventListener('click',()=>{state.overlays=!state.overlays;$('toggle-overlays').setAttribute('aria-pressed',state.overlays);updateLayerText();draw();});$('view-mission').addEventListener('click',()=>{setLayer('optical');recenter();});
const mapCard=canvas.closest('.map-card');
function updateExpanded(){const expanded=!!document.fullscreenElement||mapCard.classList.contains('map-expanded');$('fullscreen-map').textContent=expanded?'×':'⛶';$('fullscreen-map').setAttribute('aria-label',t(expanded?'collapseMap':'expandMap'));}
function expandedFallback(enabled){mapCard.classList.toggle('map-expanded',enabled);document.body.classList.toggle('map-is-expanded',enabled);updateExpanded();}
$('fullscreen-map').addEventListener('click',async()=>{if(document.fullscreenElement){await document.exitFullscreen();return;}if(mapCard.classList.contains('map-expanded')){expandedFallback(false);return;}try{await mapCard.requestFullscreen();}catch{expandedFallback(true);}updateExpanded();});document.addEventListener('fullscreenchange',updateExpanded);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&mapCard.classList.contains('map-expanded'))expandedFallback(false);});
const sidebar=$('mission-settings'),sidebarHome=$('sidebar-home'),mobile=matchMedia('(max-width:900px)');
function syncSettings(){if(mobile.matches)settingsDialog.append(sidebar);else{if(settingsDialog.open)settingsDialog.close();sidebarHome.append(sidebar);}}
function closeSettings(){if(settingsDialog.open)settingsDialog.close();}
$('open-settings').addEventListener('click',()=>{if(mobile.matches)settingsDialog.showModal();else $('autonomy').focus();});$('close-settings').addEventListener('click',closeSettings);$('settings-done').addEventListener('click',()=>{calculate();closeSettings();$('mission-summary').scrollIntoView({block:'center',behavior:'smooth'});});mobile.addEventListener('change',syncSettings);syncSettings();
$('nav-map').addEventListener('click',()=>{canvas.scrollIntoView({block:'center',behavior:'smooth'});canvas.focus({preventScroll:true});});
canvas.addEventListener('pointerdown',e=>{state.drag={x:e.clientX,y:e.clientY,start:{...state.center},moved:false};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{const rect=canvas.getBoundingClientRect();if(state.drag){const dx=e.clientX-state.drag.x,dy=e.clientY-state.drag.y;if(Math.hypot(dx,dy)>5)state.drag.moved=true;state.center={x:state.drag.start.x-dx/state.scale,y:state.drag.start.y+dy/state.scale};constrain();draw();}else inspect(ground({x:e.clientX-rect.left,y:e.clientY-rect.top}));});
canvas.addEventListener('pointerup',e=>{const r=canvas.getBoundingClientRect();if(state.drag&&!state.drag.moved)inspect(ground({x:e.clientX-r.left,y:e.clientY-r.top}));state.drag=null;});canvas.addEventListener('pointercancel',()=>state.drag=null);
canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect(),p={x:e.clientX-r.left,y:e.clientY-r.top},before=ground(p);state.scale*=e.deltaY<0?1.12:1/1.12;constrain();const after=ground(p);state.center.x+=before.x-after.x;state.center.y+=before.y-after.y;constrain();draw();},{passive:false});
canvas.addEventListener('keydown',e=>{const delta=50/state.scale;if(e.key==='ArrowLeft')state.center.x-=delta;else if(e.key==='ArrowRight')state.center.x+=delta;else if(e.key==='ArrowUp')state.center.y+=delta;else if(e.key==='ArrowDown')state.center.y-=delta;else return;e.preventDefault();constrain();draw();});
document.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='d'&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)&&!dialog.open&&!settingsDialog.open){e.preventDefault();showSources();}});
new ResizeObserver(resize).observe(canvas);resize();calculate();

async function loadTerrain(){
  try{const r=await fetch('assets/jezero-terrain.json',{cache:'no-store'});if(!r.ok)throw new Error('Terrain HTTP '+r.status);state.terrain=createTerrain(await r.json());updateTerrainStatus();calculate();recenter();}
  catch(error){state.terrainError=true;$('terrain-status').textContent=t('dataFailed');document.querySelector('.evidence-banner').classList.add('error');calculate();console.error(error);}
}
async function loadImagery(){
  try{const r=await fetch('assets/data-manifest.json',{cache:'no-store'});if(!r.ok)throw new Error('Imagery manifest HTTP '+r.status);state.manifest=await r.json();
    const layers=['optical','topography','thermal'].map(k=>state.manifest.layers[k]).filter(Boolean);
    await Promise.all(layers.flatMap(layer=>layer.tiles.map(tile=>new Promise(resolve=>{const image=new Image();state.images.set(tile.path,image);image.onload=()=>{draw();resolve();};image.onerror=()=>resolve();image.src=tile.path;}))));state.ready=true;updateLayerText();recenter();
  }catch(error){state.manifest={layers:{}};state.ready=true;updateLayerText();draw();console.error(error);}
}
await Promise.all([loadTerrain(),loadImagery()]);
