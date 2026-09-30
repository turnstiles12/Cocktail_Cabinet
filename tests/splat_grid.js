global.window = global; global.localStorage = {getItem(){return null}, setItem(){}}; global.addEventListener = ()=>{};
require('../js/core.js'); require('../js/games/splat.js');
const {birdPlan, hitsColumn, maxDeltaFor, clampGap, consts:K} = CC._splat;
function run(skill, v, cols=400){
  const gap=150, md=maxDeltaFor(v);
  let bird={y:K.H/2-40,vy:0}, list=[], prev=K.H/2, passed=0, deaths=0, frame=0, plan={flap:false,chunk:6}, offset=0;
  const spawn=()=>{ let target = prev < K.GROUND/2 ? 9999 : -9999; let lo=clampGap(prev-md,gap), hi=clampGap(prev+md,gap); const gy=Math.min(hi,Math.max(lo,target)); list.push({x:K.W+10,gy,gap}); prev=gy; };
  spawn();
  while(passed<cols && deaths<60){
    frame++;
    if(frame%plan.chunk===0){ plan=birdPlan(bird,list,v,skill,offset); if(plan.flap) bird.vy=K.FLAP; }
    bird.vy+=K.G*K.DT; bird.y+=bird.vy*K.DT; if(bird.y<K.BRAD){bird.y=K.BRAD;bird.vy=0;}
    for(const c of list){ c.x-=v*K.DT; if(!c.passed && c.x+K.CW<K.BX-K.HITR){c.passed=true;passed++; offset=CC.gauss()*0.22*gap*(1-skill);} }
    list=list.filter(c=>c.x>-K.CW-10);
    const last=list[list.length-1]; if(!last||last.x<K.W+10-K.SPACING) spawn();
    if(bird.y+K.BRAD>K.GROUND || list.some(c=>hitsColumn(bird.y,c))){ deaths++; bird={y:K.H/2-40,vy:0}; list=[]; prev=K.H/2; spawn(); }
  }
  return (passed/Math.max(1,deaths)).toFixed(1);
}
for (const v of [150,180,220]) { let row='v'+v+': '; for (let s=0;s<=1.001;s+=0.1) row += s.toFixed(1)+'='+run(s,v)+'  '; console.log(row); }
