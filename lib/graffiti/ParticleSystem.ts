import * as THREE from 'three';
import { random } from './PaletteEngine';
export function createParticles(seed: number) {
  const rng = random(seed),
    count = 2200,
    positions = new Float32Array(count * 3),
    phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = rng() * 2 - 1;
    positions[i * 3 + 1] = rng() * 2 - 1;
    positions[i * 3 + 2] = 0;
    phases[i] = rng();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uAmount: { value: 0.5 },
      uDrawing: { value: 0 },
      uColor: { value: new THREE.Color('#d5ff38') },
    },
    vertexShader: `attribute float aPhase; varying float vAlpha; uniform float uTime; uniform float uAmount; uniform float uDrawing; void main(){vec3 p=position;p.x+=sin(uTime*.15+aPhase*40.)*.012;p.y=mod(p.y+uTime*.007*(.3+aPhase)+1.,2.)-1.;gl_Position=vec4(p,1.);gl_PointSize=(1.+aPhase*2.)*(1.+uDrawing);vAlpha=step(aPhase, uAmount)*(.10+uDrawing*.35);}`,
    fragmentShader: `varying float vAlpha; uniform vec3 uColor; void main(){float a=1.-smoothstep(.05,.5,length(gl_PointCoord-.5));gl_FragColor=vec4(uColor,a*vAlpha);}`,
  });
  return new THREE.Points(geometry, material);
}
