(() => {
  'use strict';
  const button = document.getElementById('cake-button');
  const status = document.getElementById('status');
  const error = document.getElementById('audio-error');
  const front = document.getElementById('confetti');
  const back = document.getElementById('fireworks');
  const fg = front.getContext('2d');
  const bg = back.getContext('2d');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const paperColors = ['#eac578','#fff0c0','#e49287','#9dc8b6','#d0b0d5','#8dbbd1','#d6a54b'];
  const fireColors = ['#ffe6a7','#ffcb88','#e9adbc','#bce7d1'];
  const cues = [.035,.10,.22,.37,.52,.68,.82];
  let papers = [], sparks = [], rockets = [], rings = [];
  let frame = 0, previous = 0, finishTimer = 0, request = 0, show = null;

  function center() {
    const r = button.getBoundingClientRect();
    return {x:r.left+r.width*.5,y:r.top+r.height*.48,width:r.width};
  }
  function resize() {
    const dpr = Math.min(devicePixelRatio || 1,2);
    for(const canvas of [front,back]) {canvas.width=Math.round(innerWidth*dpr);canvas.height=Math.round(innerHeight*dpr);canvas.getContext('2d')?.setTransform(dpr,0,0,dpr,0,0);}
    if(show && motion.matches) drawStill();
  }
  resize(); addEventListener('resize',resize);

  function star(ctx,x,y,r,rotation=0) {
    ctx.beginPath();
    for(let i=0;i<10;i++) {const a=rotation+i*Math.PI/5-Math.PI/2;const s=i%2?r*.42:r;const px=x+Math.cos(a)*s,py=y+Math.sin(a)*s;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}
    ctx.closePath();ctx.fill();
  }
  function confetti(count=180,side=false) {
    const c=center(),scale=Math.min(innerWidth/800,1);
    for(let i=0;i<count;i++) {
      const left=i%2===0;
      const angle=side?(left?-.28-Math.random()*1.1:Math.PI+.28+Math.random()*1.1):Math.random()*Math.PI*2;
      const speed=(6+Math.random()*15)*(.55+.45*scale);
      papers.push({x:side?(left?innerWidth*.08:innerWidth*.92):c.x,y:side?innerHeight*.78:c.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-(side?0:5),rotation:Math.random()*6.28,spin:(Math.random()-.5)*.18,w:4+Math.random()*5,h:5+Math.random()*9,color:paperColors[i%paperColors.length],type:i%13===0?'star':i%9===0?'ribbon':'paper',age:0,life:220+Math.random()*100,phase:Math.random()*6.28});
    }
    papers=papers.slice(-360);
  }
  function firework(x,y,color=fireColors[0],large=false) {
    if(!bg) return;
    const count=large?100:72,scale=Math.min(innerWidth/700,1);
    for(let i=0;i<count;i++) {
      const angle=i/count*Math.PI*2;
      const speed=(2.2+Math.random()*3.8)*(large?1.25:1)*(.6+.4*scale);
      sparks.push({x,y,px:x,py:y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,age:0,life:55+Math.random()*38,color,width:Math.random()*1.4+.7,trail:[]});
    }
    sparks=sparks.slice(-650);
    rings.push({x,y,r:5,age:0,color});rings=rings.slice(-8);
  }
  function launch(x,y,color) {
    rockets.push({sx:x<innerWidth*.5?innerWidth*.1:innerWidth*.9,sy:innerHeight*1.05,x,y,color,age:0,life:38+Math.random()*14,trail:[]});
    rockets=rockets.slice(-6);
  }
  function fireCue(index) {
    const color=fireColors[index%fireColors.length];
    const positions=[[.19,.23],[.81,.28],[.30,.16],[.78,.21],[.20,.30],[.74,.17],[.28,.20]];
    const [x,y]=positions[index];
    launch(innerWidth*x,innerHeight*y,color);
    if(index===3||index===6) launch(innerWidth*(1-x),innerHeight*(y+.08),fireColors[(index+1)%4]);
    if(index===2||index===4||index===6) confetti(index===6?150:65,true);
  }
  function drawStill() {
    if(!fg||!bg)return;
    const c=center();fg.clearRect(0,0,innerWidth,innerHeight);bg.clearRect(0,0,innerWidth,innerHeight);
    for(let i=0;i<135;i++) {
      const a=Math.random()*Math.PI*2,d=c.width*(.26+Math.random()*.55);
      fg.save();fg.translate(c.x+Math.cos(a)*d,c.y+Math.sin(a)*d);fg.rotate(a);fg.globalAlpha=.5+Math.random()*.5;fg.fillStyle=paperColors[i%paperColors.length];
      if(i%9===0)star(fg,0,0,5);else fg.fillRect(-3,-4,4+Math.random()*4,7+Math.random()*5);fg.restore();
    }
    for(const [px,py] of [[.17,.22],[.82,.28]]) {
      const x=innerWidth*px,y=innerHeight*py,r=Math.min(95,innerWidth*.17);
      bg.save();bg.strokeStyle='#f9d88a';bg.lineWidth=1;
      for(let i=0;i<28;i++){const a=i/28*Math.PI*2;bg.globalAlpha=.2+Math.random()*.4;bg.beginPath();bg.moveTo(x+Math.cos(a)*r*.55,y+Math.sin(a)*r*.55);bg.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r);bg.stroke();}bg.restore();
    }
  }
  function clearVisuals() {
    cancelAnimationFrame(frame);frame=0;clearTimeout(finishTimer);finishTimer=0;
    papers=[];sparks=[];rockets=[];rings=[];show=null;
    fg?.clearRect(0,0,innerWidth,innerHeight);bg?.clearRect(0,0,innerWidth,innerHeight);
    button.classList.remove('popping','celebrated','pressed');document.body.classList.remove('party');
  }
  function finish() {
    clearVisuals();window.BirthdayAudio?.stop();
  }
  function scheduleStillEnd() {
    clearTimeout(finishTimer);
    finishTimer=setTimeout(finish,Math.max(0,show.duration*1000-(performance.now()-show.start)));
  }
  function draw(time) {
    if(!show) {frame=0;return;}
    const dt=Math.min(Math.max((time-previous)/16.67,.01),2);previous=time;
    const elapsed=(time-show.start)/1000;
    if(elapsed>show.duration) {finish();return;}
    while(show.next<cues.length && elapsed>=cues[show.next]*show.duration)fireCue(show.next++);
    if(elapsed>.9)button.classList.remove('popping');
    bg?.clearRect(0,0,innerWidth,innerHeight);fg?.clearRect(0,0,innerWidth,innerHeight);
    if(bg) {
      bg.save();bg.globalCompositeOperation='lighter';
      rockets=rockets.filter(r=>r.age<r.life);
      for(const r of rockets) {
        r.age+=dt;const p=Math.min(1,r.age/r.life),ease=1-Math.pow(1-p,1.4);
        const x=r.sx+(r.x-r.sx)*ease,y=r.sy+(r.y-r.sy)*ease;
        r.trail.push({x,y});if(r.trail.length>9)r.trail.shift();
        bg.strokeStyle=r.color;
        for(let i=1;i<r.trail.length;i++){bg.globalAlpha=i/r.trail.length*.65;bg.lineWidth=1.7;bg.beginPath();bg.moveTo(r.trail[i-1].x,r.trail[i-1].y);bg.lineTo(r.trail[i].x,r.trail[i].y);bg.stroke();}
        if(p===1)firework(r.x,r.y,r.color,true);
      }
      sparks=sparks.filter(p=>p.age<p.life);
      for(const p of sparks) {
        p.age+=dt;p.px=p.x;p.py=p.y;p.vx*=Math.pow(.982,dt);p.vy=p.vy*Math.pow(.982,dt)+.035*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;
        p.trail.push({x:p.px,y:p.py});if(p.trail.length>4)p.trail.shift();
        const fade=Math.pow(Math.max(0,1-p.age/p.life),1.2);
        bg.globalAlpha=fade*.8;bg.strokeStyle=p.color;bg.lineWidth=p.width;
        bg.beginPath();bg.moveTo(p.trail[0].x,p.trail[0].y);bg.lineTo(p.x,p.y);bg.stroke();
        bg.globalAlpha=fade;bg.fillStyle=p.color;bg.beginPath();bg.arc(p.x,p.y,p.width*.8,0,Math.PI*2);bg.fill();
      }
      rings=rings.filter(r=>r.age<45);
      for(const r of rings){r.age+=dt;r.r+=2.6*dt;bg.globalAlpha=Math.pow(Math.max(0,1-r.age/45),2)*.25;bg.strokeStyle=r.color;bg.lineWidth=1;bg.beginPath();bg.arc(r.x,r.y,r.r,0,Math.PI*2);bg.stroke();}
      bg.restore();
    }
    if(fg) {
      papers=papers.filter(p=>p.age<p.life && p.y<innerHeight+50);
      for(const p of papers) {
        p.age+=dt;p.vx*=Math.pow(.989,dt);p.vy+=.105*dt;p.x+=(p.vx+Math.sin(p.age*.035+p.phase)*.4)*dt;p.y+=p.vy*dt;p.rotation+=p.spin*dt;
        fg.save();fg.translate(p.x,p.y);fg.rotate(p.rotation);fg.globalAlpha=Math.max(0,Math.min(1,(p.life-p.age)/45));fg.fillStyle=p.color;fg.strokeStyle=p.color;
        if(p.type==='star')star(fg,0,0,p.w*.8);else if(p.type==='ribbon'){fg.lineWidth=2.5;fg.beginPath();for(let j=0;j<20;j++){const x=Math.sin(j*.5+p.age*.04)*5,y=j*2; j?fg.lineTo(x,y):fg.moveTo(x,y);}fg.stroke();}else{const flip=Math.cos(p.age*.065+p.phase);fg.scale(1,flip);fg.fillRect(-p.w/2,-p.h/2,p.w,p.h);fg.fillStyle='#fff';fg.globalAlpha*=.25;fg.fillRect(-p.w/2,-p.h/2,p.w,1.5);}
        fg.restore();
      }
    }
    frame=requestAnimationFrame(draw);
  }

  button.addEventListener('click',async()=>{
    const current=++request;
    clearVisuals();error.hidden=true;
    void button.offsetWidth;
    button.classList.add('celebrated','popping');document.body.classList.add('party');
    status.textContent='우리 아빠, 생신 축하드려요!';
    show={start:performance.now(),duration:22,next:0};
    if(motion.matches){drawStill();scheduleStillEnd();}else{
      confetti(220);const c=center();firework(c.x,c.y,'#ffe7aa',true);
      previous=performance.now();frame=requestAnimationFrame(draw);
    }
    try {
      if(!window.BirthdayAudio)throw new Error('Audio unavailable');
      const result=await window.BirthdayAudio.play();
      if(current!==request||!show)return;
      if(result?.duration>0)show.duration=result.duration;
      if(motion.matches)scheduleStillEnd();
    }catch(_){if(current===request)error.hidden=false;}
  });
  button.addEventListener('pointermove',event=>{
    if(motion.matches||event.pointerType==='touch')return;
    const r=button.getBoundingClientRect();
    button.style.setProperty('--rx',`${-(event.clientY-r.top-r.height/2)/r.height*5}deg`);
    button.style.setProperty('--ry',`${(event.clientX-r.left-r.width/2)/r.width*7}deg`);
  });
  function resetTilt(){button.style.setProperty('--rx','0deg');button.style.setProperty('--ry','0deg');button.classList.remove('pressed');}
  button.addEventListener('pointerleave',resetTilt);
  button.addEventListener('pointerdown',()=>button.classList.add('pressed'));
  button.addEventListener('pointerup',()=>button.classList.remove('pressed'));
  button.addEventListener('pointercancel',resetTilt);
  function stop(){request++;finish();resetTilt();error.hidden=true;}
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')stop();});
  motion.addEventListener('change',()=>{
    resetTilt();
    if(!show)return;
    cancelAnimationFrame(frame);frame=0;clearTimeout(finishTimer);
    if(motion.matches){drawStill();scheduleStillEnd();}else{previous=performance.now();frame=requestAnimationFrame(draw);}
  });
})();
