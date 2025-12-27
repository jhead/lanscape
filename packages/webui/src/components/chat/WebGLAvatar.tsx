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

const GRID_SIZE = 6 // 6x6 grid, mirrored to look like 6x6

interface AvatarParams {
  fgColor: string
  bgColor: string
  pixels: boolean[] // Which pixels are "on" (only left half + center, will be mirrored)
}

// Convert HSL to RGB
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = h / 360
  let r: number, g: number, b: number

  if (s === 0) {
    r = g = b = l
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1/6) return p + (q - p) * 6 * t
      if (t < 1/2) return q
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
      return p
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1/3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1/3)
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

// Convert RGB to hex
function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map(x => {
    const hex = x.toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }).join('')}`
}

function generateParams(userId: string): AvatarParams {
  const hash = hashString(userId)
  const rng = seededRandom(hash)
  
  // Generate base hue (0-360) - full range for variety
  const baseHue = rng() * 360
  
  // Choose color relationship (complementary or analogous)
  const useComplementary = rng() > 0.5
  const fgHue = baseHue
  const bgHue = useComplementary 
    ? (baseHue + 180) % 360 // Complementary (opposite)
    : (baseHue + (rng() > 0.5 ? 30 : -30) + 360) % 360 // Analogous (±30°)
  
  // Foreground: moderate saturation (40-60%), medium-light (50-65%)
  // These ranges ensure pleasant, not jarring colors
  const fgSaturation = 0.40 + rng() * 0.20 // 40-60%
  const fgLightness = 0.50 + rng() * 0.15 // 50-65%
  
  // Background: slightly lower saturation (35-55%), dark (18-25%)
  // Dark enough for contrast but not pure black
  const bgSaturation = 0.35 + rng() * 0.20 // 35-55%
  const bgLightness = 0.18 + rng() * 0.07 // 18-25%
  
  // Convert to RGB and hex
  const [fgR, fgG, fgB] = hslToRgb(fgHue, fgSaturation, fgLightness)
  const [bgR, bgG, bgB] = hslToRgb(bgHue, bgSaturation, bgLightness)
  
  const fgColor = rgbToHex(fgR, fgG, fgB)
  const bgColor = rgbToHex(bgR, bgG, bgB)
  
  // Generate pixels for left half + center column (will mirror for right half)
  // For 6x6: we need 3 columns (left) + mirror = 6 columns
  const halfWidth = Math.ceil(GRID_SIZE / 2)
  const pixels: boolean[] = []
  
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < halfWidth; x++) {
      // Higher chance of pixels in center, lower at edges
      const distFromCenter = Math.abs(x - halfWidth + 0.5) / halfWidth
      const chance = 0.5 - distFromCenter * 0.2
      pixels.push(rng() < chance)
    }
  }
  
  return { fgColor, bgColor, pixels }
}

// Get pixel state with horizontal mirroring
function getPixel(pixels: boolean[], x: number, y: number, gridSize: number): boolean {
  const halfWidth = Math.ceil(gridSize / 2)
  // Mirror x coordinate
  const mirroredX = x < halfWidth ? x : gridSize - 1 - x
  const idx = y * halfWidth + mirroredX
  return pixels[idx] || false
}

export function Avatar({ userId, size = 40, className = '' }: WebGLAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const params = useMemo(() => generateParams(userId), [userId])
  
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size * dpr
    canvas.height = size * dpr
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    // Disable smoothing for crisp pixels
    ctx.imageSmoothingEnabled = false
    
    const cellSize = (size * dpr) / GRID_SIZE
    
    // Fill background
    ctx.fillStyle = params.bgColor
    ctx.fillRect(0, 0, size * dpr, size * dpr)
    
    // Draw pixels
    ctx.fillStyle = params.fgColor
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (getPixel(params.pixels, x, y, GRID_SIZE)) {
          ctx.fillRect(
            Math.floor(x * cellSize),
            Math.floor(y * cellSize),
            Math.ceil(cellSize),
            Math.ceil(cellSize)
          )
        }
      }
    }
    
    // Apply circular mask
    ctx.globalCompositeOperation = 'destination-in'
    ctx.beginPath()
    ctx.arc(size * dpr / 2, size * dpr / 2, size * dpr / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
    
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

export default Avatar
