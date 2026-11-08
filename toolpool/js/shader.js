/* Tool Pool – Shader-Nodes
   Rechnen jeden Bildpunkt auf der Grafikkarte (WebGL). Alle Shader teilen sich
   ein WebGL-Canvas; das Ergebnis wird danach in das Canvas des Nodes kopiert. */
(function () {
  const TP = window.TP, K = TP.k;
  const { R, S, C, Bo, def, hex } = K;

  let gl = null, glc = null, buf = null, tex = null, failed = false;
  const progs = {};

  function init() {
    if (gl || failed) return gl;
    glc = document.createElement('canvas');
    gl = glc.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true, alpha: true });
    if (!gl) { failed = true; console.warn('WebGL nicht verfügbar – Shader-Nodes lassen das Bild durch'); return null; }
    buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return gl;
  }

  const VS = 'attribute vec2 p;varying vec2 uv;void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
  const HEAD = `precision highp float;
varying vec2 uv;
uniform sampler2D tex;
uniform vec2 res;
uniform float t;
uniform vec2 mouse;
uniform float hasIn;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
vec3 ramp3(float x,vec3 a,vec3 b,vec3 c){x=clamp(x,0.,1.);return x<.5?mix(a,b,x*2.):mix(b,c,x*2.-1.);}
vec4 src(vec2 q){return texture2D(tex,q);}
float aspect(){return res.x/res.y;}
`;

  function compile(type, code) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, code);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }
  function prog(id, fs) {
    if (progs[id]) return progs[id];
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, HEAD + fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return (progs[id] = { p, loc: {}, a: gl.getAttribLocation(p, 'p') });
  }
  function u(pr, name) {
    if (!(name in pr.loc)) pr.loc[name] = gl.getUniformLocation(pr.p, name);
    return pr.loc[name];
  }

  // Shader auf ctx anwenden. uni: { name: Zahl | [x,y] | [r,g,b] | '#hex' }
  TP.shader = function (ctx, w, h, id, fs, uni, env) {
    if (!init()) return false;
    if (glc.width !== w || glc.height !== h) { glc.width = w; glc.height = h; }
    const pr = prog(id, fs);
    gl.viewport(0, 0, w, h);
    gl.useProgram(pr.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(pr.a);
    gl.vertexAttribPointer(pr.a, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, ctx.canvas);
    gl.uniform1i(u(pr, 'tex'), 0);
    gl.uniform2f(u(pr, 'res'), w, h);
    gl.uniform1f(u(pr, 't'), env.t);
    const m = env.mouse || { x: 0.5, y: 0.5 };
    gl.uniform2f(u(pr, 'mouse'), m.x, 1 - m.y);
    gl.uniform1f(u(pr, 'hasIn'), env.hasInput ? 1 : 0);
    for (const k in uni) {
      let v = uni[k];
      if (typeof v === 'string') v = hex(v).map((x) => x / 255);
      const l = u(pr, k);
      if (typeof v === 'number') gl.uniform1f(l, v);
      else if (v.length === 2) gl.uniform2f(l, v[0], v[1]);
      else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2]);
      else gl.uniform4f(l, v[0], v[1], v[2], v[3]);
    }
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(glc, 0, 0);
    return true;
  };

  // Shader-Node definieren: uniforms(p, env) liefert die Werte für den Shader
  function shaderNode(id, o) {
    def(id, Object.assign({ cat: 'shader', tool: 'Shader (WebGL)' }, o, {
      run(ctx, w, h, p, env) {
        TP.shader(ctx, w, h, id, o.fs, o.uniforms(p, env), env);
      },
    }));
  }

  // ---------- Erzeuger ----------
  shaderNode('gl_aura', {
    name: 'Aura (GL)', fam: 'feld', kind: 'gen', desc: 'weiche, leuchtende Farbfelder, die ineinanderfließen',
    params: [C('c1', 'Farbe 1', '#ff2e88'), C('c2', 'Farbe 2', '#6b5bff'), C('c3', 'Farbe 3', '#00e5ff'), C('grund', 'Grund', '#07060c'),
      R('weich', 'Weichheit', 0.1, 1, 0.6), R('tempo', 'Tempo', 0, 2, 0.4)],
    uniforms: (p) => ({ c1: p.c1, c2: p.c2, c3: p.c3, cg: p.grund, weich: p.weich, sp: p.tempo }),
    fs: `uniform vec3 c1,c2,c3,cg;uniform float weich,sp;
void main(){vec2 q=uv;q.x*=aspect();float T=t*sp;vec3 col=cg;
 for(int i=0;i<3;i++){float fi=float(i);
  vec2 c=vec2(.5*aspect()+.35*aspect()*sin(T*.7+fi*2.1),.5+.35*cos(T*.9+fi*1.7));
  float d=length(q-c);float g=exp(-d*d/(.08+.25*weich));
  vec3 k=i==0?c1:(i==1?c2:c3);col=1.-(1.-col)*(1.-k*g);}
 col+=(hash(uv*res+t)-.5)*.04;gl_FragColor=vec4(col,1.);}`,
  });
  shaderNode('gl_marmor', {
    name: 'Marmor (GL)', fam: 'feld', kind: 'gen', desc: 'verwirbeltes Rauschen (Domain Warp), wie gegossene Farbe',
    params: [C('c1', 'Farbe 1', '#1d1a3a'), C('c2', 'Farbe 2', '#5b4bd6'), C('c3', 'Farbe 3', '#f39a6b'),
      R('skala', 'Skala', 0.5, 8, 2.5), R('warp', 'Verwirbelung', 0, 6, 3), R('baender', 'Bänder', 0, 12, 0, 1), R('tempo', 'Tempo', 0, 2, 0.2)],
    uniforms: (p) => ({ c1: p.c1, c2: p.c2, c3: p.c3, sk: p.skala, wp: p.warp, bd: p.baender, sp: p.tempo }),
    fs: `uniform vec3 c1,c2,c3;uniform float sk,wp,bd,sp;
void main(){vec2 q=uv*sk;q.x*=aspect();float T=t*sp;
 vec2 a=vec2(fbm(q+T*.3),fbm(q+vec2(5.2,1.3)-T*.2));
 vec2 b=vec2(fbm(q+wp*a+vec2(1.7,9.2)+T*.15),fbm(q+wp*a+vec2(8.3,2.8)));
 float v=fbm(q+wp*b);v=smoothstep(.15,.85,v);
 if(bd>0.)v=floor(v*bd)/max(bd-1.,1.);
 gl_FragColor=vec4(ramp3(v,c1,c2,c3),1.);}`,
  });
  shaderNode('gl_zellen', {
    name: 'Zellen (GL)', fam: 'organisch', kind: 'gen', desc: 'Voronoi-Zellen mit leuchtenden Kanten',
    params: [R('zellen', 'Zellen', 2, 30, 8), R('kante', 'Kante', 0, 1, 0.3), C('c1', 'Innen', '#1a1533'), C('c2', 'Mitte', '#9b6cff'), C('c3', 'Kante', '#f3f1fb'),
      R('tempo', 'Tempo', 0, 2, 0.3)],
    uniforms: (p) => ({ n: p.zellen, ke: p.kante, c1: p.c1, c2: p.c2, c3: p.c3, sp: p.tempo }),
    fs: `uniform float n,ke,sp;uniform vec3 c1,c2,c3;
vec2 h2(vec2 p){return vec2(hash(p),hash(p+19.19));}
void main(){vec2 q=uv*n;q.x*=aspect();vec2 i=floor(q),f=fract(q);float d1=9.,d2=9.;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(float(x),float(y));
  vec2 o=.5+.45*sin(t*sp+6.2831*h2(i+g));float d=length(g+o-f);
  if(d<d1){d2=d1;d1=d;}else if(d<d2)d2=d;}
 float e=d2-d1;float k=1.-smoothstep(0.,.05+ke*.3,e);
 vec3 col=mix(c1,c2,smoothstep(0.,1.,d1));col=mix(col,c3,k);gl_FragColor=vec4(col,1.);}`,
  });
  shaderNode('gl_moire', {
    name: 'Moiré (GL)', fam: 'opart', kind: 'gen', desc: 'zwei Ringfelder überlagern sich zu Interferenzmustern',
    params: [R('freq', 'Frequenz', 10, 300, 90), R('abstand', 'Abstand', 0, 0.6, 0.15), C('c1', 'Farbe 1', '#151515'), C('c2', 'Farbe 2', '#f4f1ec'),
      Bo('weich', 'Weich', false), R('tempo', 'Tempo', 0, 2, 0.3)],
    uniforms: (p) => ({ f: p.freq, ab: p.abstand, c1: p.c1, c2: p.c2, so: p.weich ? 1 : 0, sp: p.tempo }),
    fs: `uniform float f,ab,so,sp;uniform vec3 c1,c2;
void main(){vec2 q=uv;q.x*=aspect();vec2 m=vec2(.5*aspect(),.5);float T=t*sp;
 vec2 a=m+vec2(cos(T),sin(T*1.3))*ab,b=m-vec2(cos(T*.8),sin(T))*ab;
 float v=sin(length(q-a)*f)*sin(length(q-b)*f);
 float k=so>.5?v*.5+.5:step(0.,v);gl_FragColor=vec4(mix(c1,c2,k),1.);}`,
  });

  // ---------- Effekte (verändern den Eingang) ----------
  shaderNode('gl_brechung', {
    name: 'Brechung (GL)', fam: 'raum', kind: 'fx', desc: 'Licht bricht wie durch geriffeltes Glas',
    params: [R('staerke', 'Stärke', 0, 0.2, 0.04), R('skala', 'Skala', 1, 30, 8), S('form', 'Glas', ['wellig', 'riffel', 'linse'], 'wellig'),
      R('farbsaum', 'Farbsaum', 0, 1, 0.3), R('tempo', 'Tempo', 0, 2, 0.3)],
    uniforms: (p) => ({ st: p.staerke, sk: p.skala, fo: ['wellig', 'riffel', 'linse'].indexOf(p.form), cs: p.farbsaum, sp: p.tempo }),
    fs: `uniform float st,sk,fo,cs,sp;
void main(){vec2 q=uv*sk;q.x*=aspect();vec2 n;
 if(fo<.5){float e=.01;float a=fbm(q+t*sp);n=vec2(fbm(q+vec2(e,0.)+t*sp)-a,fbm(q+vec2(0.,e)+t*sp)-a)/e*.1;}
 else if(fo<1.5){n=vec2(sin(q.x*3.1416+t*sp*3.),0.);}
 else{vec2 c=fract(q)-.5;n=c*2.;}
 vec2 o=n*st;float r=src(uv+o*(1.+cs)).r,g=src(uv+o).g,b=src(uv+o*(1.-cs)).b;float a=src(uv+o).a;
 gl_FragColor=vec4(r,g,b,a);}`,
  });
  shaderNode('gl_chroma', {
    name: 'Farbsaum (GL)', fam: 'farbe', kind: 'fx', desc: 'chromatische Aberration – RGB laufen auseinander',
    params: [R('staerke', 'Stärke', 0, 0.06, 0.012), S('modus', 'Richtung', ['radial', 'horizontal'], 'radial'), Bo('maus', 'Um die Maus', false)],
    uniforms: (p) => ({ st: p.staerke, mo: p.modus === 'radial' ? 0 : 1, um: p.maus ? 1 : 0 }),
    fs: `uniform float st,mo,um;
void main(){vec2 c=um>.5?mouse:vec2(.5);vec2 d=mo<.5?(uv-c):vec2(1.,0.);
 vec4 g=src(uv);float r=src(uv+d*st).r,b=src(uv-d*st).b;
 float a=max(g.a,max(src(uv+d*st).a,src(uv-d*st).a));gl_FragColor=vec4(r,g.g,b,a);}`,
  });
  shaderNode('gl_glow', {
    name: 'Glühen (GL)', fam: 'farbe', kind: 'fx', desc: 'helle Stellen strahlen weich aus (Bloom)',
    params: [R('radius', 'Radius', 1, 40, 12), R('staerke', 'Stärke', 0, 3, 1.2), R('schwelle', 'Schwelle', 0, 1, 0.5), C('farbe', 'Tönung', '#ffffff')],
    uniforms: (p, env) => ({ rad: p.radius * env.s, st: p.staerke, th: p.schwelle, tint: p.farbe }),
    fs: `uniform float rad,st,th;uniform vec3 tint;
void main(){vec4 c=src(uv);vec3 acc=vec3(0.);float wsum=0.;float aa=0.;
 for(int i=0;i<24;i++){float fi=float(i);float a=fi*2.39996;float r=sqrt((fi+.5)/24.)*rad;
  vec2 o=vec2(cos(a),sin(a))*r/res;vec4 s=src(uv+o);float l=dot(s.rgb,vec3(.299,.587,.114));
  float k=smoothstep(th,1.,l)*s.a;acc+=s.rgb*k;aa+=k;wsum+=1.;}
 vec3 gl=acc/wsum*st*tint;gl_FragColor=vec4(c.rgb*c.a+gl,max(c.a,clamp(aa/wsum*st,0.,1.)));}`,
  });
  shaderNode('gl_crt', {
    name: 'Röhre (GL)', fam: 'glitch', kind: 'fx', desc: 'Röhrenbildschirm: Wölbung, Zeilen, Flimmern',
    params: [R('kruemmung', 'Wölbung', 0, 0.5, 0.15), R('zeilen', 'Zeilen', 50, 600, 240, 1), R('flimmern', 'Flimmern', 0, 1, 0.3), R('vignette', 'Vignette', 0, 1, 0.5)],
    uniforms: (p) => ({ k: p.kruemmung, zl: p.zeilen, fl: p.flimmern, vg: p.vignette }),
    fs: `uniform float k,zl,fl,vg;
void main(){vec2 c=uv-.5;c*=1.+k*dot(c,c)*2.;vec2 q=c+.5;
 if(q.x<0.||q.x>1.||q.y<0.||q.y>1.){gl_FragColor=vec4(0.,0.,0.,1.);return;}
 vec4 s=src(q);vec3 col=mix(vec3(0.),s.rgb,s.a);
 col*=.75+.25*sin(q.y*zl*3.1416);
 float m=mod(gl_FragCoord.x,3.);col*=vec3(m<1.?1.1:.9,m>=1.&&m<2.?1.1:.9,m>=2.?1.1:.9);
 col*=1.-fl*.15*hash(vec2(floor(t*30.),q.y*10.));
 col*=1.-vg*smoothstep(.2,.8,length(c));gl_FragColor=vec4(col,1.);}`,
  });
  shaderNode('gl_fluessig', {
    name: 'Flüssig (GL)', fam: 'raum', kind: 'fx', desc: 'das Bild fließt wie in Wasser',
    params: [R('staerke', 'Stärke', 0, 0.3, 0.06), R('skala', 'Skala', 0.5, 10, 3), R('tempo', 'Tempo', 0, 2, 0.4)],
    uniforms: (p) => ({ st: p.staerke, sk: p.skala, sp: p.tempo }),
    fs: `uniform float st,sk,sp;
void main(){vec2 q=uv*sk;q.x*=aspect();float T=t*sp;
 vec2 o=vec2(fbm(q+vec2(T,0.)),fbm(q+vec2(3.1,T)))-.5;gl_FragColor=src(uv+o*st*2.);}`,
  });
  shaderNode('gl_thermo', {
    name: 'Wärmebild (GL)', fam: 'farbe', kind: 'fx', desc: 'Helligkeit wird zur Wärmekamera-Farbskala',
    params: [R('stufen', 'Stufen', 0, 16, 6, 1), C('c1', 'Kalt', '#120a3a'), C('c2', 'Warm', '#ff3d00'), C('c3', 'Heiß', '#fff27a'), Bo('umkehren', 'Umkehren', false)],
    uniforms: (p) => ({ st: p.stufen, c1: p.c1, c2: p.c2, c3: p.c3, iv: p.umkehren ? 1 : 0 }),
    fs: `uniform float st,iv;uniform vec3 c1,c2,c3;
void main(){vec4 s=src(uv);float l=dot(s.rgb,vec3(.299,.587,.114));if(iv>.5)l=1.-l;
 if(st>0.)l=floor(l*st)/max(st-1.,1.);gl_FragColor=vec4(ramp3(l,c1,c2,c3),s.a);}`,
  });
  shaderNode('gl_wasser', {
    name: 'Wasser-Maus (GL)', fam: 'raum', kind: 'fx', desc: 'Wellenringe breiten sich um die Maus aus',
    params: [R('staerke', 'Stärke', 0, 0.08, 0.02), R('wellen', 'Wellen', 5, 80, 30), R('tempo', 'Tempo', 0, 6, 3), R('weite', 'Reichweite', 0.1, 1.5, 0.5)],
    uniforms: (p) => ({ st: p.staerke, wv: p.wellen, sp: p.tempo, rw: p.weite }),
    fs: `uniform float st,wv,sp,rw;
void main(){vec2 d=uv-mouse;d.x*=aspect();float r=length(d);
 float a=sin(r*wv-t*sp)*st*exp(-r/rw*2.);vec2 o=normalize(d+1e-5)*a;o.x/=aspect();gl_FragColor=src(uv+o);}`,
  });
})();
