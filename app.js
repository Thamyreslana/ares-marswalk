import {BASE as MAP_ORIGIN,HABITAT,TARGET,DEFAULT_POLICY,WALKBACK_PACE_FACTOR,createTerrain,createNightIr,loosePenalty,analyzeSurface,nightClass,findTerrainRoute,analyzeRoute,toGeo,sampleTerrain,cellId,pointAlong,evaTimeline,evaStateAt,abortPlan,gcrDose,bearingDeg,compassPoint,lookAhead} from './planner.js';
import {constrainCamera,cameraLimits,scaleBar,drawTiles,pixelSize} from './map-view.js';
import {language,setLanguage,t,format as fmt,translatePage} from './i18n.js';
import {renderEvidence} from './evidence.js';
import {compareRoutes,summarizeComparison,DEMO_PARAMETERS,DEMO_LONG_WORK,ROUTE_KINDS} from './decision.js';
const routeName=kind=>t({direct:'routeA',terrain:'routeB',loose:'routeC'}[kind]);

const $=id=>document.getElementById(id),canvas=$('map'),ctx=canvas.getContext('2d'),dialog=$('sources-dialog'),settingsDialog=$('settings-dialog');
const MIDPOINT=Object.freeze({x:(HABITAT.x+TARGET.x)/2,y:(HABITAT.y+TARGET.y)/2});
const state={terrain:null,terrainError:false,manifest:null,images:new Map(),route:null,terrainRoute:null,looseRoute:null,directRoute:[{x:HABITAT.x,y:HABITAT.y},TARGET],analyses:null,scenarios:null,strategy:'terrain',layer:'optical',center:{x:400,y:-1000},scale:.1,width:900,height:510,drag:null,overlays:true,ready:false,views:{},routeCache:new Map(),slopeLayers:new Map(),traverse:null,showTraverse:true};
let toastTimer;
let demo=null;
const localLayer=()=>state.layer==='optical'||state.layer==='slope'||state.layer==='night';
const imageLayer=()=>state.manifest?.layers?.[localLayer()?'optical':state.layer];
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3200);}
function readNumber(id,min,max){const el=$(id),n=Number(el.value);if(el.value.trim()===''||!Number.isFinite(n)||n<min||n>max){el.value=Math.max(min,Math.min(max,Number.isFinite(n)&&el.value.trim()!==''?n:min));toast(t('adjusted'));}return Number(el.value);}
function params(){return {autonomy:readNumber('autonomy',60,480),work:readNumber('work',0,120),speed:readNumber('speed',.5,6),reserve:readNumber('reserve',0,180),maxSlope:readNumber('slope-limit',3,25)};}
function policy(){return {...DEFAULT_POLICY,maxSlope:Number($('slope-limit').value)};}
function setStatus(key,kind=''){const el=$('result-chip');el.textContent=t(key);el.className='result-chip'+(kind?' '+kind:'');}
function clearResults(key){for(const id of ['distance-metric','time-metric','leave-metric'])$(id).textContent='—';$('leave-caption').textContent=t('leaveByCaptionEmpty');$('leave-card').dataset.status='';$('rad-dose').textContent='—';$('rad-shelter').textContent='—';for(const id of ['walking-bar','work-bar','reserve-bar'])$(id).style.width='0';$('insight').textContent=t(key);$('scenario-body').replaceChildren();$('elevation-profile').replaceChildren();$('ascent-metric').textContent='';state.scenarios=null;}

function calculate(){
  const p=params();$('autonomy-value').textContent=p.autonomy+' min';$('work-value').textContent=p.work+' min';$('slope-value').textContent=p.maxSlope+'°';$('reserve-caption').textContent=t('reserveConfigured')+': '+p.reserve+' min';
  if(!state.terrain){renderDecision();clearResults(state.terrainError?'dataFailed':'dataLoading');setStatus(state.terrainError?'noRoute':'statusLoading',state.terrainError?'danger':'');return;}
  if(!state.routeCache.has(p.maxSlope))state.routeCache.set(p.maxSlope,findTerrainRoute(HABITAT,TARGET,state.terrain,policy()));
  state.terrainRoute=state.routeCache.get(p.maxSlope);
  // Route C (experimental) only exists once the THEMIS night layer is loaded.
  if(state.night&&!state.routeCache.has('loose'+p.maxSlope))state.routeCache.set('loose'+p.maxSlope,findTerrainRoute(HABITAT,TARGET,state.terrain,{...policy(),cellPenalty:loosePenalty(state.night)}));
  state.looseRoute=state.night?state.routeCache.get('loose'+p.maxSlope):null;
  if(state.strategy==='loose'&&!state.looseRoute)state.strategy='terrain';
  state.route={terrain:state.terrainRoute,direct:state.directRoute,loose:state.looseRoute}[state.strategy];
  state.analyses={terrain:analyzeRoute(state.terrainRoute,state.terrain,policy()),direct:analyzeRoute(state.directRoute,state.terrain,policy()),loose:state.looseRoute?analyzeRoute(state.looseRoute,state.terrain,policy()):null};
  state.surface={terrain:analyzeSurface(state.terrainRoute,state.terrain,state.night),direct:analyzeSurface(state.directRoute,state.terrain,state.night),loose:analyzeSurface(state.looseRoute,state.terrain,state.night)};
  state.comparisons=compareRoutes(state.analyses,p);
  renderDecision();
  const current=state.analyses[state.strategy];
  $('plan').disabled=false;$('export').disabled=!state.route;$('demo-start').disabled=!!demo;
  renderComparison(p);
  if(!state.route||!current){clearResults('noRouteText');setStatus('noRoute','danger');updateSim();draw();return;}
  const scenarios=state.comparisons[state.strategy].scenarios,base=scenarios[1],conservative=scenarios[2],walk=state.comparisons[state.strategy].walkback;state.scenarios=scenarios;
  $('distance-metric').textContent=fmt(current.roundTripMeters/1000,2)+' km';$('time-metric').textContent=fmt(base.total)+' min';
  const leaveStatus=current.passable?walk.status:'blocked';
  $('leave-metric').textContent=leaveStatus==='beyond'||leaveStatus==='blocked'?'—':'T+'+fmt(Math.floor(walk.leaveBy))+' min';
  $('leave-caption').textContent=leaveStatus==='blocked'?t('leaveByCaptionBlocked'):leaveStatus==='beyond'?t('leaveByCaptionBeyond',{km:fmt(walk.limitMeters/1000,2)}):t('leaveByCaption',{max:fmt(Math.floor(walk.maxWork)),planned:fmt(p.work)});
  $('leave-card').dataset.status=leaveStatus;
  if(!current.passable)setStatus('blocked','danger');else if(!base.feasible)setStatus('insufficient','danger');else if(!conservative.feasible)setStatus('conditional','warning');else setStatus('robust');
  const denominator=Math.max(p.autonomy,base.total+p.reserve);$('walking-bar').style.width=base.walking/denominator*100+'%';$('work-bar').style.width=base.work/denominator*100+'%';$('reserve-bar').style.width=p.reserve/denominator*100+'%';
  const note=base.feasible?(conservative.feasible?t('robustText',{margin:fmt(conservative.remaining-p.reserve)}):t('conditionalText',{short:fmt(conservative.excess)})):t('insufficientText',{short:fmt(base.excess)});
  let terrainNote='';if(current.unknownSamples)terrainNote=t('unknownText');else if(current.blockedCells)terrainNote=t('baselineWarn',{count:current.blockedCells,limit:p.maxSlope});
  const walkNote=leaveStatus==='blocked'?'':t('walkback_'+walk.status,{leave:fmt(Math.floor(walk.leaveBy)),max:fmt(Math.floor(walk.maxWork)),planned:fmt(p.work),km:fmt(walk.limitMeters/1000,2)});
  const surface=state.surface?.[state.strategy],surfaceNote=surface?t('surfaceInsight',{pct:fmt(surface.share.cool*100)}):'';
  $('insight').textContent=[terrainNote,note,walkNote,surfaceNote].filter(Boolean).join(' ');
  state.params=p;renderRadiation(base,walk,current.passable);renderScenarios();renderProfile(current);updateSim();draw();
}

function renderRadiation(base,walk,passable){
  $('rad-dose').textContent=passable?'≈ '+fmt(gcrDose(base.total),2)+' mSv':'—';
  $('rad-dose-caption').textContent=t('radDoseCaptionN',{min:fmt(base.total)});
  $('rad-shelter').textContent=passable?fmt(Math.round(walk.slowReturn))+' min':'—';
}

// EVA playback: a pure timeline (planner) drawn on the map and read out minute by minute.
const sim={t:0,playing:false,raf:0,last:0,timeline:null,abort:null};
const simEnd=()=>sim.abort?sim.abort.arrival:sim.timeline.total;
const PLAYBACK_MS=15000;
function updateSim(){
  const c=state.comparisons?.[state.strategy],ok=!!(c?.analysis?.passable&&state.params);
  sim.timeline=ok?evaTimeline(c.analysis.outboundMeters,state.params,{slowReturn:$('sim-slow').checked}):null;
  for(const id of ['sim-play','sim-time','sim-slow'])$(id).disabled=!ok;
  if(!ok){stopSim();sim.t=0;$('sim-status').textContent=t('simBlocked');$('sim-status').dataset.level='danger';$('sim-alert').textContent=t('simBlockedText');for(const id of ['sim-phase','sim-distance','sim-shelter','sim-leave'])$(id).textContent='—';$('sim-clock').textContent='—';return;}
  sim.abort=null;$('sim-time').max=String(Math.ceil(simEnd()));sim.t=Math.min(sim.t,simEnd());if(evaDialog.open)buildEvaMap();renderSim();
}
function simStatus(tl,s){
  if(s.aborted){if(s.phase==='home')return s.reserveAtArrival>=tl.reserve?{key:'simAbortHomeOk',level:'ok'}:{key:'simAbortHomeLow',level:'danger'};return s.mode==='emergency'?{key:'simEmergency',level:'danger'}:{key:'simReturnBase',level:'warning'};}
  if(s.phase==='home')return tl.reserveAtArrival>=tl.reserve?{key:'simHomeOk',level:'ok'}:{key:'simHomeLow',level:'danger'};
  if(s.pastLeaveBy)return {key:'simTurnBack',level:'danger'};
  if(s.margin<0)return {key:'simAtRisk',level:'danger'};
  if(s.phase==='work'&&tl.leaveBy-s.t<=15)return {key:'simLeaveSoon',level:'warning'};
  return {key:s.phase==='outbound'?'simOutbound':s.phase==='work'?'simWorking':'simReturning',level:'ok'};
}
const chipKey=(s,{key,level})=>(s.phase==='home'||level!=='ok'||s.aborted?key:'simOk')+'Chip';
function renderSim(){
  const tl=sim.timeline;if(!tl)return;const s=evaStateAt(tl,sim.t,sim.abort),status=simStatus(tl,s),{key,level}=status;$('sim-time').max=String(Math.ceil(simEnd()));
  $('sim-time').value=String(Math.round(sim.t));$('sim-clock').textContent='T+'+fmt(Math.floor(s.t))+' min';
  $('sim-phase').textContent=t('simPhase_'+s.phase);$('sim-distance').textContent=fmt(s.distance/1000,2)+' km';$('sim-shelter').textContent=fmt(Math.ceil(s.shelterMinutes))+' min';
  $('sim-leave').textContent='T+'+fmt(Math.floor(tl.leaveBy))+' min';
  $('sim-status').textContent=t(chipKey(s,status));$('sim-status').dataset.level=level;
  $('sim-alert').textContent=t(key,{left:fmt(Math.max(0,Math.floor(tl.leaveBy-s.t))),late:fmt(Math.ceil(s.t-tl.leaveBy)),reserve:fmt(Math.floor(tl.reserveAtArrival)),required:fmt(tl.reserve),arrive:fmt(Math.ceil(tl.outbound)),leave:fmt(Math.floor(tl.leaveBy)),home:fmt(Math.ceil(tl.total)),eta:fmt(Math.ceil(s.eta??0)),abortReserve:fmt(Math.floor(s.reserveAtArrival??0)),at:fmt(Math.floor(sim.abort?.t??0))});
  $('sim-alert').dataset.level=level;
  if(evaDialog.open)renderEva(s,status);
}

// Crew EVA view: one glanceable screen driven by the same playback.
const evaDialog=$('eva-dialog'),SVG='http://www.w3.org/2000/svg';
function svgEl(name,attrs){const el=document.createElementNS(SVG,name);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,v);return el;}
function buildEvaMap(){
  const svg=$('eva-map');svg.replaceChildren();const route=state.route;if(!route)return;
  const xs=[...route.map(p=>p.x),HABITAT.x,TARGET.x],ys=[...route.map(p=>p.y),HABITAT.y,TARGET.y],pad=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))*.12;
  const minX=Math.min(...xs)-pad,maxX=Math.max(...xs)+pad,minY=Math.min(...ys)-pad,maxY=Math.max(...ys)+pad,span=Math.max(maxX-minX,maxY-minY);
  svg.setAttribute('viewBox',`${minX} ${-maxY} ${maxX-minX} ${maxY-minY}`);svg.dataset.span=String(span);
  const g=state.terrain,limit=policy().maxSlope,cells=svgEl('g',{class:'eva-hazard'});
  for(let r=0;r<g.rows;r++)for(let c=0;c<g.cols;c++){const i=r*g.cols+c,x=g.xMin+c*g.step,y=g.yMax-r*g.step;if(x<minX||x>maxX||y<minY||y>maxY||!g.valid[i]||g.slopes[i]<=limit)continue;cells.append(svgEl('rect',{x,y:-y,width:g.step,height:g.step}));}
  svg.append(cells);
  const pts=route.map(p=>`${p.x},${-p.y}`).join(' ');svg.append(svgEl('polyline',{points:pts,class:'eva-route-halo','stroke-width':span*.016}),svgEl('polyline',{points:pts,class:'eva-route','stroke-width':span*.008}),svgEl('polyline',{id:'eva-return-path',points:'',class:'eva-return-path','stroke-width':span*.014}));
  const walk=state.comparisons?.terrain?.walkback;
  if(walk?.status==='beyond'){const lim=pointAlong(route,walk.limitMeters);svg.append(svgEl('polyline',{points:[lim,...route.slice(lim.index)].map(p=>`${p.x},${-p.y}`).join(' '),class:'eva-beyond','stroke-width':span*.009}));}
  const s=span*.018,fs=span*.034;
  svg.append(svgEl('rect',{x:HABITAT.x-s,y:-HABITAT.y-s,width:2*s,height:2*s,class:'eva-habitat'}),svgEl('circle',{cx:TARGET.x,cy:-TARGET.y,r:s*1.2,class:'eva-target'}));
  const label=(p,text,dy)=>{const el=svgEl('text',{x:p.x,y:-p.y+dy,'font-size':fs,class:'eva-label','text-anchor':'middle'});el.textContent=text;svg.append(el);};
  label(HABITAT,t('evaHabitat'),-s*2.2);label(TARGET,'Rochette',s*3.6);
  svg.append(svgEl('circle',{id:'eva-dot-halo',r:s*2.4,class:'eva-dot-halo',cx:HABITAT.x,cy:-HABITAT.y}),svgEl('circle',{id:'eva-dot',r:s*1.1,class:'eva-dot',cx:HABITAT.x,cy:-HABITAT.y}));
}
function renderEva(s,status){
  const tl=sim.timeline;if(!tl||!state.route)return;s??=evaStateAt(tl,sim.t,sim.abort);status??=simStatus(tl,s);
  $('eva-hud').dataset.level=status.level;$('eva-hud').dataset.mode=s.aborted?s.mode:'plan';$('eva-clock').textContent='T+'+fmt(Math.floor(s.t));
  $('eva-status-text').textContent=t(chipKey(s,status));
  $('eva-status-sub').textContent=s.aborted&&s.mode==='emergency'?t('evaAlerted',{at:fmt(Math.floor(sim.abort.t))}):t('simPhase_'+s.phase);
  $('eva-time').max=$('sim-time').max;$('eva-time').value=String(Math.round(sim.t));$('eva-slow').checked=$('sim-slow').checked;
  const before=s.phase==='outbound'||s.phase==='work',rem=tl.leaveBy-s.t,count=(label,value,sub)=>{$('eva-count-label').textContent=label;$('eva-count').textContent=value;$('eva-count-sub').textContent=sub;};
  if(s.phase==='abort')count(t('evaBaseIn'),fmt(Math.ceil(s.eta-s.t))+' min',t('evaAbortSub',{reserve:fmt(Math.floor(s.reserveAtArrival))}));
  else if(before&&rem>=0)count(t('evaLeaveIn'),fmt(Math.floor(rem))+' min',t('evaLeaveAt',{leave:fmt(Math.floor(tl.leaveBy))}));
  else if(before)count(t('evaOverdue'),'+'+fmt(Math.ceil(-rem))+' min',t('evaOverdueSub'));
  else if(s.phase==='return')count(t('evaHomeIn'),fmt(Math.ceil(tl.total-s.t))+' min',t('evaReserveAtHome',{reserve:fmt(Math.floor(tl.reserveAtArrival))}));
  else{const reserve=s.aborted?s.reserveAtArrival:tl.reserveAtArrival;count(t('evaHome'),fmt(Math.floor(reserve))+' min',t('evaHomeSub',{required:fmt(tl.reserve)}));}
  const route=state.route,p=pointAlong(route,s.distance),homeward=s.phase==='return'||s.phase==='abort',moving=s.phase==='outbound'||homeward,arrow=$('eva-arrow');
  if(moving){
    const next=homeward?route[Math.max(0,p.index-1)]:route[Math.min(p.index,route.length-1)],to=homeward?HABITAT:TARGET,remaining=homeward?s.distance:tl.outboundMeters-s.distance,heading=bearingDeg(p,Math.hypot(next.x-p.x,next.y-p.y)<5?to:next);
    $('eva-next').textContent=(homeward?t('evaHabitat'):'Rochette')+' · '+fmt(remaining/1000,2)+' km';$('eva-bearing').textContent=t('evaHeading',{deg:fmt(Math.round(heading)),pt:compassPoint(heading)});
    arrow.hidden=false;arrow.style.transform=`rotate(${heading}deg)`;
  }else{arrow.hidden=true;$('eva-next').textContent=s.phase==='work'?t('evaAtSite'):t('evaHabitat');$('eva-bearing').textContent='';}
  // At Rochette the next 200 m are the first stretch of the walk home.
  if(moving||s.phase==='work'){
    const ahead=lookAhead(route,s.distance,homeward||s.phase==='work'?-1:1,200,state.terrain,state.night);
    $('eva-ground').textContent=t(ahead.coolShare>=.4?'evaGroundLoose':ahead.warmShare>=.4?'evaGroundRock':'evaGroundMixed');$('eva-slope').textContent=ahead.maxSlope==null?'':t('evaSlopeAhead',{max:fmt(ahead.maxSlope,1)});
  }else{$('eva-ground').textContent='—';$('eva-slope').textContent='';}
  // Once returning, the countdown already shows time to base; show the margin over the required reserve instead.
  // Guarded: a browser may briefly pair this script with a cached older page that lacks the label id.
  const shelterLabel=$('eva-shelter-label');if(shelterLabel){shelterLabel.dataset.t=s.aborted?'evaMargin':'evaShelter';shelterLabel.textContent=t(shelterLabel.dataset.t);}
  if(s.aborted){const margin=Math.floor(s.reserveAtArrival-tl.reserve);$('eva-shelter').textContent=(margin>=0?'+':'−')+fmt(Math.abs(margin))+' min';$('eva-shelter-sub').textContent=t('evaMarginSub',{required:fmt(tl.reserve)});}
  else{$('eva-shelter').textContent=fmt(Math.ceil(s.shelterMinutes))+' min';$('eva-shelter-sub').textContent=t('evaShelterSub');}$('eva-dose').textContent=fmt(gcrDose(s.t),3)+' mSv';
  const dot=$('eva-dot'),halo=$('eva-dot-halo');if(dot){for(const el of [dot,halo]){el.setAttribute('cx',p.x);el.setAttribute('cy',-p.y);}}
  const back=$('eva-return-path');if(back)back.setAttribute('points',homeward?[p,...route.slice(0,p.index).reverse()].map(q=>`${q.x},${-q.y}`).join(' '):'');
  const active=s.phase!=='home';$('eva-return').hidden=s.aborted||!active;$('eva-emergency').hidden=(s.aborted&&s.mode==='emergency')||!active;$('eva-resume').hidden=!s.aborted;
}
function abortEva(mode){
  if(!sim.timeline)return;const s=evaStateAt(sim.timeline,sim.t,sim.abort);if(s.phase==='home')return;
  sim.abort=abortPlan(sim.timeline,sim.t,mode,sim.abort);renderSim();draw();if(!sim.playing)toggleSim();
}function openEva(){
  if(!state.terrain||demo)return;if(!state.analyses?.[state.strategy]?.passable)chooseRoute('terrain');if(!sim.timeline)return;
  closeSettings();buildEvaMap();if(!evaDialog.open)evaDialog.showModal();renderEva();$('eva-play').focus({preventScroll:true});
}
function syncPlayButtons(){for(const [btn,icon,label]of [['sim-play','sim-play-icon','sim-play-label'],['eva-play','eva-play-icon','eva-play-label']]){$(btn).setAttribute('aria-pressed',String(sim.playing));$(icon).textContent=sim.playing?'❚❚':'▶';$(label).textContent=t(sim.playing?'simPause':'simPlay');}}
function stopSim(){sim.playing=false;cancelAnimationFrame(sim.raf);syncPlayButtons();}
function stepSim(now){
  if(!sim.playing||!sim.timeline)return;const dt=now-sim.last;sim.last=now;sim.t=Math.min(simEnd(),sim.t+dt*sim.timeline.total/PLAYBACK_MS);
  renderSim();draw();if(sim.t>=simEnd()){stopSim();return;}sim.raf=requestAnimationFrame(stepSim);
}
function toggleSim(){
  if(!sim.timeline)return;if(sim.playing){stopSim();return;}
  if(sim.t>=simEnd()){sim.t=0;sim.abort=null;}if(!localLayer())setLayer('optical');
  sim.playing=true;sim.last=performance.now();syncPlayButtons();sim.raf=requestAnimationFrame(stepSim);
}
function drawSimMarker(){
  if(!sim.timeline||!state.route||(sim.t<=0&&!sim.playing))return;const s=evaStateAt(sim.timeline,sim.t,sim.abort),p=pointAlong(state.route,s.distance),q=screen(p);
  const danger=s.pastLeaveBy||s.margin<0||s.mode==='emergency';ctx.save();ctx.beginPath();ctx.arc(q.x,q.y,15,0,Math.PI*2);ctx.fillStyle=danger?'#ff5a4f55':'#5ad1e655';ctx.fill();
  ctx.beginPath();ctx.arc(q.x,q.y,7,0,Math.PI*2);ctx.fillStyle='#fffaf0';ctx.fill();ctx.lineWidth=3.5;ctx.strokeStyle=danger?'#ff5a4f':'#5ad1e6';ctx.stroke();ctx.restore();
  label(t('simMarker',{t:fmt(Math.floor(s.t))}),q,t('simPhase_'+s.phase).toUpperCase(),danger?'#ffb0a8':'#ffffff',44);
}

function renderDecision(){
  if(!state.terrain){$('route-choices').textContent=t(state.terrainError?'dataFailed':'dataLoading');}
  const summary=summarizeComparison(state.comparisons);
  $('decision-summary').textContent=t(summary.key,{route:summary.kind?routeName(summary.kind):'',routes:summary.kinds.map(routeName).join(t('andJoin'))});
  $('decision-summary').dataset.outcome=summary.key;
  $('selected-route').textContent=t('inspectingRoute',{route:routeName(state.strategy)});
}
function renderComparison(p){
  renderRouteChoices();
  const body=$('comparison-body'),experimentalBody=$('experimental-body');body.replaceChildren();experimentalBody.replaceChildren();$('experimental-routes').hidden=!state.analyses?.loose;
  for(const kind of ROUTE_KINDS){
    const c=state.comparisons[kind],a=c.analysis;if(kind==='loose'&&!a)continue;const card=document.createElement('article');card.className='route-option '+kind+'-option'+(state.strategy===kind?' is-selected':'');card.dataset.route=kind;
    const title=document.createElement('h4');title.textContent=routeName(kind);if(kind==='loose'){const tag=document.createElement('span');tag.className='route-tag';tag.textContent=t('experimental');title.append(' ',tag);}card.append(title);
    const status=document.createElement('p');status.className='route-verdict '+(c.status==='robust'?'verdict-ok':c.status==='conditional'?'verdict-warning':'verdict-danger');status.textContent=t(c.status);card.append(status);
    const list=document.createElement('dl');
    const rows=[['roundTrip',a?fmt(a.roundTripMeters/1000,2)+' km':'—'],['maxSlope',a?.maxSlope!=null?fmt(a.maxSlope,1)+'°':'—'],['conservativeTime',c.conservative?fmt(c.conservative.total)+' min':'—'],['conservativeLeft',c.conservative?fmt(c.conservative.remaining)+' min':'—'],['reserveMargin',c.reserveMargin==null?'—':(c.reserveMargin>=0?'+':'')+fmt(c.reserveMargin,1)+' min'],['leaveBy',!c.walkback||c.walkback.status==='beyond'||!a.passable?'—':'T+'+fmt(Math.floor(c.walkback.leaveBy))+' min'],['looseShare',state.surface?.[kind]?fmt(state.surface[kind].share.cool*100)+'%':'—']];
    for(const [key,value]of rows){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=t(key);dd.textContent=value;dd.dataset.metric=key;if(key==='reserveMargin'&&a?.passable)dd.className=c.reserveMargin>=0?'margin-positive':'margin-negative';row.append(dt,dd);list.append(row);}card.append(list);
    const button=document.createElement('button');button.type='button';button.className='inspect-route';button.dataset.inspectRoute=kind;button.textContent=t(state.strategy===kind?'selectedRoute':'inspectRoute');button.disabled=!a;button.setAttribute('aria-pressed',state.strategy===kind);button.addEventListener('click',()=>{chooseRoute(kind);document.querySelector(`[data-inspect-route="${kind}"]`)?.focus({preventScroll:true});});card.append(button);(kind==='loose'?experimentalBody:body).append(card);
  }
  const a=state.analyses?.terrain,d=state.analyses?.direct;
  const direct=state.comparisons.direct,terrain=state.comparisons.terrain;
  let explanation;
  if(!a)explanation=t('noRouteText');
  else if(a.roundTripMeters-d.roundTripMeters<1)explanation=t('sameRoute');
  else if(!d.passable&&a.passable)explanation=t('detourExplain',{cells:fmt(d.blockedCells),limit:p.maxSlope,before:fmt(d.maxSlope,1),after:fmt(a.maxSlope,1),extra:fmt(a.roundTripMeters-d.roundTripMeters),pct:fmt((a.roundTripMeters/d.roundTripMeters-1)*100,1),climbBefore:fmt(d.roundTripAscentMeters),climbAfter:fmt(a.roundTripAscentMeters)});
  else explanation=[t('decision',{extra:fmt(a.roundTripMeters-d.roundTripMeters),before:fmt(d.maxSlope,1),after:fmt(a.maxSlope,1)}),t('reserveTradeoff',{extraTime:fmt(terrain.conservative.total-direct.conservative.total,1),directMargin:fmt(direct.reserveMargin,1),terrainMargin:fmt(terrain.reserveMargin,1)})].join(' ');
  const l=state.analyses?.loose,ls=state.surface?.loose,ts=state.surface?.terrain;
  $('experimental-explanation').textContent=a&&l&&ls&&ts?t('looseExplain',{extra:fmt(l.roundTripMeters-a.roundTripMeters),before:fmt(ts.share.cool*100),after:fmt(ls.share.cool*100,1)}):'';
  $('route-explanation').textContent=explanation;
  $('comparison-reserve').textContent=t('reserveConfigured')+': '+p.reserve+' min';
  $('comparison-method').textContent=ROUTE_KINDS.filter(kind=>state.comparisons[kind].analysis).map(kind=>{const c=state.comparisons[kind];return `${routeName(kind)}: ${t('aboveLimit')} = ${c.analysis?.blockedCells??'—'}; ${t('terrainCost')} = ${c.analysis?fmt(c.analysis.terrainCost):'—'}`;}).join(' · ');
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
  $('elevation-profile').innerHTML=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="profile-title"><title id="profile-title">${t('profile')}</title><defs><linearGradient id="elevation-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5ad1e6" stop-opacity=".28"/><stop offset="1" stop-color="#5ad1e6" stop-opacity=".03"/></linearGradient></defs><path d="M ${pad} 14 V ${height-28} H ${width-12}" fill="none" stroke="#454b53" stroke-width="1"/><path d="${area}" fill="url(#elevation-fill)"/><path d="${line}" stroke="#5ad1e6" stroke-width="2.2" fill="none"/><g fill="#aab2bd" font-size="11" font-family="monospace"><text x="0" y="18">${fmt(max)} m</text><text x="0" y="${height-30}">${fmt(min)} m</text><text x="${pad}" y="${height-8}">0</text><text text-anchor="end" x="${width-12}" y="${height-8}">${fmt(analysis.outboundMeters/1000,2)} km · Rochette</text></g></svg>`;
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
  }else{state.center={...MIDPOINT};state.scale=state.height/(state.layer==='topography'?85000:55000);}
  constrain();draw();
}
function terrainImage(full){
  if(!state.terrain)return null;const key=(full?'full':'blocked')+policy().maxSlope;if(state.slopeLayers.has(key))return state.slopeLayers.get(key);
  const g=state.terrain,c=document.createElement('canvas');c.width=g.cols;c.height=g.rows;const context=c.getContext('2d'),image=context.createImageData(g.cols,g.rows),limit=policy().maxSlope;
  for(let i=0;i<g.slopes.length;i++){
    const offset=i*4;if(!g.valid[i]){if(full){image.data[offset]=75;image.data[offset+1]=80;image.data[offset+2]=70;image.data[offset+3]=180;}continue;}
    const slope=g.slopes[i],over=slope>limit;if(!full&&!over)continue;
    const color=over?[255,90,79,full?205:120]:slope>5?[245,184,61,125]:[61,200,120,85];image.data.set(color,offset);
  }
  context.putImageData(image,0,0);state.slopeLayers.set(key,c);return c;
}
function nightImage(){
  if(!state.night||!state.terrain)return null;if(state.slopeLayers.has('night'))return state.slopeLayers.get('night');
  const g=state.terrain,c=document.createElement('canvas');c.width=g.cols;c.height=g.rows;const context=c.getContext('2d'),image=context.createImageData(g.cols,g.rows);
  for(let i=0;i<state.night.values.length;i++){const k=nightClass(state.night.values[i],state.night),color=k==='cool'?[86,160,222,165]:k==='warm'?[240,150,84,150]:k==='unknown'?[75,80,70,180]:[0,0,0,0];image.data.set(color,i*4);}
  context.putImageData(image,0,0);state.slopeLayers.set('night',c);return c;
}
function drawTerrain(){const full=state.layer==='slope',image=state.layer==='night'?nightImage():terrainImage(full);if(!image)return;const g=state.terrain,tl=screen({x:g.xMin,y:g.yMax}),br=screen({x:g.xMin+g.cols*g.step,y:g.yMax-g.rows*g.step});ctx.save();ctx.imageSmoothingEnabled=state.layer==='night';ctx.drawImage(image,tl.x,tl.y,br.x-tl.x,br.y-tl.y);ctx.restore();}
function drawPath(points,color,width,dash=[]){if(!points?.length)return;ctx.save();ctx.beginPath();points.forEach((p,i)=>{const q=screen(p);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y);});ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle='#0b0d10c0';ctx.lineWidth=width+3;ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.stroke();ctx.restore();}
// Perseverance's real traverse: ground a rover has already driven (context, not a walking path).
function drawTraverse(){
  if(!state.showTraverse||!state.traverse||!localLayer())return;ctx.save();ctx.strokeStyle='#e2c79a';ctx.globalAlpha=.85;ctx.lineWidth=1.8;ctx.setLineDash([1.5,4]);ctx.lineCap='round';ctx.lineJoin='round';
  for(const seg of state.traverse.segments){ctx.beginPath();seg.points.forEach(([x,y],i)=>{const q=screen({x,y});i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y);});ctx.stroke();}ctx.restore();
}
// Small lettered tag at ~55% of a route, so A/B/C on the map match the comparison cards.
function routeTag(points,letter,color){
  if(!points?.length)return;let total=0;for(let i=1;i<points.length;i++)total+=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);
  const fraction={A:.32,B:.55,C:.7}[letter]??.55,q=screen(pointAlong(points,total*fraction));if(q.x<0||q.y<0||q.x>state.width||q.y>state.height)return;
  ctx.save();ctx.beginPath();ctx.arc(q.x,q.y,10,0,Math.PI*2);ctx.fillStyle='#0f1215';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle=color;ctx.stroke();ctx.fillStyle=color;ctx.font='700 11px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(letter,q.x,q.y+.5);ctx.restore();
}
function label(title,p,subtitle,color='#ffffff',dy=0){
  if(p.x<0||p.x>state.width||p.y<0||p.y>state.height)return;
  const compact=state.width<520;ctx.save();ctx.font=`600 ${compact?12:13}px Arial`;const titleWidth=ctx.measureText(title).width;ctx.font=`${compact?10:11}px monospace`;const subWidth=ctx.measureText(subtitle).width;
  const width=Math.max(titleWidth,subWidth)+20,height=compact?40:44;
  let x=p.x+18,y=p.y-2+dy;if(x+width>state.width-56)x=p.x-width-18;if(x<10)x=10;
  y=Math.max(70,Math.min(y,state.height-70));ctx.fillStyle='#0f1215eb';ctx.beginPath();ctx.roundRect(x-8,y-18,width,height,5);ctx.fill();
  ctx.font=`600 ${compact?12:13}px Arial`;ctx.fillStyle=color;ctx.textAlign='left';ctx.fillText(title,x,y-1);ctx.font=`${compact?10:11}px monospace`;ctx.fillStyle='#b4bcc6';ctx.fillText(subtitle,x,y+15);ctx.restore();
}
function draw(){
  const {width:w,height:h}=state;ctx.clearRect(0,0,w,h);ctx.fillStyle='#2b2f34';ctx.fillRect(0,0,w,h);
  const visible=drawTiles(ctx,imageLayer(),state.images,screen,w,h);
  if(localLayer()&&(state.overlays||state.layer!=='optical'))drawTerrain();
  if(state.overlays){
    if(localLayer()){
      drawTraverse();
      // Selected route: cyan (white on the night layer, where blue means cool ground). Alternatives: thin grey. A is dashed.
      const selectedColor=state.layer==='night'?'#ffffff':'#5ad1e6';
      drawPath(state.directRoute,'#c9ced6',state.strategy==='direct'?2.8:1.6,[5,5]);
      for(const kind of ['terrain','loose'])if(kind!==state.strategy)drawPath(kind==='terrain'?state.terrainRoute:state.looseRoute,'#9aa3ad',1.7,[]);
      if(state.strategy!=='direct')drawPath(state.route,selectedColor,3.6,[]);
      for(const [kind,letter,points]of [['direct','A',state.directRoute],['terrain','B',state.terrainRoute],['loose','C',state.looseRoute]])routeTag(points,letter,kind===state.strategy?(kind==='direct'?'#c9ced6':selectedColor):'#9aa3ad');
      const walk=state.comparisons?.[state.strategy]?.walkback;
      if(state.route&&walk?.status==='beyond'){
        // Past the walkback limit, a slower return would consume the reserve: draw that stretch in red.
        const limit=pointAlong(state.route,walk.limitMeters);drawPath([limit,...state.route.slice(limit.index)],'#ff5a4f',3.6,[2,5]);
        const q=screen(limit);ctx.save();ctx.translate(q.x,q.y);ctx.rotate(Math.PI/4);ctx.fillStyle='#ff5a4f';ctx.strokeStyle='#2a0d08';ctx.lineWidth=2;ctx.fillRect(-6,-6,12,12);ctx.strokeRect(-6,-6,12,12);ctx.restore();label(t('walkbackMarker'),q,t('walkbackMarkerSub',{km:fmt(walk.limitMeters/1000,2)}),'#ffb0a8',-50);
      }
      const routeOk=state.analyses?.[state.strategy]?.passable;
      const target=screen(TARGET);ctx.beginPath();ctx.arc(target.x,target.y,11,0,Math.PI*2);ctx.fillStyle='#5ad1e640';ctx.fill();ctx.strokeStyle='#ffffff';ctx.lineWidth=2;ctx.stroke();ctx.beginPath();ctx.arc(target.x,target.y,4,0,Math.PI*2);ctx.fillStyle='#ffffff';ctx.fill();
      label('Rochette',target,routeOk&&walk&&walk.status!=='beyond'?t('leaveBySubtitle',{leave:fmt(Math.floor(walk.leaveBy))}):t('workspaceLabel'),'#ffffff');
      const base=screen(HABITAT);ctx.fillStyle='#ffffff';ctx.strokeStyle='#0b0d10';ctx.lineWidth=2;ctx.fillRect(base.x-6,base.y-6,12,12);ctx.strokeRect(base.x-6,base.y-6,12,12);label('ARES',base,t('hypotheticalBase'));
      drawSimMarker();
    }else{
      drawPath(state.terrainRoute,'#5ad1e6',2.4,[]);const p=screen(MIDPOINT);ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.fillStyle='#5ad1e6';ctx.fill();label(t('areaLabel'),p,'ARES → ROCHETTE');
    }
  }
  ctx.save();ctx.fillStyle='#f7f2e7';ctx.shadowColor='#000';ctx.shadowBlur=3;ctx.textAlign='center';ctx.font='10px monospace';ctx.fillText('N',w-28,h-102);ctx.beginPath();ctx.moveTo(w-28,h-94);ctx.lineTo(w-32,h-82);ctx.lineTo(w-28,h-86);ctx.lineTo(w-24,h-82);ctx.closePath();ctx.fill();ctx.restore();
  const bar=scaleBar(state.scale,80);document.querySelector('.scale div').style.width=bar.pixels+'px';$('scale-text').textContent=bar.label;
  $('map-empty').hidden=visible>0||!state.ready;const limits=cameraLimits(imageLayer(),w,h);$('zoom-in').disabled=!!imageLayer()&&state.scale>=limits.maxScale*.999;$('zoom-out').disabled=!!imageLayer()&&state.scale<=limits.minScale*1.001;
}
function updateLayerText(){
  const key=state.layer,layer=imageLayer();$('layer-caption').textContent=t(key+'Caption');$('layer-description').textContent=t(key+'Description');$('tile-status').textContent=layer?.tiles?.length?t('cached'):t('unavailable');
  $('map-source-credit').textContent=key==='slope'?'USGS / NASA · CTX DEM':key==='optical'?'NASA / MSSS / Caltech · CTX':key==='night'?'NASA / JPL / ASU · THEMIS Night IR · Mars Trek':'NASA / JPL-Caltech · Mars Trek';
  $('resolution-note').textContent=key==='slope'?' · 20 m source → 40 m grid':key==='night'?' · 100 m source on CTX':layer?' · ≈ '+fmt(pixelSize(layer))+' m/px':'';
  document.querySelectorAll('[data-layer]').forEach(b=>{const selected=b.dataset.layer===key;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',selected);});
  $('view-mission').hidden=localLayer();$('map-legend').hidden=!state.overlays;canvas.closest('.map-card').classList.toggle('is-night',key==='night');$('slope-legend').hidden=key!=='slope';$('night-legend').hidden=key!=='night';$('toggle-overlays').textContent=t(state.overlays?'hideMarks':'showMarks');
}
function setLayer(key){state.views[state.layer]={scale:state.scale,center:{...state.center}};state.layer=key;updateLayerText();if(state.views[key]){Object.assign(state,state.views[key]);constrain();draw();}else recenter();}
function inspect(p){
  if(!state.terrain)return;const id=cellId(p,state.terrain),sample=sampleTerrain(p,state.terrain);
  const night=id>=0&&state.night?' · '+t('nightSample_'+nightClass(state.night.values[id],state.night)):'';
  $('terrain-sample').textContent=id<0?t('sampleOutside'):!sample?t('sampleUnknown'):t('sample',{slope:fmt(sample.slope,1),elevation:fmt(sample.elevation)})+night;
}
function showSources(){ $('sources-content').innerHTML=renderEvidence(state);if(!dialog.open)dialog.showModal(); }
function exportPlan(){
  if(!state.route||!state.analyses?.[state.strategy])return;
  const p=params(),coordinates=state.route.map(toGeo),tData=state.terrain,{elevations,slopes,valid,...terrainMetadata}=tData;
  const data={schemaVersion:3,name:'ARES-03',prototype:true,exportedAt:new Date().toISOString(),humanMission:{hypothetical:true,habitat:HABITAT},target:TARGET,strategy:state.strategy,policy:{...policy(),assumption:true},parameters:{...p,timeUnit:'minutes',speedUnit:'km/h'},analysis:state.analyses[state.strategy],comparison:state.analyses,routeDecisions:state.comparisons,scenarios:state.scenarios,walkback:{...state.comparisons[state.strategy].walkback,returnPaceFactor:WALKBACK_PACE_FACTOR,timeUnit:'minutes since leaving the habitat',rule:'Walk out at the planned pace; plan the return as if pace drops to the return pace factor. Leaving the target by leaveBy preserves the reserve.'},route:{type:'Feature',properties:{includesReturn:true},geometry:{type:'LineString',coordinates:[...coordinates,...coordinates.slice(0,-1).reverse()].map(p=>[p.lon,p.lat])}},sources:{terrain:terrainMetadata,imageryManifest:'assets/data-manifest.json',waypoint:'assets/rochette-waypoint.geojson',scientificPaper:TARGET.scienceSource},limitations:'Research prototype. Historical terrain; no operational safety, oxygen, radiation, current weather, fatigue, or sub-resolution obstacle assessment. Pace scenarios are assumptions, not statistical confidence intervals.'};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ares-03-mission-plan.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(t('exported'));
}

function updateTerrainStatus(){$('terrain-status').textContent=t(state.terrain?'terrainReady':state.terrainError?'dataFailed':'dataLoading');}
function applyLanguage(next){setLanguage(next);$('language').value=language;translatePage();updateLayerText();updateTerrainStatus();calculate();updateExpanded();renderDemo();$('comprehension-test-link').href='comprehension-test.html?lang='+language;if(dialog.open)$('sources-content').innerHTML=renderEvidence(state);$('terrain-sample').textContent=t('inspectSample');document.title=language==='pt'?'ARES — Planejamento de exploração em Marte':'ARES — Evidence-based Marswalk Planning';}
let preferred='en';try{preferred=new URL(location.href).searchParams.get('lang')||localStorage.getItem('ares-language')||'en';}catch{}setLanguage(preferred);$('language').value=language;translatePage();
$('comprehension-test-link').href='comprehension-test.html?lang='+language;
$('language').addEventListener('change',()=>applyLanguage($('language').value));
for(const id of ['sources-top','sources-bottom','nav-data','quick-evidence'])$(id).addEventListener('click',showSources);$('close-sources').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
for(const id of ['autonomy','work','slope-limit'])$(id).addEventListener('input',calculate);for(const id of ['speed','reserve'])$(id).addEventListener('change',calculate);
function chooseRoute(strategy){state.strategy=strategy;if(strategy==='loose')$('experimental-routes').open=true;for(const kind of ['terrain','direct','loose']){$('route-'+kind).classList.toggle('selected',kind===strategy);$('route-'+kind).setAttribute('aria-pressed',kind===strategy);}calculate();}
function renderRouteChoices(){
  const choices=$('route-choices');choices.replaceChildren();
  const summary=summarizeComparison(state.comparisons);
  for(const kind of ROUTE_KINDS){
    const c=state.comparisons[kind],a=c?.analysis,selected=state.strategy===kind;
    const button=document.createElement('button');button.type='button';button.className='route-choice'+(selected?' is-selected':'');button.dataset.chooseRoute=kind;button.dataset.status=c?.status??'noRoute';button.setAttribute('aria-pressed',String(selected));button.disabled=!a||!!demo;
    const title=document.createElement('strong');title.className='route-choice-title';title.textContent=routeName(kind);button.append(title);
    if(kind==='loose'||(kind==='terrain'&&summary.key==='decisionOne'&&summary.kind==='terrain')){const tag=document.createElement('span');tag.className='route-choice-tag';tag.textContent=t(kind==='loose'?'experimental':'routeRecommended');button.append(tag);}
    const status=document.createElement('span');status.className='route-choice-status';status.textContent=t(a?c.status:'noRoute');button.append(status);
    const metrics=document.createElement('span');metrics.className='route-choice-metrics';
    const leave=a?.passable&&c.walkback&&c.walkback.status!=='beyond'?'T+'+fmt(Math.floor(c.walkback.leaveBy))+' min':'—';
    for(const [key,value]of [['roundTrip',a?fmt(a.roundTripMeters/1000,2)+' km':'—'],['leaveBy',leave]]){const row=document.createElement('span'),label=document.createElement('span'),metric=document.createElement('b');label.textContent=t(key);metric.textContent=value;metric.dataset.choiceMetric=key;row.append(label,metric);metrics.append(row);}button.append(metrics);
    button.addEventListener('click',()=>{stopSim();sim.t=0;chooseRoute(kind);choices.querySelector(`[data-choose-route="${kind}"]`)?.focus({preventScroll:true});});choices.append(button);
  }
}
for(const strategy of ['terrain','direct','loose'])$('route-'+strategy).addEventListener('click',()=>chooseRoute(strategy));
const demoInputs=['autonomy','work','speed','reserve','slope-limit'];
function setParameters(p){for(const [key,id]of Object.entries({autonomy:'autonomy',work:'work',speed:'speed',reserve:'reserve',maxSlope:'slope-limit'}))$(id).value=p[key];}
function renderDemo(){
  $('demo-panel').hidden=!demo;if(!demo)return;
  $('demo-title').textContent=t('demoTitle'+demo.step,demoValues());$('demo-text').textContent=t('demoText'+demo.step,demoValues());$('demo-progress').textContent=t('demoStep',{step:demo.step+1});$('demo-previous').disabled=demo.step===0;$('demo-next').textContent=t(demo.step===2?'demoFinish':'demoNext');
}
// Values shown in the demo text are read from the live calculation, never hard-coded.
function demoValues(){
  const d=state.analyses?.direct,a=state.analyses?.terrain,w=state.comparisons?.terrain?.walkback;if(!d||!a||!w)return {};
  return {cells:fmt(d.blockedCells),limit:DEMO_PARAMETERS.maxSlope,before:fmt(d.maxSlope,1),after:fmt(a.maxSlope,1),extra:fmt(a.roundTripMeters-d.roundTripMeters),pct:fmt((a.roundTripMeters/d.roundTripMeters-1)*100,1),climbBefore:fmt(d.roundTripAscentMeters),climbAfter:fmt(a.roundTripAscentMeters),work:DEMO_LONG_WORK,leave:fmt(Math.floor(w.leaveBy)),max:fmt(Math.floor(w.maxWork))};
}
function setDemoStep(step){
  $('advanced-simulations').open=step===2;
  demo.step=step;stopSim();sim.t=0;setParameters({...DEMO_PARAMETERS,work:step===2?DEMO_LONG_WORK:DEMO_PARAMETERS.work});setLayer(step===0?'slope':'optical');chooseRoute(step===0?'direct':'terrain');
  // Step 3 freezes the playback one minute past the leave-by time, while the crew is still at Rochette.
  if(step===2&&sim.timeline){sim.t=Math.floor(sim.timeline.leaveBy)+1;renderSim();draw();}
  renderDemo();
}
function startDemo(){
  if(!state.terrain||demo)return;closeSettings();demo={step:0,snapshot:{advancedOpen:$('advanced-simulations').open,experimentalOpen:$('experimental-routes').open,parameters:params(),strategy:state.strategy,layer:state.layer,center:{...state.center},scale:state.scale}};
  for(const id of [...demoInputs,'open-settings','quick-settings'])$(id).disabled=true;setDemoStep(0);$('demo-panel').scrollIntoView({block:'start',behavior:'smooth'});$('demo-panel').focus({preventScroll:true});
}
function finishDemo(){
  if(!demo)return;const snapshot=demo.snapshot;demo=null;stopSim();sim.t=0;for(const id of [...demoInputs,'open-settings','quick-settings'])$(id).disabled=false;setParameters(snapshot.parameters);chooseRoute(snapshot.strategy);setLayer(snapshot.layer);state.center=snapshot.center;state.scale=snapshot.scale;constrain();draw();$('advanced-simulations').open=snapshot.advancedOpen;$('experimental-routes').open=snapshot.experimentalOpen;renderDemo();$('demo-start').focus({preventScroll:true});
}
$('sim-play').addEventListener('click',toggleSim);
$('sim-time').addEventListener('input',()=>{stopSim();sim.t=Number($('sim-time').value);renderSim();draw();});
$('sim-slow').addEventListener('change',()=>{updateSim();draw();});
$('eva-open').addEventListener('click',openEva);$('eva-return').addEventListener('click',()=>abortEva('return'));$('eva-emergency').addEventListener('click',()=>abortEva('emergency'));$('eva-resume').addEventListener('click',()=>{sim.abort=null;sim.t=Math.min(sim.t,sim.timeline?.total??0);renderSim();draw();});$('eva-close').addEventListener('click',()=>evaDialog.close());
$('eva-play').addEventListener('click',toggleSim);
$('eva-time').addEventListener('input',()=>{stopSim();sim.t=Number($('eva-time').value);renderSim();draw();});
$('eva-slow').addEventListener('change',()=>{$('sim-slow').checked=$('eva-slow').checked;updateSim();draw();});
$('demo-start').addEventListener('click',startDemo);$('demo-previous').addEventListener('click',()=>{if(demo&&demo.step>0)setDemoStep(demo.step-1);});$('demo-next').addEventListener('click',()=>{if(!demo)return;if(demo.step===2)finishDemo();else setDemoStep(demo.step+1);});$('demo-exit').addEventListener('click',finishDemo);
$('plan').addEventListener('click',()=>{calculate();recenter();toast(t('recalculated'));});$('export').addEventListener('click',exportPlan);
$('locate-target').addEventListener('click',()=>{closeSettings();setLayer('optical');recenter();canvas.scrollIntoView({block:'center',behavior:'smooth'});});
document.querySelectorAll('[data-layer]').forEach(b=>b.addEventListener('click',()=>setLayer(b.dataset.layer)));
function zoom(factor){state.scale*=factor;constrain();draw();}$('zoom-in').addEventListener('click',()=>zoom(1.35));$('zoom-out').addEventListener('click',()=>zoom(1/1.35));$('recenter').addEventListener('click',recenter);
$('toggle-traverse').addEventListener('click',()=>{state.showTraverse=!state.showTraverse;$('toggle-traverse').setAttribute('aria-pressed',String(state.showTraverse));$('toggle-traverse').textContent=t(state.showTraverse?'hideTraverse':'showTraverse');$('traverse-legend').hidden=!state.showTraverse;draw();});
$('toggle-overlays').addEventListener('click',()=>{state.overlays=!state.overlays;$('toggle-overlays').setAttribute('aria-pressed',state.overlays);updateLayerText();draw();});$('view-mission').addEventListener('click',()=>{setLayer('optical');recenter();});
const mapCard=canvas.closest('.map-card');
function updateExpanded(){const expanded=!!document.fullscreenElement||mapCard.classList.contains('map-expanded');$('fullscreen-map').textContent=expanded?'×':'⛶';$('fullscreen-map').setAttribute('aria-label',t(expanded?'collapseMap':'expandMap'));}
function expandedFallback(enabled){mapCard.classList.toggle('map-expanded',enabled);document.body.classList.toggle('map-is-expanded',enabled);updateExpanded();}
$('fullscreen-map').addEventListener('click',async()=>{if(document.fullscreenElement){await document.exitFullscreen();return;}if(mapCard.classList.contains('map-expanded')){expandedFallback(false);return;}try{await mapCard.requestFullscreen();}catch{expandedFallback(true);}updateExpanded();});document.addEventListener('fullscreenchange',updateExpanded);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&mapCard.classList.contains('map-expanded'))expandedFallback(false);});
const sidebar=$('mission-settings'),sidebarHome=$('sidebar-home'),mobile=matchMedia('(max-width:900px)');
function syncSettings(){const home=settingsDialog.open||mobile.matches?settingsDialog:sidebarHome;if(sidebar.parentElement!==home)home.append(sidebar);$('open-settings').setAttribute('aria-expanded',String(settingsDialog.open));}
function openSettings(){if(settingsDialog.open||demo)return;settingsDialog.append(sidebar);settingsDialog.showModal();syncSettings();$('autonomy').focus({preventScroll:true});}
function closeSettings(){if(settingsDialog.open)settingsDialog.close();syncSettings();}
$('open-settings').addEventListener('click',openSettings);$('close-settings').addEventListener('click',closeSettings);$('settings-done').addEventListener('click',()=>{calculate();closeSettings();$('mission-summary').scrollIntoView({block:'center',behavior:'smooth'});});settingsDialog.addEventListener('close',syncSettings);mobile.addEventListener('change',syncSettings);syncSettings();
$('quick-settings').addEventListener('click',openSettings);
function openRouteComparison(){$('route-comparison-details').open=true;const section=$('comparison-section');section.scrollIntoView({block:'start',behavior:'smooth'});section.focus({preventScroll:true});}
$('quick-compare').addEventListener('click',openRouteComparison);$('route-details-open').addEventListener('click',openRouteComparison);
$('nav-map').addEventListener('click',()=>{canvas.scrollIntoView({block:'center',behavior:'smooth'});canvas.focus({preventScroll:true});});
canvas.addEventListener('pointerdown',e=>{state.drag={x:e.clientX,y:e.clientY,start:{...state.center},moved:false};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{const rect=canvas.getBoundingClientRect();if(state.drag){const dx=e.clientX-state.drag.x,dy=e.clientY-state.drag.y;if(Math.hypot(dx,dy)>5)state.drag.moved=true;state.center={x:state.drag.start.x-dx/state.scale,y:state.drag.start.y+dy/state.scale};constrain();draw();}else inspect(ground({x:e.clientX-rect.left,y:e.clientY-rect.top}));});
canvas.addEventListener('pointerup',e=>{const r=canvas.getBoundingClientRect();if(state.drag&&!state.drag.moved)inspect(ground({x:e.clientX-r.left,y:e.clientY-r.top}));state.drag=null;});canvas.addEventListener('pointercancel',()=>state.drag=null);
canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect(),p={x:e.clientX-r.left,y:e.clientY-r.top},before=ground(p);state.scale*=e.deltaY<0?1.12:1/1.12;constrain();const after=ground(p);state.center.x+=before.x-after.x;state.center.y+=before.y-after.y;constrain();draw();},{passive:false});
canvas.addEventListener('keydown',e=>{const delta=50/state.scale;if(e.key==='ArrowLeft')state.center.x-=delta;else if(e.key==='ArrowRight')state.center.x+=delta;else if(e.key==='ArrowUp')state.center.y+=delta;else if(e.key==='ArrowDown')state.center.y-=delta;else return;e.preventDefault();constrain();draw();});
document.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='d'&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)&&!dialog.open&&!settingsDialog.open&&!evaDialog.open){e.preventDefault();showSources();}});
new ResizeObserver(resize).observe(canvas);resize();calculate();

async function loadTerrain(){
  try{const r=await fetch('assets/jezero-terrain.json',{cache:'no-store'});if(!r.ok)throw new Error('Terrain HTTP '+r.status);state.terrain=createTerrain(await r.json());updateTerrainStatus();calculate();recenter();}
  catch(error){state.terrainError=true;$('terrain-status').textContent=t('dataFailed');document.querySelector('.evidence-banner').classList.add('error');calculate();console.error(error);}
}
async function loadTraverse(){
  try{const r=await fetch('assets/perseverance-traverse.json',{cache:'no-store'});if(!r.ok)throw new Error('Traverse HTTP '+r.status);const data=await r.json();if(Math.abs(data.origin.lon-MAP_ORIGIN.lon)>1e-8||Math.abs(data.origin.lat-MAP_ORIGIN.lat)>1e-8)throw new Error('Traverse origin mismatch');state.traverse=data;$('traverse-sols').textContent=data.solRange.join('–');draw();}
  catch(error){state.traverse=null;$('toggle-traverse').hidden=true;$('traverse-legend').hidden=true;console.warn(error);}
}
// Optional advisory layer: the planner works without it.
async function loadNightIr(){
  try{await terrainReady;if(!state.terrain)return;const r=await fetch('assets/jezero-night-ir.json',{cache:'no-store'});if(!r.ok)throw new Error('Night IR HTTP '+r.status);state.night=createNightIr(await r.json(),state.terrain);state.slopeLayers.delete('night');calculate();}
  catch(error){state.night=null;console.warn(error);}
}
async function loadImagery(){
  try{const r=await fetch('assets/data-manifest.json',{cache:'no-store'});if(!r.ok)throw new Error('Imagery manifest HTTP '+r.status);state.manifest=await r.json();
    const layers=['optical','topography'].map(k=>state.manifest.layers[k]).filter(Boolean);
    await Promise.all(layers.flatMap(layer=>layer.tiles.map(tile=>new Promise(resolve=>{const image=new Image();state.images.set(tile.path,image);image.onload=()=>{draw();resolve();};image.onerror=()=>resolve();image.src=tile.path;}))));state.ready=true;updateLayerText();recenter();
  }catch(error){state.manifest={layers:{}};state.ready=true;updateLayerText();draw();console.error(error);}
}
const terrainReady=loadTerrain();
await Promise.all([terrainReady,loadImagery(),loadNightIr(),loadTraverse()]);
{const q=new URL(location.href).searchParams;
  if(q.get('demo')==='1'&&state.terrain)startDemo();
  // Deep link for recording: ?view=eva[&work=minutes][&t=minutes]
  else if(q.get('view')==='eva'&&state.terrain){const work=Number(q.get('work'));if(work>=0&&work<=120&&q.get('work')!==null){$('work').value=String(work);calculate();}openEva();const at=Number(q.get('t'));if(at>0&&sim.timeline){sim.t=Math.min(at,sim.timeline.total);renderSim();draw();}}}
