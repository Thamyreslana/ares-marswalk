// Resample the THEMIS Night IR controlled mosaic (NASA/JPL Mars Trek) onto the ARES 40 m terrain grid.
// Output: dist/assets/jezero-night-ir.json, aligned cell-for-cell with dist/assets/jezero-terrain.json.
// The tile is an 8-bit brightness rendering, not calibrated temperature or thermal inertia.
// Run: node tools/prepare-night-ir.mjs   (no dependencies; downloads the tile into .local/downloads/night/)
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {toGeo} from '../dist/terrain-planner.js';

const PRODUCT='THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018',LEVEL=9,ROW=203,COL=732,MATRIX_W=1024,MATRIX_H=512;
const CAPABILITIES=`https://trek.nasa.gov/tiles/Mars/EQ/${PRODUCT}/1.0.0/WMTSCapabilities.xml`;
const WEST=-180+COL*360/MATRIX_W,EAST=-180+(COL+1)*360/MATRIX_W,NORTH=90-ROW*180/MATRIX_H,SOUTH=90-(ROW+1)*180/MATRIX_H;
const root=new URL('../',import.meta.url),tileFile=new URL(`.local/downloads/night/night-${LEVEL}-${ROW}-${COL}.png`,root);

// The tile URL comes from the service's own capabilities document.
const caps=await (await fetch(CAPABILITIES)).text();
const template=caps.match(/ResourceURL[^>]*template="([^"]+)"/)[1],matrixSet=caps.match(/<TileMatrixSet>\s*<ows:Identifier>([^<]+)</)?.[1]??caps.match(/<ows:Identifier>(default\d+mm)<\/ows:Identifier>/)[1],style=caps.match(/<Style[^>]*>\s*<ows:Title>[^<]*<\/ows:Title>\s*<ows:Identifier>([^<]+)</)?.[1]??'default';
const URL_=template.replace('{TileMatrixSet}',matrixSet).replace('{Style}',style).replace('{TileMatrix}',LEVEL).replace('{TileRow}',ROW).replace('{TileCol}',COL);
if(!fs.existsSync(tileFile)){fs.mkdirSync(new URL('.',tileFile),{recursive:true});const r=await fetch(URL_);if(!r.ok)throw new Error('Tile HTTP '+r.status);fs.writeFileSync(tileFile,Buffer.from(await r.arrayBuffer()));}
const raw=fs.readFileSync(tileFile);

// Minimal PNG decoder: 8-bit, non-interlaced, grayscale / gray+alpha / RGB / RGBA / palette.
function decodePng(buf){
  if(buf.readUInt32BE(0)!==0x89504e47)throw new Error('Not a PNG');
  let pos=8,width,height,depth,type,interlace,palette=null,trns=null;const idat=[];
  while(pos<buf.length){const len=buf.readUInt32BE(pos),kind=buf.toString('ascii',pos+4,pos+8),data=buf.subarray(pos+8,pos+8+len);pos+=12+len;
    if(kind==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);depth=data[8];type=data[9];interlace=data[12];}
    else if(kind==='PLTE')palette=data;else if(kind==='tRNS')trns=data;else if(kind==='IDAT')idat.push(data);else if(kind==='IEND')break;}
  if(depth!==8||interlace)throw new Error(`Unsupported PNG depth ${depth} interlace ${interlace}`);
  const channels={0:1,2:3,3:1,4:2,6:4}[type],stride=width*channels,inflated=zlib.inflateSync(Buffer.concat(idat)),px=Buffer.alloc(height*stride);
  for(let y=0;y<height;y++){const f=inflated[y*(stride+1)],line=inflated.subarray(y*(stride+1)+1,(y+1)*(stride+1)),out=px.subarray(y*stride,(y+1)*stride),prev=y?px.subarray((y-1)*stride,y*stride):null;
    for(let i=0;i<stride;i++){const a=i>=channels?out[i-channels]:0,b=prev?prev[i]:0,c=prev&&i>=channels?prev[i-channels]:0;let v=line[i];
      if(f===1)v+=a;else if(f===2)v+=b;else if(f===3)v+=(a+b)>>1;else if(f===4){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);v+=pa<=pb&&pa<=pc?a:pb<=pc?b:c;}out[i]=v&255;}}
  const gray=new Float64Array(width*height),valid=new Uint8Array(width*height);
  for(let i=0;i<width*height;i++){const o=i*channels;let g,alpha=255;
    if(type===0){g=px[o];}else if(type===4){g=px[o];alpha=px[o+1];}else if(type===2){g=(px[o]+px[o+1]+px[o+2])/3;}else if(type===6){g=(px[o]+px[o+1]+px[o+2])/3;alpha=px[o+3];}
    else{const k=px[o];g=(palette[k*3]+palette[k*3+1]+palette[k*3+2])/3;alpha=trns&&k<trns.length?trns[k]:255;}
    gray[i]=g;valid[i]=alpha>0?1:0;}
  return {width,height,type,gray,valid};
}
const img=decodePng(raw);if(img.width!==img.height)throw new Error('Unexpected tile shape');
const size=img.width;
function sample(lon,lat){
  const px=(lon-WEST)/(EAST-WEST)*size-.5,py=(NORTH-lat)/(NORTH-SOUTH)*size-.5,x0=Math.floor(px),y0=Math.floor(py);
  if(x0<0||y0<0||x0+1>=size||y0+1>=size)return null;
  for(const [dx,dy]of [[0,0],[1,0],[0,1],[1,1]])if(!img.valid[(y0+dy)*size+x0+dx])return null;
  const fx=px-x0,fy=py-y0,g=(x,y)=>img.gray[y*size+x];
  return (g(x0,y0)*(1-fx)+g(x0+1,y0)*fx)*(1-fy)+(g(x0,y0+1)*(1-fx)+g(x0+1,y0+1)*fx)*fy;
}
const terrain=JSON.parse(fs.readFileSync(new URL('dist/assets/jezero-terrain.json',root),'utf8'));
const values=[];
for(let r=0;r<terrain.rows;r++)for(let c=0;c<terrain.cols;c++){const g=toGeo({x:terrain.xMin+(c+.5)*terrain.step,y:terrain.yMax-(r+.5)*terrain.step}),v=sample(g.lon,g.lat);values.push(v==null?null:Math.round(v));}
const known=values.filter(v=>v!=null).sort((a,b)=>a-b),q=p=>known[Math.floor(p*(known.length-1))];
const out={id:'THEMIS_NightIR_on_ARES_40m_grid',title:'THEMIS Night IR brightness resampled to the ARES planning grid',product:PRODUCT,capabilities:CAPABILITIES,tileUrl:URL_,
  tile:{level:LEVEL,row:ROW,col:COL,west:WEST,east:EAST,north:NORTH,south:SOUTH,pixels:size,pngColorType:img.type,approxMetersPerPixel:(EAST-WEST)/size*Math.PI/180*terrain.origin.radiusMeters*Math.cos(terrain.origin.lat*Math.PI/180),sha256:crypto.createHash('sha256').update(raw).digest('hex')},
  sourceResolutionMeters:100,preparedAt:new Date().toISOString(),grid:{cols:terrain.cols,rows:terrain.rows,step:terrain.step,xMin:terrain.xMin,yMax:terrain.yMax},origin:terrain.origin,
  resampling:'Bilinear sample of the 8-bit tile brightness at each 40 m terrain cell centre. This adds no detail below the ~80 m tile pixel or the 100 m source resolution.',
  classes:{coolMax:q(.25),warmMin:q(.75),median:q(.5),method:'Quartiles of brightness within this terrain subset: cool = lowest 25%, warm = highest 25%.'},
  interpretation:'Relative night-time brightness only. Warmer at night usually indicates rock or consolidated material; cooler usually indicates finer, looser material (sand, dust). Not calibrated temperature or thermal inertia, and not used in route cost.',
  values};
fs.writeFileSync(new URL('dist/assets/jezero-night-ir.json',root),JSON.stringify(out));
console.log(JSON.stringify({type:img.type,size,known:known.length,missing:values.length-known.length,min:known[0],p25:out.classes.coolMax,p50:out.classes.median,p75:out.classes.warmMin,max:known.at(-1),url:URL_}));
