export const RADIUS = 3396190;
export const BASE = { lon:77.4298, lat:18.4663 };
export const TARGETS = [
  {id:'delta',name:'Margem do delta',tag:'SEDIMENTOS',x:-2300,y:1800,description:'Alvo demonstrativo para observar depósitos próximos ao antigo delta. Investigar registros da história da água.'},
  {id:'rochas',name:'Afloramento rochoso',tag:'GEOLOGIA',x:1400,y:1200,description:'Alvo demonstrativo para documentar textura e diversidade de rochas com fotografia e coleta simulada.'},
  {id:'cratera',name:'Transecto de superfície',tag:'REGOLITO',x:-1700,y:-1700,description:'Alvo demonstrativo para comparar materiais superficiais ao longo de um transecto.'}
];
// Zonas hipotéticas de treinamento, em metros, relativas à base hipotética.
export const HAZARDS = [
  {x:-1180,y:900,r:490,label:'Zona A'},
  {x:700,y:590,r:300,label:'Zona B'},
  {x:-800,y:-820,r:290,label:'Zona C'}
];
export function toGeo(p) { return {lon:BASE.lon + p.x/(RADIUS*Math.cos(BASE.lat*Math.PI/180))*180/Math.PI,lat:BASE.lat+p.y/RADIUS*180/Math.PI}; }
export function fromGeo(p) { return {x:(p.lon-BASE.lon)*Math.PI/180*RADIUS*Math.cos(BASE.lat*Math.PI/180),y:(p.lat-BASE.lat)*Math.PI/180*RADIUS}; }
export function length(points) { return points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-points[i].x,p.y-points[i].y),0); }
export function blocked(p, hazards=HAZARDS) { return hazards.some(h=>Math.hypot(p.x-h.x,p.y-h.y)<=h.r+80); }
export function segmentBlocked(a,b,hazards=HAZARDS) { const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/20)); for(let i=0;i<=n;i++) if(blocked({x:a.x+(b.x-a.x)*i/n,y:a.y+(b.y-a.y)*i/n},hazards)) return true; return false; }
export function findRoute(start,end,avoid=true,hazards=HAZARDS) {
  if(!avoid) return [start,end];
  if(blocked(start,hazards)||blocked(end,hazards)) return null;
  if(!segmentBlocked(start,end,hazards)) return [start,end];
  const step=80,margin=2200,minX=Math.floor((Math.min(start.x,end.x)-margin)/step)*step,minY=Math.floor((Math.min(start.y,end.y)-margin)/step)*step;
  const cols=Math.ceil((Math.abs(start.x-end.x)+margin*2)/step)+1,rows=Math.ceil((Math.abs(start.y-end.y)+margin*2)/step)+1;
  const pos=id=>({x:minX+(id%cols)*step,y:minY+Math.floor(id/cols)*step});
  const idOf=p=>Math.round((p.y-minY)/step)*cols+Math.round((p.x-minX)/step);
  const sid=idOf(start),eid=idOf(end),g=new Map([[sid,0]]),came=new Map(),closed=new Set(),open=[{id:sid,f:0}];
  const push=n=>{open.push(n);let i=open.length-1;while(i>0){const p=(i-1)>>1;if(open[p].f<=n.f)break;open[i]=open[p];i=p;}open[i]=n;};
  const pop=()=>{const top=open[0],last=open.pop();if(open.length){let i=0;while(true){let c=i*2+1;if(c>=open.length)break;if(c+1<open.length&&open[c+1].f<open[c].f)c++;if(last.f<=open[c].f)break;open[i]=open[c];i=c;}open[i]=last;}return top;};
  while(open.length){
    const {id}=pop();if(closed.has(id))continue;
    if(id===eid){let nodes=[end],cur=id;while(came.has(cur)){nodes.push(pos(cur));cur=came.get(cur);}nodes.push(start);nodes.reverse();let simplified=[nodes[0]],i=0;while(i<nodes.length-1){let j=nodes.length-1;while(j>i+1&&segmentBlocked(nodes[i],nodes[j],hazards))j--;if(segmentBlocked(nodes[i],nodes[j],hazards))return null;simplified.push(nodes[j]);i=j;}return simplified;}
    closed.add(id);const a=pos(id),x=id%cols,y=Math.floor(id/cols);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if((!dx&&!dy)||x+dx<0||x+dx>=cols||y+dy<0||y+dy>=rows)continue;
      const nid=(y+dy)*cols+x+dx,b=pos(nid);if(closed.has(nid)||segmentBlocked(a,b,hazards))continue;
      const cost=g.get(id)+Math.hypot(dx,dy)*step;
      if(cost<(g.get(nid)??Infinity)){g.set(nid,cost);came.set(nid,id);push({id:nid,f:cost+Math.hypot(end.x-b.x,end.y-b.y)});}
    }
  }
  return null;
}
export function budget(distance,speed,work,autonomy,reserve){
  if(!Number.isFinite(distance)||distance<0||speed<=0)throw new Error('Parâmetros inválidos');
  const walking=distance/(speed*1000)*60,total=walking+work,remaining=autonomy-total;
  return {walking,total,remaining,reserve,feasible:remaining>=reserve,excess:Math.max(0,total-(autonomy-reserve))};
}
