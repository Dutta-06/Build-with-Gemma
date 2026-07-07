import './style.css';
import { supabase } from './supabase.js';

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GammaCorrectionShader } from 'three/examples/jsm/shaders/GammaCorrectionShader.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';

/* ── Config ─────────────────────────────────────────────── */
const CONFIG = {
  bgColor:       '#0a0a24',
  flameColor:    '#aee9ff',
  flameColor2:   '#c79bff',
  flameAmt:      0.2,
  colorA:        '#aef6cf',
  colorB:        '#5fe6a0',
  colorC:        '#eafff2',
  opacity:       2,
  pointSize:     50,
  brightness:    1.85,
  drift:         2.35,
  twinkle:       1,
  spin:          0.03,
  repelRadius:   5,
  repelStrength: 0.35,
  scrollPush:    8,
  scrollDrift:   6,
  scrollSpin:    0.1,
  parallax:      0.6,
};

/* ── Helpers ────────────────────────────────────────────── */
function hexToVec3(hex){
  const n=parseInt(hex.slice(1),16);
  return new THREE.Vector3(((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255);
}

/* ── Layers ─────────────────────────────────────────────── */
const LAYERS={NONE:0,TORUS_SCENE:1,BLOOM_SCENE:2,ENTIRE_SCENE:3};

/* ── Renderer ───────────────────────────────────────────── */
const canvas=document.getElementById('scene');
const renderer=new THREE.WebGL1Renderer({canvas,antialias:true});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(innerWidth,innerHeight,false);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.VSMShadowMap;

/* ── Scene / Fog / Camera ───────────────────────────────── */
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x000000);
scene.fog=new THREE.Fog(0x000000,0,15);

const camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,0.1,80);
camera.position.set(0,0,5);
camera.layers.enable(LAYERS.TORUS_SCENE);
camera.layers.enable(LAYERS.BLOOM_SCENE);
camera.layers.enable(LAYERS.ENTIRE_SCENE);
scene.add(camera);

/* ── Geometry ───────────────────────────────────────────── */
const count=4200, depth=30;
const positions=new Float32Array(count*3);
const palette=new Float32Array(count);
const bright=new Float32Array(count);
const scales=new Float32Array(count);
const phases=new Float32Array(count);

for(let i=0;i<count;i++){
  const i3=i*3;
  positions[i3]  =(Math.random()-0.5)*24;
  positions[i3+1]=(Math.random()-0.5)*16;
  positions[i3+2]=(Math.random()-0.5)*30;
  palette[i]=Math.floor(Math.random()*3);
  bright[i]=0.7+Math.random()*0.6;
  scales[i]=0.5+Math.pow(Math.random(),1.4)*2.5;
  phases[i]=Math.random();
}

const geo=new THREE.BufferGeometry();
geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
geo.setAttribute('aScale',  new THREE.Float32BufferAttribute(scales,1));
geo.setAttribute('aPhase',  new THREE.Float32BufferAttribute(phases,1));
geo.setAttribute('aPalette',new THREE.Float32BufferAttribute(palette,1));
geo.setAttribute('aBright', new THREE.Float32BufferAttribute(bright,1));

/* ── Material ───────────────────────────────────────────── */
const mat=new THREE.ShaderMaterial({
  transparent:true,
  depthWrite:false,
  blending:THREE.AdditiveBlending,
  uniforms:{
    uTime:         {value:0},
    uSize:         {value:CONFIG.pointSize},
    uOpacity:      {value:0},
    uDrift:        {value:0},
    uDepth:        {value:depth},
    uTwinkle:      {value:CONFIG.twinkle},
    uCursor:       {value:new THREE.Vector3()},
    uRepelRadius:  {value:CONFIG.repelRadius},
    uRepelStrength:{value:CONFIG.repelStrength},
    uActivity:     {value:0},
    uColorA:       {value:hexToVec3(CONFIG.colorA)},
    uColorB:       {value:hexToVec3(CONFIG.colorB)},
    uColorC:       {value:hexToVec3(CONFIG.colorC)},
    uBrightness:   {value:CONFIG.brightness},
  },
  vertexShader:`
uniform float uTime; uniform float uSize; uniform float uDrift; uniform float uDepth; uniform float uTwinkle;
uniform vec3 uCursor; uniform float uRepelRadius; uniform float uRepelStrength; uniform float uActivity;
uniform vec3 uColorA; uniform vec3 uColorB; uniform vec3 uColorC;
attribute float aScale; attribute float aPhase; attribute float aPalette; attribute float aBright;
varying vec3 vColor; varying float vTwinkle;
void main() {
  vec3 pos = position;
  pos.z = mod(pos.z + uDrift + (uDepth * 0.5), uDepth) - (uDepth * 0.5);

  float tw = sin(uTime * 1.6 + aPhase * 6.2831);
  vTwinkle = (1.0 - uTwinkle) + uTwinkle * (0.55 + 0.45 * tw);

  vec4 modelPosition = modelMatrix * vec4(pos, 1.0);

  vec3 toParticle = modelPosition.xyz - uCursor;
  float dist = length(toParticle);
  float falloff = smoothstep(uRepelRadius, 0.0, dist);
  modelPosition.xyz += normalize(toParticle + vec3(0.0001)) * falloff * uRepelStrength * uActivity;

  vec4 viewPosition = viewMatrix * modelPosition;
  gl_Position = projectionMatrix * viewPosition;
  gl_PointSize = uSize * aScale;
  gl_PointSize *= (1.0 / -viewPosition.z);

  vec3 base = aPalette < 0.5 ? uColorA : (aPalette < 1.5 ? uColorB : uColorC);
  vColor = base * aBright;
}`,
  fragmentShader:`
uniform float uOpacity; uniform float uBrightness;
varying vec3 vColor; varying float vTwinkle;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;
  float strength = pow(1.0 - d * 2.0, 4.0);
  vec3 color = mix(vec3(0.0), vColor, strength);
  gl_FragColor = vec4(color * uBrightness, strength * uOpacity * vTwinkle);
}`
});

const points=new THREE.Points(geo,mat);
points.layers.set(LAYERS.ENTIRE_SCENE);
const group=new THREE.Group();
group.add(points);
scene.add(group);

/* ── FinalPass Shader ───────────────────────────────────── */
const FinalPass={
  uniforms:{
    iTime:       {value:0},
    tDiffuse:    {value:null},
    torusTexture:{value:null},
    bloomTexture:{value:null},
    haloTexture: {value:null},
    uBg:         {value:hexToVec3(CONFIG.bgColor)},
    uFlameA:     {value:hexToVec3(CONFIG.flameColor)},
    uFlameB:     {value:hexToVec3(CONFIG.flameColor2)},
    uFlameAmt:   {value:CONFIG.flameAmt},
  },
  vertexShader:`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }`,
  fragmentShader:`
uniform float iTime; uniform sampler2D tDiffuse; uniform sampler2D bloomTexture; uniform sampler2D torusTexture; uniform sampler2D haloTexture;
uniform vec3 uBg; uniform vec3 uFlameA; uniform vec3 uFlameB; uniform float uFlameAmt;
varying vec2 vUv;
vec3 warp3d(vec3 pos, float t){ float curv=.8,a=1.9,b=0.7; pos*=2.;
  pos.x+=curv*sin(t+a*pos.y)+t*b; pos.y+=curv*cos(t+a*pos.x);
  pos.y+=curv*sin(t+a*pos.z)+t*b; pos.z+=curv*cos(t+a*pos.y);
  pos.z+=curv*sin(t+a*pos.x)+t*b; pos.x+=curv*cos(t+a*pos.z);
  return 0.5+0.5*cos(pos.xyz+vec3(1,2,4)); }
void main(){
  vec2 uv = 2.*vUv - 1.;
  vec3 w = pow(warp3d(vec3(uv.x, sin(uv.y), uv.y), iTime*1.5), vec3(1.5));
  vec3 flame = 1.5*uFlameA*w.x; flame*=w.y; flame += uFlameB*w.z;
  flame *= smoothstep(0.25, 1., abs(uv.y));
  float md = smoothstep(-0.7, 1., -uv.y*uv.x); flame *= md*md;
  vec3 bg = uBg * (1.0 - 0.4 * length(uv));
  vec3 halo = texture2D(haloTexture, vUv).xyz;
  gl_FragColor = vec4(bg + flame*uFlameAmt + texture2D(bloomTexture, vUv).xyz + texture2D(torusTexture, vUv).xyz + texture2D(tDiffuse, vUv).xyz + halo, 1.);
}`
};

/* ── Postprocessing ─────────────────────────────────────── */
const renderScene=new RenderPass(scene,camera);
const res=new THREE.Vector2(innerWidth,innerHeight);

// Torus composer
const torusComposer=new EffectComposer(renderer);
torusComposer.renderToScreen=false;
torusComposer.addPass(renderScene);
torusComposer.addPass(new ShaderPass(GammaCorrectionShader));
torusComposer.addPass(new UnrealBloomPass(res.clone(),0.22,0.2,0));
torusComposer.addPass(new ShaderPass(CopyShader));

// Bloom composer
const bloomComposer=new EffectComposer(renderer);
bloomComposer.renderToScreen=false;
bloomComposer.addPass(renderScene);
bloomComposer.addPass(new UnrealBloomPass(res.clone(),0.4,0.55,0));
bloomComposer.addPass(new ShaderPass(GammaCorrectionShader));

// Final composer
const finalComposer=new EffectComposer(renderer);
const finalPass=new ShaderPass(FinalPass);
finalComposer.addPass(renderScene);
finalComposer.addPass(finalPass);

finalPass.uniforms.bloomTexture.value=bloomComposer.renderTarget1.texture;
finalPass.uniforms.torusTexture.value=torusComposer.renderTarget1.texture;

// haloTexture needs a valid texture — use a 1x1 black DataTexture as placeholder
const haloData=new Uint8Array([0,0,0,255]);
const haloTex=new THREE.DataTexture(haloData,1,1,THREE.RGBAFormat);
haloTex.needsUpdate=true;
finalPass.uniforms.haloTexture.value=haloTex;

/* ── Pointer tracking ───────────────────────────────────── */
const POINTER={
  ndc:new THREE.Vector2(0,0),
  world:new THREE.Vector3(0,0,0),
  active:false,
  lastMove:performance.now(),
  activity:0,
};
const mouseSmooth={x:0,y:0};

window.addEventListener('mousemove',e=>{
  POINTER.ndc.x=e.clientX/innerWidth*2-1;
  POINTER.ndc.y=-(e.clientY/innerHeight*2-1);
  POINTER.active=true;
  POINTER.lastMove=performance.now();
});
window.addEventListener('mouseout',()=>{POINTER.active=false});

function updatePointer(){
  let target=new THREE.Vector3(0,0,0);
  if(POINTER.active){
    const ndc3=new THREE.Vector3(POINTER.ndc.x,POINTER.ndc.y,0.5);
    ndc3.unproject(camera);
    const dir=ndc3.sub(camera.position).normalize();
    if(Math.abs(dir.z)>1e-4){
      const t=-camera.position.z/dir.z;
      if(t>0&&isFinite(t)){
        target=new THREE.Vector3().copy(camera.position).add(dir.multiplyScalar(t));
      }
    }
  }
  POINTER.world.lerp(target,0.12);

  const idleSec=(performance.now()-POINTER.lastMove)/1000;
  const want=(POINTER.active&&idleSec<3)?1:0;
  POINTER.activity+=(want-POINTER.activity)*0.06;

  mat.uniforms.uCursor.value.copy(POINTER.world);
  mat.uniforms.uActivity.value=POINTER.activity;
}

/* ── Scroll tracking (double-damped) ────────────────────── */
let scrollTarget=0, scrollSmooth=0, scrollCurrent=0;
function recomputeScroll(){
  const max=document.documentElement.scrollHeight-innerHeight;
  scrollTarget=max>0?Math.max(0,Math.min(window.scrollY/max,1)):0;
}
window.addEventListener('scroll',recomputeScroll,{passive:true});
recomputeScroll();

/* ── Animation ──────────────────────────────────────────── */
const appearStart=performance.now();
let t0=performance.now()/1000;

function animate(){
  requestAnimationFrame(animate);
  const now=performance.now();
  const t=now/1000;
  const dt=Math.min(0.05,t-t0);
  t0=t;

  // Scroll lerps
  scrollSmooth+=(scrollTarget-scrollSmooth)*0.10;
  scrollCurrent+=(scrollSmooth-scrollCurrent)*0.06;
  const scroll=scrollCurrent;

  // Mouse smooth
  mouseSmooth.x+=(POINTER.ndc.x-mouseSmooth.x)*0.06;
  mouseSmooth.y+=(POINTER.ndc.y-mouseSmooth.y)*0.06;
  const mx=mouseSmooth.x, my=mouseSmooth.y;

  updatePointer();

  // Uniforms
  mat.uniforms.uTime.value=t;
  mat.uniforms.uDrift.value+=dt*(CONFIG.drift+scroll*CONFIG.scrollDrift);

  // Camera
  camera.position.set(mx*CONFIG.parallax, my*CONFIG.parallax, 5-scroll*CONFIG.scrollPush);
  camera.lookAt(mx*CONFIG.parallax, my*CONFIG.parallax, -10);

  // Appear fade
  const elapsed=now-appearStart;
  const fade=Math.max(0,Math.min((elapsed-300)/1400,1));
  mat.uniforms.uOpacity.value=fade*CONFIG.opacity;

  // Barrel roll
  group.rotation.z+=dt*(CONFIG.spin+scroll*CONFIG.scrollSpin);

  // Final pass time
  finalPass.uniforms.iTime.value=t;

  // Render three composers with layer switching
  camera.layers.set(LAYERS.TORUS_SCENE);
  torusComposer.render();

  camera.layers.set(LAYERS.BLOOM_SCENE);
  bloomComposer.render();

  camera.layers.set(LAYERS.ENTIRE_SCENE);
  finalComposer.render();
}

/* ── Resize ─────────────────────────────────────────────── */
function onResize(){
  const w=innerWidth, h=innerHeight;
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(w,h,false);
  camera.aspect=w/h;
  camera.updateProjectionMatrix();
  torusComposer.setPixelRatio(window.devicePixelRatio);
  torusComposer.setSize(w,h);
  bloomComposer.setPixelRatio(window.devicePixelRatio);
  bloomComposer.setSize(w,h);
  finalComposer.setPixelRatio(window.devicePixelRatio);
  finalComposer.setSize(w,h);
  recomputeScroll();
}
window.addEventListener('resize',onResize);

animate();

/* ── DOM & GSAP Logic ───────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);

    // --- Scene 1: Intro Fade Out ---
    gsap.to('.intro-content', {
      scrollTrigger: {
        trigger: '#scene-intro',
        start: 'top top',
        end: 'bottom top',
        scrub: true
      },
      opacity: 0,
      y: -50
    });

    // --- Scene 2: The Details ---
    gsap.to('.oath-line', {
      scrollTrigger: {
        trigger: '#scene-oath',
        start: 'top 80%', 
        toggleActions: 'play none none reverse'
      },
      opacity: 1,
      y: 0,
      duration: 1,
      ease: "power2.out"
    });

    // --- Scene 4: Registration Reveal ---
    gsap.to('.register-reveal', {
      scrollTrigger: {
        trigger: '#register',
        start: 'top 80%', 
        toggleActions: 'play none none reverse'
      },
      opacity: 1,
      y: 0,
      duration: 0.8,
      ease: "power2.out"
    });

  }

  const form = document.getElementById('registration-form');
  const formMessage = document.getElementById('form-message');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());
      const resumeFile = formData.get('resume');
      
      if (!data.teamName || !data.yourName || !data.email || !data.prizeAgreement || !resumeFile) {
        return;
      }

      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'Submitting...';
      submitBtn.style.opacity = '0.7';
      submitBtn.disabled = true;
      formMessage.className = 'form-message';
      formMessage.textContent = 'Uploading resume...';
      formMessage.style.display = 'block';

      try {
        // 1. Upload Resume
        const fileExt = resumeFile.name.split('.').pop();
        const fileName = `${data.teamName.replace(/\s+/g, '-')}-${Date.now()}.${fileExt}`;
        
        const { data: uploadData, error: uploadError } = await supabase
          .storage
          .from('resumes')
          .upload(fileName, resumeFile);

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase
          .storage
          .from('resumes')
          .getPublicUrl(fileName);

        // 2. Save Registration Data
        const { error: dbError } = await supabase
          .from('registrations')
          .insert([
            {
              team_name: data.teamName,
              your_name: data.yourName,
              phone: data.phone,
              email: data.email,
              college: data.college,
              roll_no: data.rollNo,
              physical_appearance: data.physicalAppearance === 'yes',
              resume_url: publicUrl
            }
          ]);

        if (dbError) throw dbError;

        formMessage.textContent = 'Registration received! We will contact you soon.';
        formMessage.className = 'form-message success';
        form.reset();

      } catch (error) {
        console.error('Error submitting form:', error);
        formMessage.textContent = 'An error occurred. Please try again.';
        formMessage.style.color = '#ef4444';
      } finally {
        submitBtn.textContent = originalText;
        submitBtn.style.opacity = '1';
        submitBtn.disabled = false;
      }
    });
  }

  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // --- Edge Scrolling Logic ---
  let edgeScrollSpeed = 0;
  let edgeScrollRAF = null;
  const edgeThreshold = 100; // pixels from edge to trigger scroll
  const maxEdgeScrollSpeed = 15; // pixels per frame

  function edgeScrollLoop() {
    if (edgeScrollSpeed !== 0) {
      window.scrollBy(0, edgeScrollSpeed);
    }
    edgeScrollRAF = requestAnimationFrame(edgeScrollLoop);
  }

  document.addEventListener('mousemove', (e) => {
    const mouseY = e.clientY;
    const windowHeight = window.innerHeight;

    if (mouseY < edgeThreshold) {
      // Top edge
      const ratio = 1 - (mouseY / edgeThreshold);
      edgeScrollSpeed = -(ratio * maxEdgeScrollSpeed);
    } else if (mouseY > windowHeight - edgeThreshold) {
      // Bottom edge
      const ratio = 1 - ((windowHeight - mouseY) / edgeThreshold);
      edgeScrollSpeed = (ratio * maxEdgeScrollSpeed);
    } else {
      edgeScrollSpeed = 0;
    }
  });

  document.addEventListener('mouseleave', () => {
    edgeScrollSpeed = 0;
  });

  // Start the scroll loop
  edgeScrollLoop();

});
