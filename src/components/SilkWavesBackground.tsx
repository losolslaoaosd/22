import { useEffect, useRef } from 'react'

// Original silk-style background for BLUFIN+, independent of the paid React Bits registry.
const vertexSource = `attribute vec2 position; void main(){gl_Position=vec4(position,0.,1.);}`
const fragmentSource = `
precision mediump float;
uniform vec2 resolution;
uniform float time;
void main() {
  vec2 uv=gl_FragCoord.xy/resolution;
  vec2 p=(uv-.5)*vec2(resolution.x/resolution.y,1.);
  float t=time*.085;
  p=mat2(.92,-.39,.39,.92)*p;
  float bend=sin(p.x*2.6+t)*.18+sin(p.x*4.2-t*.7)*.075;
  float warp=p.y+bend+sin(p.y*2.+p.x*1.6+t)*.1;
  float folds=sin(warp*10.+sin(p.x*2.8-t)*1.4);
  float sheen=pow(max(0.,folds),7.);
  float broad=pow(max(0.,folds),2.);
  float fine=pow(max(0.,sin(warp*20.+sin(p.x*2.8-t)*2.8)),18.);
  float envelope=exp(-pow((p.y+bend)*1.12,2.));
  vec3 base=vec3(.043,.047,.06);
  vec3 blue=vec3(.06,.18,.40);
  vec3 silver=vec3(.39,.48,.64);
  float tint=smoothstep(-.6,.7,p.x+sin(t)*.2);
  vec3 color=base+mix(blue,silver,tint)*(broad*.17+sheen*.42+fine*.06)*envelope;
  color*=.88+.12*sin(uv.x*3.14159);
  gl_FragColor=vec4(color,1.);
}`

export default function SilkWavesBackground({ paused }: { paused: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const pausedRef = useRef(paused)
  useEffect(() => { pausedRef.current = paused }, [paused])
  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const gl = element.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'low-power' })
    if (!gl) return // The CSS silk gradients remain visible without WebGL.
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)
      if (!shader) return null
      gl.shaderSource(shader, source); gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); return null }
      return shader
    }
    const vertex = compile(gl.VERTEX_SHADER, vertexSource), fragment = compile(gl.FRAGMENT_SHADER, fragmentSource)
    if (!vertex || !fragment) { if (vertex) gl.deleteShader(vertex); if (fragment) gl.deleteShader(fragment); return }
    const program = gl.createProgram()
    if (!program) { gl.deleteShader(vertex); gl.deleteShader(fragment); return }
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment); return }
    gl.useProgram(program)
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW)
    const position = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    const resolution = gl.getUniformLocation(program, 'resolution'), time = gl.getUniformLocation(program, 'time')
    let frame = 0, elapsed = 8, previous = 0, lastDraw = 0, visible = true, contextLost = false
    const draw = () => {
      if (contextLost) return
      gl.viewport(0, 0, element.width, element.height)
      gl.uniform2f(resolution, element.width, element.height); gl.uniform1f(time, elapsed)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }
    const resize = () => {
      const rect = element.getBoundingClientRect(), ratio = Math.min(devicePixelRatio || 1, 1.25)
      element.width = Math.max(1, Math.round(rect.width * ratio)); element.height = Math.max(1, Math.round(rect.height * ratio)); draw()
    }
    const loop = (now: number) => {
      const delta = previous ? Math.min((now - previous) / 1000, .05) : 0
      previous = now
      if (!pausedRef.current && visible && !document.hidden && !contextLost) {
        elapsed += delta
        if (now - lastDraw >= 33) { draw(); lastDraw = now }
      }
      frame = requestAnimationFrame(loop)
    }
    const lost = (event: Event) => { event.preventDefault(); contextLost = true; element.style.opacity = '0' }
    element.addEventListener('webglcontextlost', lost)
    const sizes = new ResizeObserver(resize); sizes.observe(element)
    const visibility = new IntersectionObserver(entries => { visible = entries[0].isIntersecting })
    visibility.observe(element); resize(); frame = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(frame); sizes.disconnect(); visibility.disconnect(); element.removeEventListener('webglcontextlost', lost)
      gl.deleteBuffer(buffer); gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment)
    }
  }, [])
  return <div className="silk-waves-background" aria-hidden="true"><canvas ref={canvas} className="silk-waves-canvas" /></div>
}
