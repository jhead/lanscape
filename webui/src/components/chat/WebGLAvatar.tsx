import { useRef, useEffect, useMemo } from 'react'
import './WebGLAvatar.css'

interface WebGLAvatarProps {
  userId: string
  size?: number
  className?: string
}

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash = hash & hash
  }
  return Math.abs(hash)
}

function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

// Lava lamp themes: background + blob edge + blob center
const THEMES = [
  { bg: '#2a2438', edge: '#e8b4bc', center: '#c47a84' }, // Dusty rose on purple
  { bg: '#1e2a2a', edge: '#88c4c4', center: '#5a9898' }, // Teal on dark teal
  { bg: '#2a2420', edge: '#d4a574', center: '#a67c4c' }, // Amber on brown
  { bg: '#1a2430', edge: '#a4b4d4', center: '#6880a8' }, // Periwinkle on navy
  { bg: '#282428', edge: '#c4a4c8', center: '#906898' }, // Lavender on plum
  { bg: '#242a24', edge: '#a4c8a4', center: '#689868' }, // Sage on forest
  { bg: '#2a2828', edge: '#c8b8a8', center: '#988878' }, // Taupe on charcoal
  { bg: '#201a28', edge: '#b898c8', center: '#8060a0' }, // Orchid on grape
]

interface AvatarParams {
  theme: typeof THEMES[0]
  seed: number
  speed: number
  numBlobs: number
}

function generateParams(userId: string): AvatarParams {
  const hash = hashString(userId)
  const rng = seededRandom(hash)
  
  return {
    theme: THEMES[Math.floor(rng() * THEMES.length)],
    seed: rng() * 100,
    speed: 0.15 + rng() * 0.1,
    numBlobs: 6 + Math.floor(rng() * 4), // 6-9 blobs
  }
}

const vertexShader = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`

const fragmentShader = `
  precision highp float;
  
  varying vec2 v_uv;
  uniform float u_time;
  uniform float u_seed;
  uniform vec3 u_bgColor;
  uniform vec3 u_edgeColor;
  uniform vec3 u_centerColor;
  uniform int u_numBlobs;
  
  // Deterministic random based on index
  float rand(int i) {
    return sin(float(i) * 1.64 + u_seed * 0.1) * 0.5 + 0.5;
  }
  
  // Get blob position and size at time t
  vec3 getBlob(int i, float time) {
    float spd = 0.25;
    float moveRange = 0.35;
    
    // Base position offset from center
    vec2 center = vec2(0.5) + 0.15 * vec2(rand(i) - 0.5, rand(i + 42) - 0.5);
    
    // Animated movement
    float t1 = time * spd * (0.5 + rand(i + 2));
    float t2 = time * spd * (0.4 + rand(i + 7));
    center.x += sin(t1) * moveRange * (rand(i + 56) - 0.3);
    center.y += cos(t2) * moveRange * (rand(i * 9) - 0.3);
    
    // Blob radius
    float radius = 0.06 + 0.06 * rand(i + 3);
    
    return vec3(center, radius);
  }
  
  void main() {
    vec2 uv = v_uv;
    
    // Map to circle (centered at 0.5, 0.5)
    vec2 centered = uv - 0.5;
    float distFromCenter = length(centered);
    
    // Discard outside circle
    if (distFromCenter > 0.5) discard;
    
    // Calculate metaball field
    float distSum = 0.0;
    
    for (int i = 0; i < 12; i++) {
      if (i >= u_numBlobs) break;
      
      vec3 blob = getBlob(i, u_time);
      vec2 blobCenter = blob.xy;
      float radius = blob.z;
      
      float d = length(blobCenter - uv) + radius * 0.3;
      d = max(d, 0.001);
      
      // Sharp falloff: 1/d^4
      float tmp = d * d;
      distSum += 1.0 / (tmp * tmp);
    }
    
    // Threshold for blob edge
    float thresh = 8000.0;
    
    // Background by default
    vec3 color = u_bgColor;
    float alpha = 1.0;
    
    if (distSum > thresh) {
      // Inside a blob - gradient from edge to center
      float t = smoothstep(thresh, thresh * 4.0, distSum);
      color = mix(u_edgeColor, u_centerColor, t);
    }
    
    // Soft edge on outer circle
    alpha = 1.0 - smoothstep(0.47, 0.5, distFromCenter);
    
    gl_FragColor = vec4(color, alpha);
  }
`

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return [r, g, b]
}

export function WebGLAvatar({ userId, size = 40, className = '' }: WebGLAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const params = useMemo(() => generateParams(userId), [userId])
  
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size * dpr
    canvas.height = size * dpr
    
    const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false })
    if (!gl) return
    
    const vs = gl.createShader(gl.VERTEX_SHADER)!
    gl.shaderSource(vs, vertexShader)
    gl.compileShader(vs)
    
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!
    gl.shaderSource(fs, fragmentShader)
    gl.compileShader(fs)
    
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      console.error('[Avatar] Fragment shader error:', gl.getShaderInfoLog(fs))
      return
    }
    
    const program = gl.createProgram()!
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    gl.useProgram(program)
    
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW)
    
    const pos = gl.getAttribLocation(program, 'a_position')
    gl.enableVertexAttribArray(pos)
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0)
    
    const uTime = gl.getUniformLocation(program, 'u_time')
    const uSeed = gl.getUniformLocation(program, 'u_seed')
    const uBg = gl.getUniformLocation(program, 'u_bgColor')
    const uEdge = gl.getUniformLocation(program, 'u_edgeColor')
    const uCenter = gl.getUniformLocation(program, 'u_centerColor')
    const uNum = gl.getUniformLocation(program, 'u_numBlobs')
    
    gl.uniform1f(uSeed, params.seed)
    gl.uniform3fv(uBg, hexToRgb(params.theme.bg))
    gl.uniform3fv(uEdge, hexToRgb(params.theme.edge))
    gl.uniform3fv(uCenter, hexToRgb(params.theme.center))
    gl.uniform1i(uNum, params.numBlobs)
    
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    
    let frame: number
    const start = performance.now()
    
    const render = () => {
      const t = (performance.now() - start) / 1000 * params.speed
      gl.uniform1f(uTime, t)
      
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      
      frame = requestAnimationFrame(render)
    }
    
    render()
    
    return () => {
      cancelAnimationFrame(frame)
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      gl.deleteBuffer(buf)
    }
  }, [userId, size, params])
  
  return (
    <canvas
      ref={canvasRef}
      className={`webgl-avatar ${className}`}
      style={{ width: size, height: size }}
      aria-label={`Avatar for ${userId}`}
    />
  )
}

export function AvatarFallback({ userId, size = 40, className = '' }: WebGLAvatarProps) {
  const params = useMemo(() => generateParams(userId), [userId])
  
  return (
    <div
      className={`avatar-fallback ${className}`}
      style={{
        width: size,
        height: size,
        background: params.theme.bg,
        borderRadius: '50%',
        position: 'relative',
        overflow: 'hidden',
      }}
      aria-label={`Avatar for ${userId}`}
    >
      <div style={{
        position: 'absolute',
        width: '40%',
        height: '40%',
        background: `radial-gradient(circle, ${params.theme.center}, ${params.theme.edge})`,
        borderRadius: '50%',
        top: '30%',
        left: '30%',
      }} />
    </div>
  )
}

export function Avatar(props: WebGLAvatarProps) {
  const hasWebGL = useMemo(() => {
    try {
      const c = document.createElement('canvas')
      return !!(c.getContext('webgl') || c.getContext('experimental-webgl'))
    } catch { return false }
  }, [])
  
  return hasWebGL ? <WebGLAvatar {...props} /> : <AvatarFallback {...props} />
}

export default Avatar
