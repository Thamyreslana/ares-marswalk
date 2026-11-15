import {fromGeo,RADIUS} from './planner.js';

// Display registration measured against the USGS Mars 2020 TRN CTX orthomosaic (JEZ_ctx_B_soc_008, 6 m),
// the frame the DEM and NASA waypoints agree with. Six landmarks, image-to-image correlation r 0.85-0.91,
// spread +/-10 m: the Caltech tiles sit ~55 m east and ~105 m south of it. tools/check-alignment.py reproduces it.
// Only where the imagery is drawn moves; routes, slopes and coordinates are untouched.
export const IMAGE_REGISTRATION=Object.freeze({Mars2020CTX_E76_N16:Object.freeze({east:-55,north:105})});
export function registration(layer){return IMAGE_REGISTRATION[layer?.product]||{east:0,north:0};}
function corner(lon,lat,layer){const p=fromGeo({lon,lat}),r=registration(layer);return {x:p.x+r.east,y:p.y+r.north};}

export function tileBounds(tile,layer){
  return tile.bounds || {west:-180+tile.col*360/layer.matrixWidth,east:-180+(tile.col+1)*360/layer.matrixWidth,north:90-tile.row*180/layer.matrixHeight,south:90-(tile.row+1)*180/layer.matrixHeight};
}

export function coverageBounds(layer){
  if(!layer?.tiles?.length)return null;
  const boxes=layer.tiles.map(tile=>tileBounds(tile,layer));
  const sw=corner(Math.min(...boxes.map(b=>b.west)),Math.min(...boxes.map(b=>b.south)),layer);
  const ne=corner(Math.max(...boxes.map(b=>b.east)),Math.max(...boxes.map(b=>b.north)),layer);
  return {minX:sw.x,maxX:ne.x,minY:sw.y,maxY:ne.y};
}

export function pixelSize(layer){
  return layer?180/layer.matrixHeight*Math.PI/180*RADIUS/layer.tileSize:10;
}

export function cameraLimits(layer,width,height){
  const bounds=coverageBounds(layer);
  const minimum=bounds?Math.max(width/(bounds.maxX-bounds.minX),height/(bounds.maxY-bounds.minY)):.01;
  return {bounds,minScale:minimum,maxScale:Math.max(minimum,2/pixelSize(layer))};
}

export function constrainCamera(camera,layer,width,height){
  const limits=cameraLimits(layer,width,height),scale=Math.max(limits.minScale,Math.min(limits.maxScale,camera.scale)),center={...camera.center},b=limits.bounds;
  if(b){const halfW=width/(2*scale),halfH=height/(2*scale);center.x=Math.max(b.minX+halfW,Math.min(b.maxX-halfW,center.x));center.y=Math.max(b.minY+halfH,Math.min(b.maxY-halfH,center.y));}
  return {scale,center};
}

export function scaleBar(scale,maxPixels=100){
  const maxMeters=maxPixels/scale,power=10**Math.floor(Math.log10(maxMeters));
  const meters=[5,2,1].map(n=>n*power).find(n=>n<=maxMeters)||power/2;
  return {meters,pixels:meters*scale,label:meters>=1000?`${meters/1000} km`:`${meters} m`};
}

export function drawTiles(ctx,layer,images,screen,width,height){
  let visible=0;
  if(!layer)return visible;
  ctx.save();ctx.filter='none';ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  for(const tile of layer.tiles){
    const img=images.get(tile.path);if(!img?.complete||!img.naturalWidth)continue;
    const b=tileBounds(tile,layer),tl=screen(corner(b.west,b.north,layer)),br=screen(corner(b.east,b.south,layer));
    if(br.x<=0||tl.x>=width||br.y<=0||tl.y>=height)continue;
    ctx.drawImage(img,tl.x,tl.y,br.x-tl.x+.25,br.y-tl.y+.25);visible++;
  }
  ctx.restore();return visible;
}
