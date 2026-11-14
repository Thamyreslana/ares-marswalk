import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const local=path.resolve('.local');await fs.mkdir(local,{recursive:true});
const browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=9227',`--user-data-dir=${path.join(local,'chrome-profile')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));let ws;
try{
  let page;for(let i=0;i<60;i++){try{page=(await(await fetch('http://127.0.0.1:9227/json/list')).json()).find(p=>p.type==='page');if(page)break;}catch{}await delay(200);}if(!page)throw new Error('Chrome indisponível');
  ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  let seq=0;const pending=new Map(),errors=[];ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const task=pending.get(m.id);if(task){pending.delete(m.id);m.error?task.reject(new Error(m.error.message)):task.resolve(m.result);}}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text+' '+(m.params.exceptionDetails.exception?.description??''));};
  ws.onclose=e=>{for(const task of pending.values())task.reject(new Error('CDP desconectou: '+e.code+' '+e.reason));};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method));},15000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;};
  await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:'http://127.0.0.1:4173/'});
  for(let i=0;i<100;i++){if(await evaluate(`document.getElementById('tile-status')?.textContent.includes('salvo localmente')`))break;await delay(150);}
  assert.match(await evaluate(`document.getElementById('tile-status').textContent`),/salvo localmente/);
  assert.equal(await evaluate(`document.getElementById('map-empty').hidden`),true);
  assert.equal(await evaluate(`document.getElementById('result-chip').textContent`),'DENTRO DA AUTONOMIA');
  let screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await fs.writeFile(path.join(local,'desktop.png'),Buffer.from(screenshot.data,'base64'));
  await evaluate(`document.getElementById('autonomy').value=60;document.getElementById('autonomy').dispatchEvent(new Event('input'));`);
  assert.equal(await evaluate(`document.getElementById('result-chip').textContent`),'RESERVA INSUFICIENTE');
  await evaluate(`document.getElementById('autonomy').value=240;document.getElementById('autonomy').dispatchEvent(new Event('input'));document.getElementById('route-direct').click();`);
  assert.equal(await evaluate(`document.getElementById('result-chip').textContent`),'CRUZA ZONA SIMULADA');
  for(const layer of ['topography','thermal','optical']){await evaluate(`document.querySelector('[data-layer="${layer}"]').click()`);assert.equal(await evaluate(`document.getElementById('map-empty').hidden`),true);}
  await evaluate(`document.getElementById('sources-top').click()`);assert.equal(await evaluate(`document.getElementById('sources-dialog').open`),true);assert.match(await evaluate(`document.getElementById('sources-content').textContent`),/THEMIS/);await evaluate(`document.getElementById('close-sources').click()`);
  const downloads=path.join(local,'downloads');await fs.mkdir(downloads,{recursive:true});await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});await evaluate(`document.getElementById('export').click()`);for(let i=0;i<20;i++){try{await fs.access(path.join(downloads,'ares-plano-missao.json'));break;}catch{}await delay(100);}
  const exported=JSON.parse(await fs.readFile(path.join(downloads,'ares-plano-missao.json'),'utf8'));assert.equal(exported.prototype,true);assert.ok(Object.keys(exported.sources.layers).length>=3);assert.equal(exported.route.coordinates[0][0],exported.route.coordinates.at(-1)[0]);
  await evaluate(`document.getElementById('route-avoid').click()`);await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(300);assert.equal(await evaluate(`document.documentElement.scrollWidth <= 390`),true);screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await fs.writeFile(path.join(local,'mobile.png'),Buffer.from(screenshot.data,'base64'));
  assert.deepEqual(errors,[]);process.stdout.write(JSON.stringify({checks:['desktop render','NASA tiles in three layers','reserve warning','direct route warning','source dialog','JSON export','mobile layout','no JavaScript exceptions'],screenshots:[path.join(local,'desktop.png'),path.join(local,'mobile.png')]},null,2)+'\n');
  if(process.argv.includes('--challenge')){
    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:'https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/?tab=resources'});
    await delay(12000);
    const content=await evaluate(`JSON.stringify({title:document.title,text:document.body.innerText,links:[...document.querySelectorAll('a[href]')].map(a=>({text:a.innerText,url:a.href}))})`);
    await fs.writeFile(path.join(local,'challenge-page.json'),content);process.stdout.write(content.slice(0,18000)+'\n');
  }
}finally{ws?.close();browser.kill();}
