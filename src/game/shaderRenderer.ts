import type { GameSettings } from '../core/types';

const vertexSource = `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const fragmentSource = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform float uTime;
uniform float uProgress;
uniform vec2 uOrigin;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  vec2 uv = vUv;
  float distanceFromOrigin = distance(uv, uOrigin);
  float wave = uProgress * 1.45;
  float edgeNoise = noise(uv * 11.0 + uTime * 0.22) * 0.18;
  float edge = 1.0 - smoothstep(wave - 0.08, wave + 0.03, distanceFromOrigin + edgeNoise);
  float ring = smoothstep(0.035, 0.0, abs(distanceFromOrigin + edgeNoise * 0.3 - wave));
  vec3 clean = mix(vec3(0.20, 0.96, 0.75), vec3(1.0, 0.78, 0.30), uv.y);
  float fade = sin(uProgress * 3.1415926);
  outColor = vec4(clean * (edge * 0.28 + ring * 1.8), (edge * 0.20 + ring * 0.85) * fade);
}`;

export class ShaderRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private startTime = 0;
  private duration = 0;
  private origin = { x: .5, y: .5 };
  private settings: GameSettings;
  private onContextMessage: (message: string | null) => void;
  active = false;

  constructor(readonly canvas: HTMLCanvasElement, settings: GameSettings, onContextMessage: (message: string | null) => void) {
    this.settings = settings;
    this.onContextMessage = onContextMessage;
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
    if (settings.quality === 'high') this.initialize();
  }

  setSettings(settings: GameSettings): void {
    this.settings = settings;
    if (settings.quality === 'high' && !this.gl) this.initialize();
    if (settings.quality === 'low') this.canvas.hidden = true;
  }

  trigger(originX = .5, originY = .55, duration = 1.8): void {
    this.origin = { x: originX, y: 1 - originY };
    this.startTime = performance.now();
    this.duration = this.settings.reducedMotion ? Math.min(.55, duration) : duration;
    this.active = true;
    this.canvas.hidden = false;
  }

  render(now: number): void {
    if (!this.active) return;
    const progress = Math.min(1, (now - this.startTime) / (this.duration * 1000));
    if (this.settings.quality === 'low' || !this.gl || !this.program || !this.vao) {
      const edge = Math.round(8 + progress * 72);
      const inner = Math.max(0, edge - 9);
      const outer = Math.min(100, edge + 9);
      this.canvas.style.background = `radial-gradient(circle at ${this.origin.x * 100}% ${(1 - this.origin.y) * 100}%, transparent 0 ${inner}%, rgba(104,255,212,.35) ${edge}%, rgba(255,221,113,.62) ${Math.min(100, edge + 2)}%, transparent ${outer}%)`;
      this.canvas.style.opacity = String(Math.sin(progress * Math.PI));
    } else {
      const gl = this.gl;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(this.program);
      gl.bindVertexArray(this.vao);
      gl.uniform1f(gl.getUniformLocation(this.program, 'uTime'), now / 1000);
      gl.uniform1f(gl.getUniformLocation(this.program, 'uProgress'), progress);
      gl.uniform2f(gl.getUniformLocation(this.program, 'uOrigin'), this.origin.x, this.origin.y);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    if (progress >= 1) { this.active = false; this.canvas.hidden = true; this.canvas.style.background = ''; this.canvas.style.opacity = ''; }
  }

  resize(width: number, height: number): void {
    this.canvas.width = width; this.canvas.height = height;
  }

  dispose(): void {
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    if (this.gl) {
      if (this.vao) this.gl.deleteVertexArray(this.vao);
      if (this.program) this.gl.deleteProgram(this.program);
    }
    this.gl = null; this.program = null; this.vao = null;
  }

  private initialize(): void {
    const gl = this.canvas.getContext('webgl2', { alpha: true, antialias: false, premultipliedAlpha: true });
    if (!gl) return;
    const vertex = this.compile(gl, gl.VERTEX_SHADER, vertexSource);
    const fragment = this.compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
    if (!vertex || !fragment) return;
    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); return; }
    const vao = gl.createVertexArray(); const buffer = gl.createBuffer();
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    const location = gl.getAttribLocation(program, 'aPosition'); gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.gl = gl; this.program = program; this.vao = vao;
  }

  private compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
    const shader = gl.createShader(type); if (!shader) return null;
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); return null; }
    return shader;
  }

  private onLost = (event: Event): void => { event.preventDefault(); this.gl = null; this.program = null; this.vao = null; this.onContextMessage('光影渲染暂时中断，游戏已安全暂停特效。正在尝试恢复…'); };
  private onRestored = (): void => { this.initialize(); this.onContextMessage(null); this.trigger(.5, .5, .8); };
}
