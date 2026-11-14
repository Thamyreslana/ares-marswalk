import {fromGeo,RADIUS} from './planner.js';

export function tileBounds(tile,layer){
  return tile.bounds || {west:-180+tile.col*360/layer.matrixWidth,east:-180+(tile.col+1)*360/layer.matrixWidth,north:90-tile.row*180/layer.matrixHeight,south:90-(tile.row+1)*180/layer.matrixHeight};
}

export function coverageBounds(layer){
  if(!layer?.tiles?.length)return null;
  const boxes=layer.tiles.map(tile=>tileBounds(tile,layer));
  const sw=fromGeo({lon:Math.min(...boxes.map(b=>b.west)),lat:Math.min(...boxes.map(b=>b.south))});
  const ne=fromGeo({lon:Math.max(...boxes.map(b=>b.east)),lat:Math.max(...boxes.map(b=>b.north))});
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
    const b=tileBounds(tile,layer),tl=screen(fromGeo({lon:b.west,lat:b.north})),br=screen(fromGeo({lon:b.east,lat:b.south}));
    if(br.x<=0||tl.x>=width||br.y<=0||tl.y>=height)continue;
    ctx.drawImage(img,tl.x,tl.y,br.x-tl.x+.25,br.y-tl.y+.25);visible++;
  }
  ctx.restore();return visible;
}
