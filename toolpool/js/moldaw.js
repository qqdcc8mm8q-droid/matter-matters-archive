/* Tool Pool – Moldaw als Nodes
   Der Simulationskern (Wachstum, die acht Schimmelarten, Farbsätze, Kontur-Wachstum) ist unverändert
   aus der Datei Moldaw.html übernommen. Neu ist nur der Teil ganz unten: jeder Node bekommt seine
   eigene Kultur und sein Eingangsbild wird zur Tinte, auf der der Schimmel wächst. */
(function () {
  const TP = window.TP, { def, R: PR, S: PS, C: PC, Bo: PB } = TP.k;

  // Kern erst beim ersten Gebrauch aufbauen, das spart Zeit beim Laden der Seite
  let ENGINE = null;
  function engine() {
    if (ENGINE) return ENGINE;
    let S, paper;
    const drawInk = (ctx, el, s, ox, oy) => { if (el.src) ctx.drawImage(el.src, ox, oy, el.w * s, el.h * s); };
    const measureEl = (el) => { el.w = el.w0; el.h = el.h0; };
    const layout = () => null;
const R=1.6, PAD=90, CELL=4, FOOD=40, K=72, TAU=Math.PI*2, RING=1.2;
const COS=new Float32Array(K), SIN=new Float32Array(K);
for(let i=0;i<K;i++){COS[i]=Math.cos(i/K*TAU);SIN[i]=Math.sin(i/K*TAU)}
let rnd=Math.random;const rr=(a,b)=>a+rnd()*(b-a), irand=(a,b)=>Math.floor(rr(a,b+1));
const pick=a=>a[rnd()*a.length|0], clamp=(v,a,b)=>v<a?a:v>b?b:v, lerp=(a,b,t)=>a+(b-a)*t;
/* ---------- colour ---------- */
const hexMemo=new Map();
function rgb(h){let v=hexMemo.get(h);if(!v){const n=parseInt(h.slice(1),16);v=[n>>16,(n>>8)&255,n&255];hexMemo.set(h,v)}return v}
const toHex=(r,g,b)=>'#'+((1<<24)|((r|0)<<16)|((g|0)<<8)|(b|0)).toString(16).slice(1);
function mix(a,b,t){const A=rgb(a),B=rgb(b);return toHex(lerp(A[0],B[0],t),lerp(A[1],B[1],t),lerp(A[2],B[2],t))}
const shade=(h,t)=>t>=0?mix(h,'#ffffff',t):mix(h,'#000000',-t);

/* Colour sets, sampled from the four reference plates */
const PALS={
  glass:{name:'Glass',skin:['#b08f4e','#a8894a','#bf9c58'],halo:'#9aa68c',c:['#b9a26a','#c9b98a','#a89a63','#8fa08e','#a8a878','#c2ad78'],pale:['#f3efe2','#ece6d3','#e6e6da'],dark:['#6b5a2e','#4a4a2a','#3f4a38']},
  agar:{name:'Agar',c:['#6f9a97','#9ab5ad','#a8a43e','#8a7b62','#1f3fa8','#f07a1a','#e3b25a','#e0567c','#5a9a4a','#55604f'],pale:['#f4eee2','#efe3d6','#dfe9e6','#f0d8d0'],dark:['#2a2a24','#3a2418','#1b2a66','#33402c']},
  chalk:{name:'Chalk',c:['#c6d82b','#a9c41c','#dfe24a','#a876d8','#c39ae6','#2c9db3','#38bba8','#7cc23a'],pale:['#eef08a','#e4cff2','#bfe8df','#f4f4c4'],dark:['#16352e','#1f2f52','#2c3a18','#2a1f45']},
  petri:{name:'Petri',c:['#e56f1c','#c9252c','#e8604c','#ea8aa6','#e9b52b','#2a6ea6','#d9483a','#f29a2e'],pale:['#f3ecdc','#f7d9c4','#e4dccb','#cfd6cf'],dark:['#7a1f1f','#27415e','#6e5a1f','#3a2a22']},
  marble:{name:'Marble',c:['#c9321d','#ef7d24','#c98996','#e7a8a2','#7b8b3a','#1f8f3f','#d14f2f','#9aa84a'],pale:['#f7f1e7','#f1cfc9','#e8e9d2','#dfe3e6'],dark:['#14233f','#2c2f36','#5c2a2a','#20402a']},
  custom:{name:'Custom',c:[],pale:[],dark:[]}
};
function setCustom(a,b,c){const P=PALS.custom;P.src=[a,b,c];P.c=[a,b,c,mix(a,b,.5),mix(b,c,.5)];P.pale=[shade(a,.75),shade(b,.75),shade(c,.75)];P.dark=[shade(a,-.62),shade(b,-.62),shade(c,-.62)]}
setCustom('#ff5a1f','#7a3fd0','#c6d82b');

/* ---------- noise ---------- */
const HT=new Float32Array(65536);for(let i=0;i<65536;i++)HT[i]=rnd();
function vn(x,y){const xi=Math.floor(x),yi=Math.floor(y);let fx=x-xi,fy=y-yi;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);
  const h=(a,b)=>HT[((a&255)<<8|(b&255))];
  return lerp(lerp(h(xi,yi),h(xi+1,yi),fx),lerp(h(xi,yi+1),h(xi+1,yi+1),fx),fy)}

/* ---------- sprites ---------- */
function mk(w,h){const c=document.createElement('canvas');c.width=Math.max(1,Math.ceil(w));c.height=Math.max(1,Math.ceil(h));return c}
const sprites=new Map();
function softSprite(col){const k='s'+col;let s=sprites.get(k);if(s)return s;s=mk(32,32);const x=s.getContext('2d');const A=rgb(col);
  const g=x.createRadialGradient(16,16,0,16,16,16);g.addColorStop(0,`rgba(${A},1)`);g.addColorStop(.5,`rgba(${A},.55)`);g.addColorStop(1,`rgba(${A},0)`);x.fillStyle=g;x.fillRect(0,0,32,32);sprites.set(k,s);return s}
function domeSprite(col,gl){const q=Math.round(gl*2)/2,k='d'+col+q;let s=sprites.get(k);if(s)return s;const n=64;s=mk(n,n);const x=s.getContext('2d');
  // contact shadow, then the shaded ball, then the highlight
  const sg=x.createRadialGradient(n*.52,n*.56,n*.2,n*.52,n*.56,n*.5);sg.addColorStop(0,'rgba(20,12,6,.42)');sg.addColorStop(.75,'rgba(20,12,6,.2)');sg.addColorStop(1,'rgba(20,12,6,0)');x.fillStyle=sg;x.fillRect(0,0,n,n);
  const r=n*.4,cx=n/2,cy=n/2;const g=x.createRadialGradient(cx-r*.34,cy-r*.4,r*.04,cx,cy,r);
  g.addColorStop(0,shade(col,.5));g.addColorStop(.42,col);g.addColorStop(.86,shade(col,-.26));g.addColorStop(1,shade(col,-.46));
  x.fillStyle=g;x.beginPath();x.arc(cx,cy,r,0,TAU);x.fill();
  if(q>0){x.fillStyle=`rgba(255,255,255,${.42*q+.1})`;x.beginPath();x.ellipse(cx-r*.34,cy-r*.42,r*.24,r*.15,-.6,0,TAU);x.fill();
    x.strokeStyle=`rgba(255,255,255,${.22*q})`;x.lineWidth=r*.07;x.beginPath();x.arc(cx,cy,r*.8,.25,1.3);x.stroke()}
  sprites.set(k,s);return s}
const biteSprites=[];
(function(){for(let v=0;v<6;v++){const n=64,s=mk(n,n),x=s.getContext('2d'),id=x.createImageData(n,n),ox=rr(0,200),oy=rr(0,200);
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){const dx=(i-n/2)/(n/2),dy=(j-n/2)/(n/2),d=Math.hypot(dx,dy);
    const w=vn(i*.09+ox,j*.09+oy)*.62+vn(i*.28+ox,j*.28+oy)*.34;const f=d+w*.75-.62;const a=clamp(1-f*14,0,1);id.data[(j*n+i)*4+3]=a*255}
  x.putImageData(id,0,0);biteSprites.push(s)}})();
/* pigment wash blobs with a darker tide line at the rim */
const washMaps=[];
(function(){for(let v=0;v<3;v++){const n=128,a=new Uint8Array(n*n),ox=rr(0,200),oy=rr(0,200);
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){const dx=(i-n/2)/(n/2),dy=(j-n/2)/(n/2),d=Math.hypot(dx,dy);
    const w=vn(i*.045+ox,j*.045+oy)*.5+vn(i*.13+ox,j*.13+oy)*.22;const e=d+w*.62-.42;
    let al=e<0?.55+e*.15:e<.08?.55+e*4.5:e<.24?.9*(1-(e-.08)/.16):0;a[j*n+i]=clamp(al,0,1)*255}
  washMaps.push(a)}})();
function washSprite(col,v){const k='w'+col+v;let s=sprites.get(k);if(s)return s;const n=128;s=mk(n,n);const x=s.getContext('2d'),id=x.createImageData(n,n),A=rgb(col),m=washMaps[v];
  for(let i=0;i<n*n;i++){id.data[i*4]=A[0];id.data[i*4+1]=A[1];id.data[i*4+2]=A[2];id.data[i*4+3]=m[i]}
  x.putImageData(id,0,0);sprites.set(k,s);return s}
function drawSoft(ctx,x,y,r,col,a=1){ctx.globalAlpha=a;ctx.drawImage(softSprite(col),x-r,y-r,r*2,r*2);ctx.globalAlpha=1}
function drawDome(ctx,x,y,r,col,g=.5){const k=r*1.25;ctx.drawImage(domeSprite(col,g),x-k,y-k,k*2,k*2)}

/* ---------- labyrinth for brain-fold colonies (Turing-style difference of blurs) ---------- */
const LAB=(function(){const n=192,sz=n*n;let v=new Float32Array(sz);for(let i=0;i<sz;i++)v[i]=rnd()*2-1;
  const tmp=new Float32Array(sz),a=new Float32Array(sz),b=new Float32Array(sz);
  function blur(src,dst,r){const w=2*r+1;
    for(let y=0;y<n;y++){let s=0;const o=y*n;for(let k=-r;k<=r;k++)s+=src[o+((k+n)%n)];for(let x=0;x<n;x++){tmp[o+x]=s/w;s+=src[o+((x+r+1)%n)]-src[o+((x-r+n)%n)]}}
    for(let x=0;x<n;x++){let s=0;for(let k=-r;k<=r;k++)s+=tmp[((k+n)%n)*n+x];for(let y=0;y<n;y++){dst[y*n+x]=s/w;s+=tmp[((y+r+1)%n)*n+x]-tmp[((y-r+n)%n)*n+x]}}}
  for(let it=0;it<26;it++){blur(v,a,3);blur(a,a,2);blur(v,b,8);blur(b,b,5);for(let i=0;i<sz;i++)v[i]=clamp(v[i]+(a[i]-b[i]>0?.3:-.3),-1,1)}
  blur(v,a,1);blur(a,v,1);return{n,v}})();
const folds=new Map();
function foldTile(base,light,deep){const k=base+light+deep;let s=folds.get(k);if(s)return s;const n=LAB.n,v=LAB.v;s=mk(n,n);const x=s.getContext('2d'),id=x.createImageData(n,n),d=id.data;
  const B=rgb(base),Li=rgb(light),D=rgb(deep);
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){const o=j*n+i,h=v[o];
    const dx=v[j*n+((i+2)%n)]-v[j*n+((i-2+n)%n)],dy=v[((j+2)%n)*n+i]-v[((j-2+n)%n)*n+i];
    const lit=.5-(dx+dy)*.42,t=(h+1)/2;let r,g,bb;
    if(t<.5){const q=t*2;r=lerp(D[0],B[0],q);g=lerp(D[1],B[1],q);bb=lerp(D[2],B[2],q)}else{const q=(t-.5)*2;r=lerp(B[0],Li[0],q);g=lerp(B[1],Li[1],q);bb=lerp(B[2],Li[2],q)}
    const m=.76+.5*clamp(lit,0,1)+(HT[(o*7)&65535]-.5)*.09;d[o*4]=clamp(r*m,0,255);d[o*4+1]=clamp(g*m,0,255);d[o*4+2]=clamp(bb*m,0,255);d[o*4+3]=255}
  x.putImageData(id,0,0);folds.set(k,s);return s}

/* ---------- layers and hosts ---------- */
function makeLayers(W,H,withEdit){
  const L={W:Math.ceil(W),H:Math.ceil(H)};L.gw=Math.ceil(L.W/CELL);L.gh=Math.ceil(L.H/CELL);
  L.mold=mk(L.W,L.H);L.mc=L.mold.getContext('2d');
  L.ink=mk(L.W,L.H);L.ic=L.ink.getContext('2d');
  L.sh=mk(L.W/5,L.H/5);L.sc=L.sh.getContext('2d');
  const n=L.gw*L.gh;L.food=new Uint8Array(n);L.food0=new Uint8Array(n);L.owner=new Uint16Array(n);L.cells=new Uint32Array(0);
  if(withEdit){L.erode=mk(L.W/2,L.H/2);L.ec=L.erode.getContext('2d');L.stain=mk(L.W/2,L.H/2);L.tc=L.stain.getContext('2d')}
  return L}
const cellAt=(L,x,y)=>{const gx=x/CELL|0,gy=y/CELL|0;if(x<0||y<0||gx>=L.gw||gy>=L.gh)return -1;return gy*L.gw+gx};
const foodProbe=mk(1,1);
function buildFood(L){foodProbe.width=L.gw;foodProbe.height=L.gh;const x=foodProbe.getContext('2d',{willReadFrequently:true});x.clearRect(0,0,L.gw,L.gh);x.drawImage(L.ink,0,0,L.gw,L.gh);
  const d=x.getImageData(0,0,L.gw,L.gh).data,n=L.gw*L.gh,list=[];for(let i=0;i<n;i++){const a=d[i*4+3];L.food[i]=a;L.food0[i]=a;if(a>FOOD)list.push(i)}L.cells=Uint32Array.from(list)}
const clampR=(host,v)=>host.forceR||Math.min(v*clamp(.36+host.age/420,.36,1),host.capR);

/* ---------- radial growth front ---------- */
function frontInit(c,maxR,lobes,amp){c.r=new Float32Array(K);c.live=new Uint8Array(K);c.spd=new Float32Array(K);c.off=new Float32Array(K);c.lim=new Float32Array(K);
  const p1=rr(0,TAU),p2=rr(0,TAU),p3=rr(0,TAU),p4=rr(0,TAU),a1=rr(.16,.34),a2=rr(.1,.26);
  for(let i=0;i<K;i++){const th=i/K*TAU;c.r[i]=rr(1,2.4);c.live[i]=1;c.spd[i]=1+.2*Math.sin(2*th+p1)+amp*Math.sin(lobes*th+p2)+.07*Math.sin(23*th+p3);
    c.lim[i]=clamp(.82+a1*Math.sin(irand(2,3)*th+p4)+a2*Math.sin(lobes*th+p1)+.05*Math.sin(17*th+p3),.42,1.25)}
  c.maxR=maxR;c.ra=0;c.avg=2;c.v=rr(1.05,1.55);c.fx=rr(0,200);c.fy=rr(0,200);c.lobeMax=irand(2,6)}
function frontStep(host,c,h,age){const L=host.L,r=c.r,live=c.live,lim=c.lim;let alive=0,sum=0,most=0;
  const decay=(1+2.6*Math.exp(-age/16))/(1+.8*c.avg/c.maxR),clings=!host.isPaper&&!host.thumb&&!c.free,allow=clings?(3+age*.022)*(host.offMul||1):1e9,fx=c.fx||0,fy=c.fy||0;
  for(let i=0;i<K;i++){sum+=r[i];if(!live[i])continue;const x=c.x+COS[i]*r[i],y=c.y+SIN[i]*r[i];
    const idx=cellAt(L,x,y);if(idx<0){live[i]=0;continue}
    const own=L.owner[idx];if(own&&own!==c.id&&!c.over){live[i]=0;continue}
    L.owner[idx]=c.id;const onFood=L.food[idx]>FOOD;
    const nz=vn(x*.021+fx,y*.021+fy)*.66+vn(x*.067+fy,y*.067+fx)*.34,field=clamp(.2+(nz-.28)*3,.16,2);
    let dr=c.v*c.spd[i]*field*(onFood?c.onInk:c.offInk)*decay*h;
    if(onFood)c.off[i]=0;else if(clings){dr*=Math.exp(-c.off[i]/allow);c.off[i]+=dr}
    r[i]+=dr;if(dr>most)most=dr;if(r[i]>=c.maxR*(lim?lim[i]:1))live[i]=0;alive++}
  c.avg=sum/K;if(!alive){c.frontDone=1;return false}
  c.ra+=most;if(c.ra>=RING){c.ra=0;for(let i=0;i<K;i++)if(live[i])r[i]+=.05*((r[(i+K-1)%K]+r[(i+1)%K])/2-r[i]);return true}
  return false}
function ringPath(c,dr=0){const p=new Path2D();for(let i=0;i<K;i++){const j=(i+1)%K;if(c.live[i]!==1&&c.live[j]!==1)continue;const a=Math.max(0,c.r[i]+dr),b=Math.max(0,c.r[j]+dr);
  p.moveTo(c.x+COS[i]*a,c.y+SIN[i]*a);p.lineTo(c.x+COS[j]*b,c.y+SIN[j]*b)}return p}
function lip(m,c,dr,hi=.42,lo=.3,w=1.05){const H=new Path2D(),S=new Path2D();for(let i=0;i<K;i++){const j=(i+1)%K;if(c.live[i]!==1&&c.live[j]!==1)continue;const n=-(COS[i]+SIN[i])*.707;if(Math.abs(n)<.15)continue;
    const a=c.r[i]+dr,b=c.r[j]+dr,p=n>0?H:S;p.moveTo(c.x+COS[i]*a,c.y+SIN[i]*a);p.lineTo(c.x+COS[j]*b,c.y+SIN[j]*b)}
  m.lineWidth=w;m.strokeStyle=`rgba(255,255,255,${hi})`;m.stroke(H);m.strokeStyle=`rgba(0,0,0,${lo})`;m.stroke(S)}
function hairs(m,c,n,fromA,fromB,toA,toB,col,al,lw){m.strokeStyle=col;m.globalAlpha=al;m.lineWidth=lw;m.lineCap='round';m.beginPath();
  for(let q=0;q<n;q++){const i=rnd()*K|0;if(c.live[i]!==1)continue;const a=i/K*TAU+rr(-.4,.4),b=a+rr(-.45,.45),r0=Math.max(0,c.r[i]+rr(fromA,fromB)),r1=c.r[i]+rr(toA,toB);
    m.moveTo(c.x+Math.cos(a)*r0,c.y+Math.sin(a)*r0);m.lineTo(c.x+Math.cos(b)*r1,c.y+Math.sin(b)*r1)}m.stroke();m.globalAlpha=1}
function grains(m,c,n,cols,drA,drB,sA,sB,al=1){m.globalAlpha=al;for(let q=0;q<n;q++){const i=rnd()*K|0;if(c.live[i]!==1)continue;const a=i/K*TAU+rr(-.05,.05),d=Math.max(0,c.r[i]+rr(drA,drB)),s=rr(sA,sB);m.fillStyle=pick(cols);m.fillRect(c.x+Math.cos(a)*d,c.y+Math.sin(a)*d,s,s)}m.globalAlpha=1}
const markDisc=(L,x,y,r,id)=>{const x0=Math.max(0,(x-r)/CELL|0),x1=Math.min(L.gw-1,(x+r)/CELL|0),y0=Math.max(0,(y-r)/CELL|0),y1=Math.min(L.gh-1,(y+r)/CELL|0);
  for(let gy=y0;gy<=y1;gy++)for(let gx=x0;gx<=x1;gx++){const dx=(gx+.5)*CELL-x,dy=(gy+.5)*CELL-y;if(dx*dx+dy*dy<=r*r){const i=gy*L.gw+gx;if(!L.owner[i])L.owner[i]=id}}};

/* ---------- the eight mold types ---------- */
const TYPES={
  /* Ringed button colonies with beaded or grainy zones (petri plate) */
  bullseye:{name:'Bullseye',note:'Ringed button colonies',
    init(host,c,P){const a=pick(P.c);let b=pick(P.c);if(b===a)b=pick(P.c);const pa=pick(P.pale),d=pick(P.dark);
      const T=[[[.5,a,'grain'],[.56,d,'flat'],[.84,b,'bead'],[1,shade(b,.25),'flat']],
        [[.16,d,'flat'],[.62,a,'grain'],[.72,pa,'flat'],[1,b,'bead']],
        [[.82,a,'flat'],[.92,shade(a,.24),'flat'],[1,shade(a,-.24),'flat']],
        [[.3,b,'grain'],[.38,pa,'flat'],[.92,a,'grain'],[1,pa,'hair']],
        [[.22,pa,'flat'],[.5,a,'flat'],[.58,d,'flat'],[.8,b,'grain'],[1,a,'bead']]];
      c.bands=pick(T);frontInit(c,clampR(host,13+108*rnd()**1.9),irand(6,14),rnd()<.45?.17:.05);c.rc=0},
    step(host,c,h,age){const m=host.L.mc;
      if(!c.frontDone&&frontStep(host,c,h,age)){c.rc++;m.lineCap='round';const bn=c.bands,paths=bn.map(()=>null);
        for(let i=0;i<K;i++){const j=(i+1)%K;if(c.live[i]!==1&&c.live[j]!==1)continue;const q=c.r[i]/(c.maxR*c.lim[i]);let b=0;while(b<bn.length-1&&q>bn[b][0])b++;
          const p=paths[b]||(paths[b]=new Path2D());p.moveTo(c.x+COS[i]*c.r[i],c.y+SIN[i]*c.r[i]);p.lineTo(c.x+COS[j]*c.r[j],c.y+SIN[j]*c.r[j])}
        m.lineWidth=3.2;
        paths.forEach((p,b)=>{if(!p)return;const col=bn[b][1],st=bn[b][2];m.strokeStyle=col;m.stroke(p);
          if(st==='grain'){grains(m,c,26,[shade(col,.26),shade(col,-.22),shade(col,.1)],-3.5,1,.9,2.1);hairs(m,c,12,-5,-1,-1,1,shade(col,-.26),.5,.75)}
          if(st==='hair')hairs(m,c,18,-2,1,2,7,shade(col,.3),.6,.7);
          if(st==='bead'&&c.rc%3===0){for(let i=0;i<K;i+=irand(2,4)){if(c.live[i]!==1)continue;drawDome(m,c.x+COS[i]*c.r[i],c.y+SIN[i]*c.r[i],rr(1.7,3.5),col,.5)}}});
        lip(m,c,1.1);hairs(m,c,5,-1,1,1,5,bn[bn.length-1][1],.5,.55)}
      if(age>40&&(c.st=(c.st||0)+h*1.5)>=1&&c.avg>8){c.st=0;const a=rr(0,TAU),d=c.avg*rnd()**.7*.82,col=pick(c.bands)[1];m.fillStyle=shade(col,rnd()<.5?.22:-.28);const s=rr(.9,2.2);m.fillRect(c.x+Math.cos(a)*d,c.y+Math.sin(a)*d,s,s)}}},
  /* Knobbly clusters of shaded beads, sometimes curled like lace (petri, agar) */
  coral:{name:'Coral',note:'Knobbly bead clusters',
    init(host,c,P){const b=pick(P.c);c.lace=rnd()<.28;const pa=pick(P.pale);c.cols=c.lace?[pa,shade(pa,.3),mix(pa,b,.3)]:[b,shade(b,.16),shade(b,-.16),mix(b,pa,.42)];
      c.maxR=clampR(host,14+78*rnd()**1.5);c.front=[[c.x,c.y,rr(2.2,4)]];c.n=0;c.lim=(c.maxR/2.4)**2;c.ba=0;c.rate=rr(9,15);c.avg=2},
    step(host,c,h){if(c.frontDone)return;const L=host.L,m=L.mc;c.ba+=h*c.rate;
      while(c.ba>=1){c.ba--;const fr=c.front,p=fr[rnd()*fr.length|0],a=rnd()<.8?Math.atan2(p[1]-c.y,p[0]-c.x)+rr(-1.25,1.25):rr(0,TAU),ns=clamp(p[2]*rr(.8,1.16),1.9,6.2),d=(p[2]+ns)*.72,nx=p[0]+Math.cos(a)*d,ny=p[1]+Math.sin(a)*d;
        const dist=Math.hypot(nx-c.x,ny-c.y),idx=cellAt(L,nx,ny);c.fl=(c.fl||0)+1;if(c.fl>700||c.n>c.lim){c.frontDone=1;break}
        if(dist>c.maxR*(.72+.28*vn(Math.atan2(ny-c.y,nx-c.x)*2+c.x,c.y))||idx<0)continue;const own=L.owner[idx];if(own&&own!==c.id&&!c.over)continue;if(L.food[idx]<=FOOD&&rnd()<.5)continue;
        L.owner[idx]=c.id;c.n++;c.fl=0;c.avg=Math.max(c.avg,dist);const col=pick(c.cols);
        if(c.lace){m.strokeStyle='rgba(60,30,30,.35)';m.lineWidth=.9;m.beginPath();m.arc(nx+.6,ny+.7,ns*.72,0,TAU);m.stroke();m.strokeStyle=col;m.lineWidth=1.25;m.beginPath();m.arc(nx,ny,ns*.72,rr(0,TAU),rr(4,7)+1);m.stroke()}
        else drawDome(m,nx,ny,ns,col,.5);
        fr.push([nx,ny,ns]);if(fr.length>70)fr.splice(0,1)}}},
  /* Chalky lime, violet and teal crust, pitted with dark craters (chalk plate) */
  crater:{name:'Crater',note:'Chalk crust with pits',
    init(host,c,P){frontInit(c,clampR(host,30+105*rnd()**1.25),irand(5,9),.24);c.nx=rr(0,99);c.ny=rr(0,99);c.pit=0;c.pal2=[pick(P.c),pick(P.c),pick(P.c)];c.pa=pick(P.pale);c.dk=pick(P.dark);c.np=0},
    step(host,c,h,age,P){const m=host.L.mc;
      if(!c.frontDone&&frontStep(host,c,h,age)){m.lineCap='round';const by=new Map();
        for(let i=0;i<K;i++){const j=(i+1)%K;if(c.live[i]!==1&&c.live[j]!==1)continue;const x=c.x+COS[i]*c.r[i],y=c.y+SIN[i]*c.r[i],col=c.pal2[clamp(vn(x*.018+c.nx,y*.018+c.ny)*3.6+rr(-.6,.6)|0,0,2)];
          let p=by.get(col);if(!p){p=new Path2D();by.set(col,p)}p.moveTo(x,y);p.lineTo(c.x+COS[j]*c.r[j],c.y+SIN[j]*c.r[j])}
        m.lineWidth=4.2;by.forEach((p,col)=>{m.strokeStyle=col;m.stroke(p)});
        for(const col of by.keys())grains(m,c,24,[shade(col,.34),shade(col,-.2),shade(col,.16)],-4,1,.9,2.6);grains(m,c,26,c.pal2,-6,1,.9,2.3,.85);
        grains(m,c,16,[c.pa,c.pal2[0]],1,7,.8,1.8,.9);
        if(rnd()<.3){const i=rnd()*K|0;if(c.live[i]===1)drawDome(m,c.x+COS[i]*(c.r[i]-2),c.y+SIN[i]*(c.r[i]-2),rr(1.6,3.2),by.keys().next().value,0)}}
      if(age>16&&c.avg>16&&c.np<(c.maxR/15)**2+1){c.pit+=h*.16;if(c.pit>=1){c.pit=0;c.np++;const a=rr(0,TAU),d=c.avg*rnd()**.6*.88;crater(m,c.x+Math.cos(a)*d,c.y+Math.sin(a)*d,2.5+8*rnd()**1.6,c)}}}},
  /* Convoluted brain folds with a pale felt rim (agar plate) */
  brain:{name:'Brain',note:'Wrinkled folds, pale rim',
    init(host,c,P){const b=pick(P.c),pa=pick(P.pale),d=pick(P.dark);c.b=b;c.li=mix(b,pa,.46);c.de=mix(b,d,.34);c.rim=pa;c.rot=rr(0,360);c.ps=rr(1.05,2.1);frontInit(c,clampR(host,28+105*rnd()**1.2),irand(4,8),.2)},
    step(host,c,h,age){const m=host.L.mc;if(c.frontDone||!frontStep(host,c,h,age))return;m.lineCap='round';
      let pat=PAT.get(c);if(!pat){pat=m.createPattern(foldTile(c.b,c.li,c.de),'repeat');pat.setTransform(new DOMMatrix().rotate(c.rot).scale(c.ps));PAT.set(c,pat)}
      m.lineWidth=5.5;m.strokeStyle=c.rim;m.stroke(ringPath(c,0));hairs(m,c,12,-1,1,2,8,c.rim,.55,.6);
      m.lineWidth=5;m.strokeStyle=pat;m.stroke(ringPath(c,-5.5));lip(m,c,2.2,.25,.2,.9)}},
  /* Radial pleats and ruffles fading from a dark eye to a white feather edge (marble, agar) */
  ruffle:{name:'Ruffle',note:'Radial pleats, feather edge',
    init(host,c,P){const a=pick(P.c),pa=pick(P.pale),d=pick(P.dark);c.grad=[d,mix(d,a,.55),a,a,mix(a,pa,.3),mix(a,pa,.62)];c.rim=pa;c.vel=pick(P.c);frontInit(c,clampR(host,30+100*rnd()**1.25),irand(3,7),.2);c.ph=rr(0,TAU);c.eye=rnd()<.55;c.onInk=1.45;c.offInk=.72},
    step(host,c,h,age){const m=host.L.mc,G=c.grad;
      if(!c.frontDone&&frontStep(host,c,h,age)){m.lineCap='round';const by=new Map();
        for(let i=0;i<K;i++){const j=(i+1)%K;if(c.live[i]!==1&&c.live[j]!==1)continue;const col=G[Math.min(G.length-1,c.r[i]/(c.maxR*c.lim[i])*G.length|0)];let p=by.get(col);if(!p){p=new Path2D();by.set(col,p)}p.moveTo(c.x+COS[i]*c.r[i],c.y+SIN[i]*c.r[i]);p.lineTo(c.x+COS[j]*c.r[j],c.y+SIN[j]*c.r[j])}
        m.lineWidth=3.8;by.forEach((p,col)=>{m.strokeStyle=col;m.stroke(p)});
        const gr=new Path2D(),ri=new Path2D();
        for(let i=0;i<K;i++){if(c.live[i]!==1)continue;if(i%2&&c.r[i]<46)continue;const r1=c.r[i],r0=Math.max(0,r1-2.6),w=Math.sin(r1*.055+c.ph+i*1.7)*.05,a0=i/K*TAU+w,a1=a0+.004,co=Math.cos(a0),si=Math.sin(a0);
          gr.moveTo(c.x+co*r0,c.y+si*r0);gr.lineTo(c.x+Math.cos(a1)*r1,c.y+Math.sin(a1)*r1);const o=TAU/K*.42;ri.moveTo(c.x+Math.cos(a0+o)*r0,c.y+Math.sin(a0+o)*r0);ri.lineTo(c.x+Math.cos(a1+o)*r1,c.y+Math.sin(a1+o)*r1)}
        m.lineCap='butt';m.lineWidth=1.5;m.strokeStyle='rgba(16,8,6,.34)';m.stroke(gr);m.lineWidth=1.15;m.strokeStyle='rgba(255,255,255,.3)';m.stroke(ri);m.lineCap='round';
        hairs(m,c,18,-1,1,2,10,c.rim,.72,.6);m.lineWidth=1.5;m.strokeStyle=c.rim;m.globalAlpha=.72;m.stroke(ringPath(c,1));m.globalAlpha=1}
      if(c.eye&&!c.eyed&&age>26&&c.avg>9){c.eyed=1;const e=Math.min(c.avg*.28,17);m.save();m.translate(c.x,c.y);m.rotate(rr(0,TAU));m.scale(1,.74);drawSoft(m,0,0,e*1.95,c.rim,.96);const g=m.createRadialGradient(-e*.25,-e*.3,0,0,0,e);g.addColorStop(0,'#5a5d63');g.addColorStop(.6,'#23252a');g.addColorStop(1,'#0e0f12');m.fillStyle=g;m.beginPath();m.arc(0,0,e,0,TAU);m.fill();m.restore()}}},
  /* Long-haired fuzz balls, sometimes with a pale core or black pin heads (agar plate) */
  fur:{name:'Fur',note:'Fuzz balls and pin heads',
    init(host,c,P){const b=pick(P.c),pa=pick(P.pale);c.t=[shade(b,-.36),shade(b,-.14),b,mix(b,pa,.55)];c.fr=pa;c.core=rnd()<.42;c.pin=rnd()<.22;c.coreN=0;c.fl=0;frontInit(c,clampR(host,20+92*rnd()**1.4),irand(8,16),.05);c.v=rr(1,1.4)},
    step(host,c,h,age){const m=host.L.mc,T=c.t;
      if(!c.frontDone&&frontStep(host,c,h,age)){m.lineCap='round';const zq=c.avg/c.maxR;m.lineWidth=6;m.strokeStyle=zq<.4?T[0]:zq<.75?T[1]:T[2];m.globalAlpha=.62;m.stroke(ringPath(c,-7));m.globalAlpha=1;if(rnd()<.5){const q=rnd()*K|0,d=c.r[q]*rnd();drawSoft(m,c.x+COS[q]*d,c.y+SIN[q]*d,rr(5,16),pick(T),.3)}
        for(let z=0;z<4;z++)hairs(m,c,36,-22,-2,-3,10,T[z],.62,.8);hairs(m,c,34,-6,1,4,24,T[2],.28,.5);hairs(m,c,34,-3,2,5,27,c.fr,.34,.45)}
      if(c.frontDone&&c.fl<620){c.fl+=h*26;const k=c.avg;m.lineCap='round';m.strokeStyle=rnd()<.4?c.fr:pick(T);m.globalAlpha=.42;m.lineWidth=.6;m.beginPath();for(let z=0;z<6;z++){const a=rr(0,TAU),r0=k*rr(.3,1),r1=r0+rr(4,15),b=a+rr(-.3,.3);m.moveTo(c.x+Math.cos(a)*r0,c.y+Math.sin(a)*r0);m.lineTo(c.x+Math.cos(b)*r1,c.y+Math.sin(b)*r1)}m.stroke();m.globalAlpha=1}
      if(c.core&&age>38&&c.coreN<240&&c.avg>16){c.coreN+=h*22;const k=Math.min(c.avg*.42,40)*Math.min(1,(age-38)/40);m.strokeStyle=c.fr;m.globalAlpha=.55;m.lineWidth=.8;m.lineCap='round';m.beginPath();for(let z=0;z<5;z++){const a=rr(0,TAU),d=k*Math.sqrt(rnd());m.moveTo(c.x+Math.cos(a)*d,c.y+Math.sin(a)*d);const b=a+rr(-1,1);m.lineTo(c.x+Math.cos(a)*d+Math.cos(b)*rr(2,7),c.y+Math.sin(a)*d+Math.sin(b)*rr(2,7))}m.stroke();m.globalAlpha=1}
      if(c.pin&&age>26&&c.avg>10&&(c.pn=(c.pn||0)+h*.9)>=1){c.pn=0;const a=rr(0,TAU),d=c.avg*Math.sqrt(rnd()),x=c.x+Math.cos(a)*d,y=c.y+Math.sin(a)*d,b=rr(0,TAU),l=rr(5,15),hx=x+Math.cos(b)*l,hy=y+Math.sin(b)*l;m.strokeStyle='rgba(235,235,225,.75)';m.lineWidth=.55;m.beginPath();m.moveTo(x,y);m.lineTo(hx,hy);m.stroke();drawDome(m,hx,hy,rr(1,2.2),'#161513',.5)}}},
  /* Glossy domes in cream, white and pink, sold singly or in small families (agar, petri) */
  pearl:{name:'Pearl',note:'Glossy domes and drops',
    init(host,c,P){c.col=rnd()<.68?pick(P.pale):pick(P.c);c.maxS=host.forceR?host.forceR*.7:Math.min(host.capR*.4,2.5+27*rnd()**2.1);c.s=rr(.8,1.4);c.ds=0;c.v=rr(.28,.5);c.avg=1;c.ring=rnd()<.34?mix(c.col,pick(P.c),.7):null},
    step(host,c,h,age){if(c.frontDone)return;const L=host.L,idx=cellAt(L,c.x,c.y),on=idx>=0&&L.food[idx]>FOOD;const dv=c.v*(on?1.25:.8)*(1+2*Math.exp(-age/12))*h;c.s+=dv;c.ds+=dv;c.avg=c.s;
      if(c.ds>=.55){c.ds=0;drawDome(L.mc,c.x,c.y,c.s,c.col,1);markDisc(L,c.x,c.y,c.s,c.id);if(c.ring&&c.s>6)drawSoft(L.mc,c.x+c.s*.05,c.y+c.s*.08,c.s*.5,c.ring,.65)}
      if(c.s>=c.maxS)c.frontDone=1}},
  /* Wet, translucent pools with a bright meniscus, bubbles, or a dark mirror core (marble plate) */
  slick:{name:'Slick',note:'Oily pools and bubbles',
    init(host,c,P){c.mirror=rnd()<.22;c.nx=rr(0,99);c.ny=rr(0,99);c.pal2=[pick(P.c),pick(P.c),pick(P.c)];c.rim=pick(P.pale);c.dk=pick(P.dark);frontInit(c,clampR(host,30+108*rnd()**1.2),irand(3,6),.3);c.bb=0;c.bx=c.x;c.by=c.y;c.onInk=1.3;c.offInk=.8},
    step(host,c,h,age){const m=host.L.mc;
      if(!c.frontDone&&frontStep(host,c,h,age)){m.lineCap='round';
        if(c.mirror){m.lineWidth=7;m.strokeStyle=c.dk;m.globalAlpha=.94;m.stroke(ringPath(c,-4.2));m.globalAlpha=1;if(rnd()<.5){const i=rnd()*K|0;drawSoft(m,c.x+COS[i]*c.r[i]*.6,c.y+SIN[i]*c.r[i]*.6,rr(4,11),'#aeb3ba',.3)}m.lineWidth=3.4;m.strokeStyle=c.rim;m.stroke(ringPath(c,0));m.lineWidth=.9;m.strokeStyle='rgba(30,10,30,.45)';m.stroke(ringPath(c,2.1))}
        else{const by=new Map();for(let i=0;i<K;i++){const j=(i+1)%K;if(c.live[i]!==1&&c.live[j]!==1)continue;const x=c.x+COS[i]*c.r[i],y=c.y+SIN[i]*c.r[i],col=c.pal2[clamp(vn(i*.32+c.nx,c.r[i]*.017+c.ny)*3.6+rr(-.4,.4)|0,0,2)];let p=by.get(col);if(!p){p=new Path2D();by.set(col,p)}p.moveTo(x,y);p.lineTo(c.x+COS[j]*c.r[j],c.y+SIN[j]*c.r[j])}
          m.lineWidth=5.6;m.globalAlpha=.44;by.forEach((p,col)=>{m.strokeStyle=col;m.stroke(p)});m.globalAlpha=1;m.lineWidth=1.05;m.strokeStyle='rgba(255,255,255,.62)';m.stroke(ringPath(c,2.2));m.lineWidth=.9;m.strokeStyle='rgba(20,10,20,.2)';m.stroke(ringPath(c,3.3))}}
      if(age>9&&c.avg>12&&!c.mirror&&(c.bn||0)<70){c.bb+=h*.42;if(c.bb>=1){c.bb=0;c.bn=(c.bn||0)+1;if(rnd()<.14){const q=rnd()*K|0,z=c.r[q]*rnd()*.9;c.bx=c.x+COS[q]*z;c.by=c.y+SIN[q]*z}const a=rr(0,TAU),d=rr(3,16);c.bx=clamp(c.bx+Math.cos(a)*d,c.x-c.avg*.8,c.x+c.avg*.8);c.by=clamp(c.by+Math.sin(a)*d,c.y-c.avg*.8,c.y+c.avg*.8);bubble(m,c.bx,c.by,1.5+11*rnd()**2.4)}}}}
};
const PAT=new WeakMap();
function crater(m,x,y,s,c){const base=pick(c.pal2),pa=mix(base,c.pa,.5);drawSoft(m,x,y,s*2.1,pa,.8);
  m.fillStyle=pa;for(let i=0;i<14;i++){const a=rr(0,TAU),d=s*rr(.9,1.7),z=rr(.8,2.2);m.fillRect(x+Math.cos(a)*d,y+Math.sin(a)*d,z,z)}
  m.lineWidth=s*.26;m.strokeStyle=shade(pa,.22);m.beginPath();m.arc(x,y,s*1.1,2.6,5.4);m.stroke();m.strokeStyle='rgba(0,0,0,.16)';m.beginPath();m.arc(x,y,s*1.14,-.4,2.1);m.stroke();
  const g=m.createRadialGradient(x-s*.2,y-s*.25,0,x,y,s);g.addColorStop(0,shade(c.dk,-.3));g.addColorStop(.65,c.dk);g.addColorStop(1,mix(c.dk,base,.55));m.fillStyle=g;m.beginPath();m.ellipse(x,y,s,s*rr(.78,1),rr(0,3),0,TAU);m.fill();
  m.fillStyle=base;for(let i=0;i<7;i++){const a=rr(0,TAU),d=s*rr(.1,.85);m.fillRect(x+Math.cos(a)*d,y+Math.sin(a)*d,1.2,1.2)}}
function bubble(m,x,y,s){m.fillStyle='rgba(255,255,255,.1)';m.beginPath();m.arc(x,y,s,0,TAU);m.fill();m.lineWidth=Math.max(.6,s*.09);m.strokeStyle='rgba(30,10,10,.34)';m.beginPath();m.arc(x+.5,y+.6,s,0,TAU);m.stroke();m.strokeStyle='rgba(255,255,255,.78)';m.beginPath();m.arc(x,y,s,0,TAU);m.stroke();m.lineWidth=Math.max(.8,s*.18);m.strokeStyle='rgba(255,255,255,.88)';m.beginPath();m.arc(x,y,s*.68,3.5,4.5);m.stroke()}

const rate=()=>{const h=S.hum;return (h<=70?.2+.8*(h-30)/40:1+1.6*(h-70)/30)*(S.fridge?.1:1)};
const pickType=host=>{const a=[...(host.types||S.types)];return a.length?pick(a):'bullseye'};
const pickPal=host=>{const a=[...(host.pals||S.pals)];if(!a.length)return'petri';if(!a.includes(host.mainPal))host.mainPal=pick(a);return rnd()<.72?host.mainPal:pick(a)};
function addColony(host,x,y,o={}){const type=o.type||pickType(host),pk=o.pk||pickPal(host);host.nextId=(host.nextId%65000)+1;
  const c={id:host.nextId,type,pk,x,y,born:host.age,life:rr(280,640),sen:0,sat:rr(0,1),satAt:rr(20,50),bl:rr(0,1),bln:0,over:!!o.over,free:!!o.free,src:o.src||0,onInk:1.6,offInk:host.isPaper?.62:.42,pig:null};
  const P=PALS[pk];TYPES[type].init(host,c,P);if(o.maxR){if(c.maxR)c.maxR=Math.min(c.maxR,o.maxR);if(c.maxS)c.maxS=Math.min(c.maxS,o.maxR*.5)}
  if(o.like){const p=o.like;for(const k of LOBE_KEYS)if(p[k]!==undefined)c[k]=p[k];c.id=p.id;c.gen=(p.gen||0)+1;c.free=p.free;c.over=p.over}
  if(!host.isPaper&&!host.forceR){const room=Math.max(6,Math.min(x,y,host.L.W-x,host.L.H-y)-32);if(c.maxR)c.maxR=Math.min(c.maxR,room/1.25);if(c.maxS)c.maxS=Math.min(c.maxS,room)}c.pig=pick(P.c);host.colonies.push(c);
  const i=cellAt(host.L,x,y);if(i>=0)host.L.owner[i]=c.id;
  if(type!=='pearl'&&type!=='coral')drawDome(host.L.mc,x,y,rr(1.2,2.2),pick(P.pale),.5);
  return c}
function radOf(c){return c.type==='pearl'?c.s:c.avg||4}
function seedOn(host){const L=host.L,n=L.cells.length;if(!n)return false;for(let t=0;t<8;t++){const idx=L.cells[rnd()*n|0];if(L.owner[idx])continue;const gx=idx%L.gw,gy=idx/L.gw|0;addColony(host,(gx+.5)*CELL,(gy+.5)*CELL);return true}return false}

/* Colonies throw daughters from their edge: along the ink first, then out onto the paper. */
function spread(host,c){const rad=radOf(c);if(rad<5)return;const a=rr(0,TAU),d=rad*rr(.95,1.35)+rr(2,20),x=c.x+Math.cos(a)*d,y=c.y+Math.sin(a)*d;
  const inh=rnd()<.62?c.type:null,ph=rnd()<.8?c.pk:null;
  if(!host.isPaper){const L=host.L,idx=cellAt(L,x,y);
    if(idx>=0&&L.food[idx]>FOOD){if(!S.contour&&!L.owner[idx]&&host.colonies.length<colonyCap(host))addColony(host,x,y,{type:inh||undefined,pk:ph||undefined});return}
    if(S.spread&&host.age>(S.contour?60:110)&&rnd()<(S.contour?.22:.06)){const w=elToWorld(host,x,y);paperSeed(w.x,w.y,inh,ph,host,host.id)}
    return}
  const wx=x/R,wy=y/R;if(wx<0||wy<0||wx>S.sheet.w||wy>S.sheet.h)return;
  for(let i=S.els.length-1;i>=0;i--){const el=S.els[i];const lc=worldToEl(el,wx,wy);const idx=cellAt(el.L,lc.x,lc.y);if(idx>=0&&el.L.food[idx]>FOOD){if(S.contour){if(rnd()<.25&&!el.L.owner[idx]&&el.colonies.length<colonyCap(el))addColony(el,lc.x,lc.y,{free:true,maxR:Math.min(el.capR,rr(.14,.42)*el.skinMax+8),pk:ph||undefined});break}if(!el.L.owner[idx]&&el.colonies.length<colonyCap(el))addColony(el,lc.x,lc.y,{type:inh||undefined,pk:ph||undefined});return}}
  paperSeed(wx,wy,inh,ph,host,c.src)}
function paperSeed(wx,wy,type,pk,src,srcId){if(wx<0||wy<0||wx>S.sheet.w||wy>S.sheet.h||paper.colonies.length>=850)return;const x=wx*R,y=wy*R,idx=cellAt(paper.L,x,y);if(idx<0||paper.L.owner[idx])return;
  const o={src:srcId||0};if(type)o.type=type;else if(src&&src.types)o.type=pickType(src);if(pk)o.pk=pk;else if(src&&src.pals)o.pk=pickPal(src);addColony(paper,x,y,o)}
const colonyCap=h=>Math.min(240,10+h.L.cells.length/110);
function bleed(host,c){const P=PALS[c.pk],srcId=host.isPaper?c.src:host.id;let wx,wy;if(host.isPaper){wx=c.x;wy=c.y}else{const w=elToWorld(host,c.x,c.y);wx=w.x*R;wy=w.y*R}
  const rad=(radOf(c)+22)*rr(1.6,3.2),m=paper.L.ic;if(srcId){paper.stains.push(srcId,wx,wy,rad+10);if(paper.stains.length>12000)paper.stains.splice(0,4)}m.globalAlpha=.1;m.save();m.translate(wx+rr(-8,8),wy+rr(-8,8));m.rotate(rr(0,TAU));m.drawImage(washSprite(c.pig||pick(P.c),rnd()*3|0),-rad,-rad,rad*2,rad*2);m.restore();m.globalAlpha=1}
const eraser=(function(){const n=64,c=mk(n,n),x=c.getContext('2d'),g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'#000');g.addColorStop(.82,'#000');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(0,0,n,n);return c})();
/* A block's mold travels with it. Whatever it grew on the paper is wiped when it leaves. */
function vacate(el){if(!paper.L)return;const m=paper.L.mc,ic=paper.L.ic,cs=paper.colonies,keep=[];let hit=false;m.globalCompositeOperation='destination-out';
  for(const c of cs){if(c.src!==el.id){keep.push(c);continue}hit=true;let r=radOf(c);if(c.r)for(let i=0;i<K;i++)if(c.r[i]>r)r=c.r[i];if(c.type==='coral')r=Math.max(r,c.maxR);r=(r+34)*1.05;m.drawImage(eraser,c.x-r,c.y-r,r*2,r*2);release(paper,c)}
  m.globalCompositeOperation='source-over';paper.colonies=keep;
  const st=paper.stains,left=[];ic.globalCompositeOperation='destination-out';for(let i=0;i<st.length;i+=4){if(st[i]===el.id){hit=true;const r=st[i+3];ic.drawImage(eraser,st[i+1]-r,st[i+2]-r,r*2,r*2)}else left.push(st[i],st[i+1],st[i+2],st[i+3])}
  ic.globalCompositeOperation='source-over';paper.stains=left;if(hit)updateShadow(paper.L);el.ax=el.x;el.ay=el.y;el.ar=el.rot}
function maybeVacate(el){if(el.ax===undefined){el.ax=el.x;el.ay=el.y;el.ar=el.rot;return}if(Math.hypot(el.x-el.ax,el.y-el.ay)>8||Math.abs(el.rot-el.ar)>2)vacate(el)}
/* After a reformat, keep only mold on the new letter shapes. */
function pruneToSkin(el,L){const n=L.gw*L.gh,F=el.skinMax*(1-Math.exp(-el.age/300)),a=new Uint8Array(n);for(let p=0;p<L.sk.length&&L.ske[p]<=F;p++)a[L.sk[p]]=1;
  foodProbe.width=L.gw;foodProbe.height=L.gh;const x=foodProbe.getContext('2d',{willReadFrequently:true}),id=x.createImageData(L.gw,L.gh);for(let i=0;i<n;i++)id.data[i*4+3]=a[i]?255:0;x.putImageData(id,0,0);
  L.mc.globalCompositeOperation='destination-in';L.mc.drawImage(foodProbe,0,0,L.W,L.H);L.mc.globalCompositeOperation='source-over';
  el.colonies=el.colonies.filter(c=>{const i=cellAt(L,c.x,c.y);return i>=0&&a[i]});L.owner.fill(0);for(const c of el.colonies)markDisc(L,c.x,c.y,radOf(c),c.id);el.burst=true}
function biteAt(host,x,y,r){const L=host.L,b=pick(biteSprites);if(L.ec){L.ic.globalCompositeOperation='destination-out';L.ic.drawImage(b,x-r,y-r,r*2,r*2);L.ic.globalCompositeOperation='source-over';L.ec.drawImage(b,(x-r)/2,(y-r)/2,r,r);
    const x0=Math.max(0,(x-r)/CELL|0),x1=Math.min(L.gw-1,(x+r)/CELL|0),y0=Math.max(0,(y-r)/CELL|0),y1=Math.min(L.gh-1,(y+r)/CELL|0);for(let gy=y0;gy<=y1;gy++)for(let gx=x0;gx<=x1;gx++)if(rnd()<.6)L.food[gy*L.gw+gx]=0}}
function stainAt(host,x,y,r,col,a){const L=host.L;if(L.tc){L.ic.globalCompositeOperation='source-atop';drawSoft(L.ic,x,y,r,col,a);L.ic.globalCompositeOperation='source-over';drawSoft(L.tc,x/2,y/2,r/2,col,a)}}
/* Old colonies brown, crumble and let go of their ground so a new generation can take it. */
function senesce(host,c,h){c.sen+=h*.55;const L=host.L,m=L.mc,rad=Math.max(5,radOf(c));
  while(c.sen>=1){c.sen--;const a=rr(0,TAU),d=rad*Math.sqrt(rnd()),x=c.x+Math.cos(a)*d,y=c.y+Math.sin(a)*d;
    m.globalCompositeOperation='source-atop';drawSoft(m,x,y,rr(6,24),rnd()<.5?'#2a1a10':'#3f2c14',.16);m.globalCompositeOperation='source-over';
    if(rnd()<.32){const r=rr(4,18),b=pick(biteSprites);m.globalCompositeOperation='destination-out';m.drawImage(b,x-r,y-r,r*2,r*2);m.globalCompositeOperation='source-over'}
    if(!host.isPaper&&rnd()<.5){biteAt(host,x,y,rr(4,17));stainAt(host,x,y,rr(8,26),'#3a2614',.22)}}}
function release(host,c){const L=host.L,r=(c.maxR||radOf(c))+8,x0=Math.max(0,(c.x-r)/CELL|0),x1=Math.min(L.gw-1,(c.x+r)/CELL|0),y0=Math.max(0,(c.y-r)/CELL|0),y1=Math.min(L.gh-1,(c.y+r)/CELL|0);for(let gy=y0;gy<=y1;gy++)for(let gx=x0;gx<=x1;gx++){const i=gy*L.gw+gx;if(L.owner[i]===c.id)L.owner[i]=0}}

function stepHost(host,h){host.age+=h;const L=host.L;
  if(!host.isPaper&&!host.thumb&&S.contour){stepSkin(host,h);const lam=(.012+L.cells.length/230000)*(1+host.age/300);host.sd=(host.sd||0)+h*lam;if(host.sd>=1){host.sd=0;if(host.colonies.length<colonyCap(host))budOn(host)}}
  else if(!host.isPaper&&L.cells.length&&!host.noSeed){const lam=(.01+L.cells.length/170000)*(1+host.age/240);host.sd=(host.sd||0)+h*lam;if(host.sd>=1){host.sd=0;if(host.colonies.length<colonyCap(host))seedOn(host)}}
  const cs=host.colonies;
  for(let i=cs.length-1;i>=0;i--){const c=cs[i],age=host.age-c.born;TYPES[c.type].step(host,c,h,age,PALS[c.pk]);
    if(c.r&&!c.frontDone&&(c.gen||0)<2&&(c.lobes||0)<c.lobeMax&&age>7){c.lb=(c.lb||0)+h*.055;if(c.lb>=1){c.lb=0;const q=rnd()*K|0;if(c.live[q]&&c.r[q]>7){c.lobes=(c.lobes||0)+1;const d=c.r[q]*.92;addColony(host,c.x+COS[q]*d,c.y+SIN[q]*d,{type:c.type,pk:c.pk,like:c,maxR:c.maxR*rr(.32,.72)})}}}
    if(host.thumb)continue;
    if(age>c.satAt){c.sat+=h*(host.isPaper?.0085:.02);if(c.sat>=1){c.sat=0;spread(host,c)}}
    if(S.bleed&&age>10&&c.bln<9){c.bl+=h*.09;if(c.bl>=1){c.bl=0;c.bln++;bleed(host,c)}}
    if(!host.isPaper&&age>70&&rnd()<h*.25){const a=rr(0,TAU),d=radOf(c)*rr(.9,1.25);stainAt(host,c.x+Math.cos(a)*d,c.y+Math.sin(a)*d,rr(5,18),'#4a3218',.13)}
    if(age>c.life){senesce(host,c,h);if(age>c.life*1.9){release(host,c);cs[i]=cs[cs.length-1];cs.pop()}}}}

function simStep(h){S.age+=h;
  if(S.els.length||paper.colonies.length){stepHost(paper,h);
    if(S.paperCol!=='#ffffff'&&rnd()<h*.016){const x=rr(0,paper.L.W),y=rr(0,paper.L.H);drawSoft(paper.L.ic,x,y,rr(5,22),'#a06a2c',.2)}}
  for(const el of S.els)stepHost(el,h)}
/* ---------- contour growth: the colony takes the shape of the letter ----------
   A distance field from the ink edge orders every nearby cell. Each cell is painted several
   times as the front passes, so zones stay concentric: pale felted rim outside, deeper tones
   towards the ink, and a darker body inside the letterform so the word stays readable. */
const LOBE_KEYS=['src','bands','pal2','pa','dk','b','li','de','rim','rot','ps','grad','vel','t','fr','cols','lace','mirror','nx','ny','pig','ph','core','pin'];
const SKIN_LAG=[0,.05,.16,.34,.6];
function buildSkin(el,L,old){const w=L.gw,h=L.gh,n=w*h;foodProbe.width=w;foodProbe.height=h;const x=foodProbe.getContext('2d',{willReadFrequently:true});x.clearRect(0,0,w,h);x.drawImage(L.ink,0,0,w,h);
  const a=x.getImageData(0,0,w,h).data,mask=new Uint8Array(n);let hash=2166136261;for(let i=0;i<n;i++){mask[i]=a[i*4+3]>FOOD?1:0;hash=Math.imul(hash^mask[i],16777619)}
  if(old&&old.skHash===hash&&old.W===L.W&&old.H===L.H&&old.sk){L.sk=old.sk;L.ske=old.ske;L.dist=old.dist;L.skHash=hash;return false}
  L.skHash=hash;const dmax=el.skinMax,arr=new Float32Array(n).fill(1e9),spd=new Float32Array(n),px=el.nzx??(el.nzx=rr(0,99)),py=el.nzy??(el.nzy=rr(0,99)),lf=CELL/Math.max(dmax,16)*.85;
  const speedAt=i=>{let v=spd[i];if(v)return v;const gx=i%w,gy=i/w|0,nz=vn(gx*lf+px,gy*lf+py)*.66+vn(gx*lf*3+py,gy*lf*3+px)*.34;v=clamp(.3+(nz-.25)*2.6,.22,1.7)*rr(.8,1.2);spd[i]=v;return v};
  /* binary heap of cells by arrival time */
  const hk=[],hv=[];const push=(k,v)=>{let i=hk.length;hk.push(k);hv.push(v);while(i>0){const p=(i-1)>>1;if(hk[p]<=k)break;hk[i]=hk[p];hv[i]=hv[p];i=p}hk[i]=k;hv[i]=v};
  const pop=()=>{const v=hv[0],lk=hk.pop(),lv=hv.pop(),m=hk.length;if(m){let i=0;for(;;){let c=2*i+1;if(c>=m)break;if(c+1<m&&hk[c+1]<hk[c])c++;if(hk[c]>=lk)break;hk[i]=hk[c];hv[i]=hv[c];i=c}hk[i]=lk;hv[i]=lv}return v};
  /* the edge of the ink is inoculated unevenly, so growth starts in patches and runs along the outline */
  const pf=lf*.7;for(let gy=0;gy<h;gy++)for(let gx=0;gx<w;gx++){const i=gy*w+gx,m=mask[i];if((gx>0&&mask[i-1]!==m)||(gx<w-1&&mask[i+1]!==m)||(gy>0&&mask[i-w]!==m)||(gy<h-1&&mask[i+w]!==m)){const t=vn(gx*pf+py,gy*pf+px)*dmax*.3;arr[i]=t;push(t,i)}}
  const solid=el.kind!=='text',inFac=solid?1:1.5;if(solid&&dmax>20){const every=Math.max(60,Math.round(9000/(dmax*dmax/16)));for(let i=0;i<n;i++)if(mask[i]&&HT[(i*31+7)&65535]<1/every){const t=rr(.1,.8)*dmax;if(t<arr[i]){arr[i]=t;push(t,i)}}}
  const NB=[[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,1.414],[-1,1,1.414],[1,-1,1.414],[-1,-1,1.414]];
  while(hk.length){const k0=hk[0],c=pop();if(k0>arr[c])continue;const gx=c%w,gy=c/w|0;for(let q=0;q<8;q++){const nx=gx+NB[q][0],ny=gy+NB[q][1];if(nx<0||ny<0||nx>=w||ny>=h)continue;const j=ny*w+nx,t=arr[c]+CELL*NB[q][2]*(mask[j]?inFac:1)/speedAt(j);if(t<=dmax&&t<arr[j]){arr[j]=t;push(t,j)}}}
  const dist=new Float32Array(n),count=new Int32Array(Math.ceil(dmax)+2);let total=0;
  for(let i=0;i<n;i++){const hit=arr[i]<=dmax,v=hit?arr[i]:dmax*1.3;dist[i]=mask[i]?-v:v;if(hit){count[arr[i]|0]++;total++}}
  const order=new Uint32Array(total);{let q=0;for(let i=0;i<n;i++)if(arr[i]<=dmax)order[q++]=i;for(let i=total-1;i>0;i--){const j=rnd()*(i+1)|0,t=order[i];order[i]=order[j];order[j]=t}}
  let acc=0;const start=new Int32Array(count.length);for(let i=0;i<count.length;i++){start[i]=acc;acc+=count[i]}
  const sk=new Uint32Array(total),ske=new Float32Array(total);for(let i=0;i<total;i++){const c=order[i],b=arr[c]|0,p=start[b]++;sk[p]=c;ske[p]=arr[c]}
  L.sk=sk;L.ske=ske;L.dist=dist;el.skp=[0,0,0,0,0];return true}
function skinColours(el){const allowed=el.pals||S.pals;if(el.skinPk&&allowed.has(el.skinPk)&&el.skinT)return el.skinT;const list=[...allowed];el.skinPk=(el.mainPal&&allowed.has(el.mainPal))?el.mainPal:pick(list);const P=PALS[el.skinPk]||PALS.glass;
  const pa=pick(P.pale),dk=pick(P.dark),src=P.skin||P.c,mains=[pick(src),pick(src)];
  el.skinT=mains.map(m=>{const o=P.halo||m;return{out:[pa,mix(pa,o,.22),mix(pa,o,.5),mix(pa,o,.72),mix(o,m,.55)],ins:[mix(pa,m,.5),m,shade(m,-.1),mix(m,dk,.34),mix(m,dk,.68)],pa}});return el.skinT}
const SKIN_W=[3.4,4.1,4.6,4.2,1.7];
function stepSkin(el,h){const L=el.L;if(!S.contour||!L.sk||!L.sk.length||el.thumb)return;const T=skinColours(el),n=L.sk.length,dmax=el.skinMax,F=dmax*(1-Math.exp(-el.age/300)),m=L.mc,w=L.gw,hh=L.gh,dist=L.dist;
  if(!el.skp)el.skp=[0,0,0,0,0];
  for(let k=0;k<5;k++){const D=F-SKIN_LAG[k]*dmax;let p=el.skp[k];if(p>=n||L.ske[p]>D)continue;let budget=el.burst?3500:420;const paths=new Map(),fine=new Path2D(),light=new Path2D(),fuzz=new Path2D();
    while(p<n&&L.ske[p]<=D&&budget-->0){const c=L.sk[p++];if(k===4&&rnd()<.62)continue;const gx=c%w,gy=c/w|0,x=(gx+.5)*CELL+rr(-1.6,1.6),y=(gy+.5)*CELL+rr(-1.6,1.6);
      let dx=(gx+1<w?dist[c+1]:dist[c])-(gx>0?dist[c-1]:dist[c]),dy=(gy+1<hh?dist[c+w]:dist[c])-(gy>0?dist[c-w]:dist[c]);const ln=Math.hypot(dx,dy);if(ln<.01){const a=rr(0,TAU);dx=Math.cos(a);dy=Math.sin(a)}else{dx/=ln;dy/=ln}
      const inside=dist[c]<=0,reg=vn(x*.007+3,y*.007+9)>.5?1:0,base=(inside?T[reg].ins:T[reg].out)[k],sh=rnd()*3|0,key=base+sh;let q=paths.get(key);if(!q){q={p:new Path2D(),col:sh===0?base:shade(base,sh===1?.1:-.1)};paths.set(key,q)}
      const l=rr(2.5,5.5),j=rr(-.3,.3),ca=Math.cos(j),sa=Math.sin(j),ux=dx*ca-dy*sa,uy=dx*sa+dy*ca;q.p.moveTo(x-ux*l,y-uy*l);q.p.lineTo(x+ux*l,y+uy*l);
      if(rnd()<.3){const o=rr(-2,2);fine.moveTo(x-ux*l*1.2+uy*o,y-uy*l*1.2-ux*o);fine.lineTo(x+ux*l*1.2+uy*o,y+uy*l*1.2-ux*o)}
      if(k>=1&&k<=3&&rnd()<(inside?.1:.05)){light.moveTo(x-ux*2,y-uy*2);light.lineTo(x+ux*2,y+uy*2)}
      if(k===0&&!inside&&rnd()<.42){const b=rr(-.45,.45),l2=rr(5,15);fuzz.moveTo(x,y);fuzz.lineTo(x+(dx*Math.cos(b)-dy*Math.sin(b))*l2,y+(dx*Math.sin(b)+dy*Math.cos(b))*l2)}}
    el.skp[k]=p;m.lineCap='round';m.lineWidth=SKIN_W[k];m.globalAlpha=k===4?.62:.96;paths.forEach(q=>{m.strokeStyle=q.col;m.stroke(q.p)});
    m.lineWidth=.7;m.globalAlpha=.34;m.strokeStyle='#2c2214';m.stroke(fine);m.lineWidth=2.1;m.globalAlpha=.8;m.strokeStyle=T[0].pa;m.stroke(light);m.lineWidth=.55;m.globalAlpha=.55;m.stroke(fuzz);m.globalAlpha=1}
  if(el.burst&&el.skp.every((p,k)=>p>=n||L.ske[p]>F-SKIN_LAG[k]*dmax))el.burst=false;
  const reached=el.skp[0];
  if(el.age>420&&reached>10){el.skr=(el.skr||0)+h*Math.min(2.4,(el.age-420)/300+.3);while(el.skr>=1){el.skr--;const c=L.sk[rnd()*reached|0],x=(c%w+.5)*CELL,y=((c/w|0)+.5)*CELL;
      m.globalCompositeOperation='source-atop';drawSoft(m,x,y,rr(6,22),rnd()<.5?'#2a1a10':'#3f2c14',.14);m.globalCompositeOperation='source-over';
      if(rnd()<.26){const r=rr(3,14),b=pick(biteSprites);m.globalCompositeOperation='destination-out';m.drawImage(b,x-r,y-r,r*2,r*2);m.globalCompositeOperation='source-over'}
      if(dist[c]<=0&&rnd()<.5){biteAt(el,x,y,rr(3,13));stainAt(el,x,y,rr(6,20),'#3a2614',.2)}}}}
/* Round colonies bud off the moving edge of the contour, then jump to the paper. */
function budOn(el){const L=el.L,reached=el.skp?el.skp[0]:0;if(reached<12)return;const span=Math.max(8,reached*(el.age>420?1:.22)),c=L.sk[reached-1-(rnd()*rnd()*span|0)],x=(c%L.gw+.5)*CELL+rr(-3,3),y=((c/L.gw|0)+.5)*CELL+rr(-3,3);if(L.owner[c])return;
  const nearRim=L.ske[reached-1]>el.skinMax*.8;
  if(nearRim&&S.spread){const w=elToWorld(el,x,y);paperSeed(w.x,w.y,null,null,el,el.id);return}
  addColony(el,x,y,{free:true,maxR:Math.min(el.capR,rr(.14,.42)*el.skinMax+8)})}

function elToWorld(el,lx,ly){const ux=lx/R-PAD-el.w/2,uy=ly/R-PAD-el.h/2,a=el.rot*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return{x:el.x+el.w/2+ux*c-uy*s,y:el.y+el.h/2+ux*s+uy*c}}
function worldToEl(el,wx,wy){const dx=wx-el.x-el.w/2,dy=wy-el.y-el.h/2,a=-el.rot*Math.PI/180,c=Math.cos(a),s=Math.sin(a);const ux=dx*c-dy*s,uy=dx*s+dy*c;return{x:(ux+el.w/2+PAD)*R,y:(uy+el.h/2+PAD)*R,ux:ux+el.w/2,uy:uy+el.h/2}}
function rebuild(el,s=1,noShift=false){const old=el.L;measureEl(el);if(el.kind==='text'){el.capR=Math.min(PAD*R*.92,9+el.size*R*.5);el.offMul=clamp(.3+el.size/70,.3,1)}
  el.skinMax=el.kind==='text'?Math.min(72,9+el.size*R*.1):Math.min(72,12+Math.min(el.w,el.h)*R*.2);const pr=PAD*R,L=makeLayers((el.w+2*PAD)*R,(el.h+2*PAD)*R,true);let dx=0;
  if(old){if(s===1&&!noShift&&el.kind==='text'){const dw=el.w-old.boxW;if(el.align==='center'){el.x-=dw/2;dx=dw/2*R}else if(el.align==='right'){el.x-=dw;dx=dw*R}}
    const ox=pr-pr*s+dx,oy=pr-pr*s;L.mc.drawImage(old.mold,ox,oy,old.W*s,old.H*s);L.ec.drawImage(old.erode,ox/2,oy/2,old.W*s/2,old.H*s/2);L.tc.drawImage(old.stain,ox/2,oy/2,old.W*s/2,old.H*s/2);
    for(const c of el.colonies){c.x=(c.x-pr)*s+pr+dx;c.y=(c.y-pr)*s+pr;if(c.r){if(s!==1)for(let i=0;i<K;i++)c.r[i]*=s;c.maxR*=s}
      if(c.tips)for(const t of c.tips){t.x=(t.x-pr)*s+pr+dx;t.y=(t.y-pr)*s+pr}
      if(c.front)for(const b of c.front){b[0]=(b[0]-pr)*s+pr+dx;b[1]=(b[1]-pr)*s+pr}
      if(c.trail)for(let i=0;i<c.trail.length;i+=2){c.trail[i]=(c.trail[i]-pr)*s+pr+dx;c.trail[i+1]=(c.trail[i+1]-pr)*s+pr}
      if(s!==1&&c.avg)c.avg*=s;if(s!==1&&c.s)c.s*=s;markDisc(L,c.x,c.y,radOf(c),c.id)}}
  const fresh=(drawInk(L.ic,el,R,pr,pr),buildSkin(el,L,s===1?old:null));
  if(old&&fresh){L.ec.clearRect(0,0,L.W,L.H);L.tc.clearRect(0,0,L.W,L.H);pruneToSkin(el,L);vacate(el)}
  L.ic.globalCompositeOperation='destination-out';L.ic.drawImage(L.erode,0,0,L.W,L.H);L.ic.globalCompositeOperation='source-atop';L.ic.drawImage(L.stain,0,0,L.W,L.H);L.ic.globalCompositeOperation='source-over';
  buildFood(L);L.boxW=el.w;el.L=L;updateShadow(L)}
function updateShadow(L){const sc=L.sc,w=L.sh.width,h=L.sh.height;sc.globalCompositeOperation='source-over';sc.clearRect(0,0,w,h);sc.drawImage(L.mold,0,0,w,h);sc.globalCompositeOperation='source-in';sc.fillStyle='rgba(22,12,6,.5)';sc.fillRect(0,0,w,h);sc.globalCompositeOperation='source-over'}
    const use = (m) => { S = m.S; paper = m.paper; rnd = m.rnd; };
    function create(W, H, seed) {
      const m = {
        W, H, rnd: TP.k.mulberry(seed * 7919 + 13),
        S: { sheet: { w: W, h: H }, paperCol: '#f2efe6', hum: 70, fridge: false, types: new Set(Object.keys(TYPES)), pals: new Set(['glass', 'agar', 'chalk', 'petri', 'marble']), contour: true, spread: true, bleed: true, age: 0, els: [], images: {} },
        paper: { isPaper: true, age: 0, colonies: [], nextId: 1, capR: 150, sd: 0, stains: [] },
      };
      use(m);
      m.paper.L = makeLayers(W * R, H * R, false);
      return m;
    }
    function setInk(m, src) {
      use(m);
      const had = m.S.els[0];
      if (had) { had.src = src; rebuild(had, 1, true); return; }
      const el = { id: 1, kind: 'image', x: 0, y: 0, w0: m.W, h0: m.H, rot: 0, op: 1, types: null, pals: null, age: 0, colonies: [], nextId: 1, capR: PAD * R * 0.92, src };
      rebuild(el);
      m.S.els.push(el);
      if (!m.S.contour) for (let i = 0, n = clamp(2 + el.L.cells.length / 2600 | 0, 2, 8); i < n; i++) seedOn(el);
    }
    function seedPaper(m, n) {
      use(m);
      for (let i = 0; i < n; i++) addColony(m.paper, rr(0.08, 0.92) * m.paper.L.W, rr(0.08, 0.92) * m.paper.L.H);
    }
    // Einstellungen des Nodes setzen; Arten und Farben gelten sofort auch für neue Kolonien
    function configure(m, o) {
      use(m);
      Object.assign(m.S, { hum: o.hum, contour: o.contour, spread: o.spread, bleed: o.bleed, types: new Set(o.types || Object.keys(TYPES)) });
      m.S.pals = new Set(o.pal === 'alle' ? ['glass', 'agar', 'chalk', 'petri', 'marble'] : [o.pal]);
      if (o.pal === 'custom') setCustom(o.c1, o.c2, o.c3);
    }
    const speed = (m) => { use(m); return rate(); };
    function step(m, h) { use(m); simStep(h); }
    function shadows(m) { use(m); updateShadow(m.paper.L); m.S.els.forEach((el) => updateShadow(el.L)); }
    function draw(ctx, w, h, m, moldOnly) {
      const k = w / (m.W * R), P = m.paper.L, pr = PAD * R;
      ctx.save(); ctx.imageSmoothingQuality = 'high'; ctx.scale(k, k);
      if (!moldOnly) ctx.drawImage(P.ink, 0, 0);
      ctx.drawImage(P.sh, 2.5, 3.5, P.W, P.H); ctx.drawImage(P.mold, 0, 0);
      for (const el of m.S.els) {
        const L = el.L;
        if (!moldOnly) ctx.drawImage(L.ink, -pr, -pr);
        ctx.drawImage(L.sh, -pr + 2.5, -pr + 3.5, L.W, L.H); ctx.drawImage(L.mold, -pr, -pr);
      }
      ctx.restore();
    }
    ENGINE = { create, setInk, seedPaper, configure, speed, step, shadows, draw, R };
    return ENGINE;
  }

  // ---------- eine Kultur pro Node ----------
  const CULT = new Map();
  const sigC = document.createElement('canvas'); sigC.width = sigC.height = 40;
  const sigX = sigC.getContext('2d', { willReadFrequently: true });
  function signature(src) {
    sigX.clearRect(0, 0, 40, 40); sigX.drawImage(src, 0, 0, 40, 40);
    return sigX.getImageData(0, 0, 40, 40).data.slice();
  }
  function changed(a, b) {
    if (!a || !b) return true;
    let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
    return d / a.length > 2.5;   // kleine Schwankungen (Korn, Flimmern) lösen keinen Neuaufbau aus
  }
  const copyOf = (src) => { const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0); return c; };

  function runCulture(ctx, w, h, p, env, types) {
    const E = engine(), small = w < 200;
    const detail = small ? 300 : { Entwurf: 600, Normal: 1000, Druck: 1800 }[p.detail] || 1000;
    const W = detail, H = Math.round((detail * h) / w);
    const key = [p.seed, W, H].join('|'), id = env.id + '|' + (types ? types[0] : 'alle') + (small ? '|mini' : '');
    let c = CULT.get(id);
    if (!c || c.key !== key) {
      c = { key, m: E.create(W, H, p.seed), last: env.t, pending: small ? Math.min(p.vorlauf, 60) : p.vorlauf, sig: null, sigAt: -1e9, shadowAt: 0, seeded: false };
      CULT.set(id, c);
    }
    E.configure(c.m, { hum: p.feuchte, contour: p.kontur, spread: p.ausbreiten, bleed: p.pigment, types, pal: p.farben, c1: p.farbe1, c2: p.farbe2, c3: p.farbe3 });
    // Eingang wird zur Tinte; ohne Eingang wächst der Schimmel frei auf dem Papier
    if (env.hasInput) {
      const now = performance.now();
      if (!c.sig || (p.folgen && now - c.sigAt > 2000 && !env.export)) {
        c.sigAt = now;
        const s = signature(ctx.canvas);
        if (changed(s, c.sig)) { c.sig = s; E.setInk(c.m, copyOf(ctx.canvas)); }
      }
    } else if (!c.seeded) { c.seeded = true; E.seedPaper(c.m, 7); }
    // Zeit: läuft mit dem Baukasten (Pause hält sie an), beim Export Bild für Bild weiter
    const dt = env.t - c.last; c.last = env.t;
    if (dt > 0) c.pending += Math.min(dt, env.export ? 1 : 0.5) * p.tempo * E.speed(c.m);
    const budget = env.export ? (small ? 200 : 3000) : 12, t0 = performance.now();
    while (c.pending > 0 && performance.now() - t0 < budget) { const st = Math.min(0.1, c.pending); E.step(c.m, st); c.pending -= st; }
    if (c.pending > 3600) c.pending = 3600;
    const now = performance.now();
    if (env.export || now - c.shadowAt > 500) { c.shadowAt = now; E.shadows(c.m); }
    ctx.clearRect(0, 0, w, h);
    E.draw(ctx, w, h, c.m, p.nurSchimmel);
  }

  const params = (kontur, vorlauf) => [
    PS('farben', 'Farben', ['alle', 'glass', 'agar', 'chalk', 'petri', 'marble', 'custom'], 'alle'),
    PC('farbe1', 'Eigene Farbe 1', '#ff5a1f'), PC('farbe2', 'Eigene Farbe 2', '#7a3fd0'), PC('farbe3', 'Eigene Farbe 3', '#c6d82b'),
    PR('feuchte', 'Feuchte', 30, 100, 70, 1), PR('tempo', 'Tempo', 0, 40, 8, 0.5), PR('vorlauf', 'Vorlauf', 0, 600, vorlauf, 5),
    PB('kontur', 'Wächst an der Kontur', kontur), PB('ausbreiten', 'Breitet sich aus', true), PB('pigment', 'Färbt das Papier', true),
    PB('folgen', 'Eingang nachführen', true), PB('nurSchimmel', 'Nur Schimmel', false),
    PS('detail', 'Detail', ['Entwurf', 'Normal', 'Druck'], 'Normal'), PR('seed', 'Kultur', 1, 999, 7, 1),
  ];
  const node = (id, name, desc, types) => def(id, {
    name, cat: 'pixel', fam: 'organisch', kind: 'fx', field: true, tool: 'Moldaw', desc, params: types ? params(false, 300) : params(true, 120),
    run: (ctx, w, h, p, env) => runCulture(ctx, w, h, p, env, types),
  });
  node('mold', 'Moldaw', 'Schimmel wächst auf dem Eingang, zerfrisst ihn und breitet sich aufs Papier aus. Alle acht Arten.', null);
  [['bullseye', 'Knopf-Schimmel', 'geringte Knopf-Kolonien mit Perlen'], ['coral', 'Korallen-Schimmel', 'knubbelige Perlen-Haufen'],
    ['crater', 'Krater-Schimmel', 'Kalkkruste mit dunklen Kratern'], ['brain', 'Hirn-Schimmel', 'gewundene Falten mit hellem Rand'],
    ['ruffle', 'Rüschen-Schimmel', 'radiale Falten mit Federkante'], ['fur', 'Fell-Schimmel', 'langhaarige Fusselkugeln'],
    ['pearl', 'Perlen-Schimmel', 'glänzende Kuppeln und Tropfen'], ['slick', 'Schlieren-Schimmel', 'ölige Pfützen und Blasen'],
  ].forEach(([t, n, d]) => node('mold_' + t, n, d, [t]));
})();
