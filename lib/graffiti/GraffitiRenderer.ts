import * as THREE from 'three';
import type { Snapshot } from '../types';
import { generateGraffiti } from './GraffitiGenerator';
import { animationAt } from './AnimationDirector';
import { createParticles } from './ParticleSystem';

const fragment = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uArt,uDetailArt; uniform float uTime,uDraw,uDetail,uTransition,uMode,uIntensity,uDrips,uHero,uSpeed; uniform vec3 uColor; uniform vec4 uCal;
uniform vec4 uRuns[50]; uniform float uRunCount;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
void main(){
 vec2 uv=(vUv-.5-uCal.yz)/uCal.x; float ca=cos(uCal.w),sa=sin(uCal.w);uv=mat2(ca,-sa,sa,ca)*uv+.5;
 vec2 original=uv; float t=uTransition;
 if(uMode==4.)uv.x+=t*1.3;
 if(uMode==2.)uv.y+=t*t*(.5+noise(vec2(uv.x*35.,0.))*1.1);
 if(uMode==5.)uv.x+=(noise(vec2(floor(uv.y*28.),floor(uTime*12.)))-.5)*t*.6;
 vec4 art=texture2D(uArt,uv);art*=step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.);
 float grain=noise(vUv*vec2(1800.,1000.));vec3 wall=vec3(.020,.024,.023)+grain*.014;
 wall+=noise(vUv*8.)*.012; wall*=.65+.35*(1.-length(vUv-.5));
 float path=uv.x*.83+sin(uv.y*18.+uv.x*4.)*.025+noise(uv*60.)*.035;
 float reveal=smoothstep(path-.02,path+.02,uDraw*1.03-.08);
 if(uDraw>=.999)reveal=1.;
 float mist=exp(-abs(path-(uDraw*1.03-.08))*65.)*(1.-step(.999,uDraw))*step(.001,uDraw);
 vec3 paint=art.rgb;
 float wet=pow(max(0.,sin(uv.x*22.+uv.y*7.+uTime*.18)),26.)*.035*uHero;
 paint+=wet;
 float alpha=art.a*reveal;
 for(int i=0;i<50;i++){if(float(i)>=uRunCount)break;vec4 r=uRuns[i];float growth=r.z*(.2+.8*(1.-exp(-max(0.,uTime-float(i)*.3)*.018*uSpeed)))*uDrips;
 float line=(1.-smoothstep(r.w,r.w*2.,abs(uv.x-r.x)))*step(uv.y,r.y)*step(r.y-growth,uv.y)*uDetail;
 paint=mix(paint,uColor,line);alpha=max(alpha,line);}
 vec3 color=mix(wall,paint,alpha);color+=uColor*mist*.10*uIntensity;
 vec4 detail=texture2D(uDetailArt,uv);float detailReveal=smoothstep(noise(uv*8.)-.04,noise(uv*8.)+.04,uDetail);color=mix(color,detail.rgb,detail.a*detailReveal*step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.));
 if(t>0.){
   if(uMode==0.){float roller=floor(original.y*7.);float edge=fract(roller*.618)*.14+noise(original*vec2(900.,200.))*.012;float cover=step(original.x+edge,t*1.18);color=mix(color,wall+noise(vec2(original.x*450.,original.y*30.))*.025,cover);}
   if(uMode==1.){float dissolve=smoothstep(t-.035,t+.035,hash(floor(original*vec2(1100.,700.))));color=mix(wall,color,dissolve);color+=uColor*.08*step(abs(hash(floor(original*700.))-t),.012);}
   if(uMode==2.)color=mix(color,wall,smoothstep(.65,1.,t));
   if(uMode==3.){float coverage=noise(original*35.)*.45+length(original-vec2(.5))*.5;float cover=smoothstep(coverage-.08,coverage+.08,t*1.05);color=mix(color,wall,cover);}
   if(uMode==5.)color=mix(color,wall,step(hash(vec2(floor(original.y*45.),floor(uTime*9.))),t));
 }
 gl_FragColor=vec4(color,1.);
}`;

export class GraffitiRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private material: THREE.ShaderMaterial;
  private plane: THREE.Mesh;
  private particles: ReturnType<typeof createParticles>;
  private texture: THREE.CanvasTexture | null = null;
  private detailTexture: THREE.CanvasTexture | null = null;
  private id = '';
  private aspect = 16 / 9;
  private sizeKey = '';
  private origin = performance.now();
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uArt: { value: null },
        uDetailArt: { value: null },
        uTime: { value: 0 },
        uDraw: { value: 0 },
        uDetail: { value: 0 },
        uTransition: { value: 0 },
        uMode: { value: 0 },
        uIntensity: { value: 1 },
        uDrips: { value: 1 },
        uHero: { value: 0 },
        uSpeed: { value: 1 },
        uColor: { value: new THREE.Color() },
        uCal: { value: new THREE.Vector4(1, 0, 0, 0) },
        uRuns: { value: Array.from({ length: 50 }, () => new THREE.Vector4()) },
        uRunCount: { value: 0 },
      },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position,1.);}',
      fragmentShader: fragment,
    });
    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.scene.add(this.plane);
    this.particles = createParticles(42);
    this.scene.add(this.particles);
  }
  resize(width: number, height: number) {
    const key = `${width}:${height}`;
    if (key === this.sizeKey) return;
    this.sizeKey = key;
    this.aspect = width / height;
    this.renderer.setSize(width, height, false);
    this.id = '';
  }
  render(s: Snapshot, now: number) {
    if (!s.current || s.blackout) {
      this.renderer.setClearColor(0x000000);
      this.renderer.clear();
      return;
    }
    if (this.id !== s.current.id) {
      const art = generateGraffiti(s.current, this.aspect);
      this.texture?.dispose();
      this.texture = new THREE.CanvasTexture(art.canvas);
      this.texture.colorSpace = THREE.NoColorSpace;
      this.detailTexture?.dispose();
      this.detailTexture = new THREE.CanvasTexture(art.detailCanvas);
      this.material.uniforms.uArt.value = this.texture;
      this.material.uniforms.uDetailArt.value = this.detailTexture;
      this.material.uniforms.uColor.value.set(art.colors[0]);
      this.material.uniforms.uRunCount.value = art.drips.length;
      art.drips.forEach((d, i) =>
        this.material.uniforms.uRuns.value[i].set(d.x, d.y, d.length, d.width),
      );
      this.id = s.current.id;
      this.origin = performance.now();
    }
    const a = animationAt(s, now),
      u = this.material.uniforms,
      cal = s.settings.calibration;
    // The lifecycle playhead freezes on HOLD; the physical paint clock continues.
    u.uTime.value = (performance.now() - this.origin) / 1000;
    u.uDraw.value = a.draw;
    u.uDetail.value = a.detail;
    u.uTransition.value = a.transition;
    u.uMode.value = ['BUFF', 'DISSOLVE', 'MELT', 'OVERSPRAY', 'WALL SHIFT', 'GLITCH'].indexOf(
      s.current.transition,
    );
    u.uIntensity.value = s.current.settings.intensity;
    u.uDrips.value = s.settings.drips / 100;
    u.uHero.value = s.phase === 'HERO' ? 1 : 0;
    u.uSpeed.value = s.settings.speed;
    u.uCal.value.set(cal.scale, cal.x, cal.y, (cal.rotation * Math.PI) / 180);
    this.particles.material.uniforms.uTime.value = u.uTime.value * s.settings.speed;
    this.particles.material.uniforms.uAmount.value =
      (s.settings.particles / 100) * (1 - a.transition);
    this.particles.material.uniforms.uDrawing.value = s.phase === 'DRAWING' ? 1 : 0;
    this.particles.material.uniforms.uColor.value.copy(u.uColor.value);
    this.renderer.render(this.scene, this.camera);
  }
  gpu() {
    const gl = this.renderer.getContext(),
      ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  }
  dispose() {
    this.texture?.dispose();
    this.detailTexture?.dispose();
    this.material.dispose();
    this.plane.geometry.dispose();
    this.particles.geometry.dispose();
    this.particles.material.dispose();
    this.renderer.dispose();
  }
}
