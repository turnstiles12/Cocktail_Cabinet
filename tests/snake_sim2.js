global.window = global; global.localStorage = {getItem(){return null}, setItem(){}}; global.addEventListener = ()=>{};
let rots=0, crashes=0; let SLACK;
require('../js/core.js'); require('../js/games/snake.js');
const {snakeAI, legal, bfs, safeAfterEating, C, R} = CC._snake;
const DIRS=[[1,0],[0,1],[-1,0],[0,-1]];
function match(skillFn){ // returns {you, eaten}
 let you=0, eaten=0;
 while(you<6 && eaten<30){
  let body=[{x:8,y:12},{x:7,y:12},{x:6,y:12},{x:5,y:12}], dir=0, apple=null, grow=0, crashed=false;
  for(let ticks=0; ticks<20000 && you<6 && eaten<30; ticks++){
   const level=1+Math.floor(eaten/4);
   if(!apple){ const B=bfs(body); const occ=new Set(body.map(b=>b.y*C+b.x)); const h=body[0]; const traps=[], ok=[];
     for(let i=0;i<C*R;i++){ if(B.dist[i]<=0||occ.has(i)) continue; const x=i%C,y=(i/C)|0; if(Math.abs(x-h.x)+Math.abs(y-h.y)<3) continue; ok.push(i); if(!safeAfterEating(body,B,i)) traps.push(i); }
     const pool = traps.length? traps : ok; const i=pool[Math.floor(Math.random()*pool.length)];
     apple={x:i%C,y:(i/C)|0,t:0,life:B.dist[i]+SLACK(level)}; }
   const skill=skillFn(level);
   const k=snakeAI(body,dir,apple,skill,grow>0); dir=k;
   if(!legal(body,k,apple,grow>0)){ you+=2; crashes++; crashed=true; break; }
   const h=body[0], nh={x:h.x+DIRS[k][0],y:h.y+DIRS[k][1]}; const eats=apple&&apple.x===nh.x&&apple.y===nh.y;
   body.unshift(nh); if(eats){grow+=2; eaten++; apple=null;} else if(grow>0) grow--; else body.pop();
   if(apple && ++apple.t>=apple.life){ you++; rots++; apple=null; }
  }
  if(!crashed && you<6 && eaten<30) break;
 }
 return {you,eaten};
}



for (const [name,f] of [['2+1.5L',l=>Math.round(2+1.5*l)],['3+L',l=>3+l],['1+2L',l=>1+2*l]]) { SLACK=f; rots=0; crashes=0; let hw=0, e=0; for(let i=0;i<80;i++){ const r=match(l=>Math.min(1,(l-1)/6)); if(r.you>=6) hw++; e+=r.eaten;} console.log(name,'win',(hw/80).toFixed(2),'apples',(e/80).toFixed(1),'rots',rots,'crashes',crashes); }
