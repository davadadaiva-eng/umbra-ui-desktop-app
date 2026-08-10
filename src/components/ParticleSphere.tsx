// Particle Sphere — Originkit
// Originkit — defaults rewritten to match preview.
import React, { useEffect, useRef } from "react"
const RenderTarget = {
    current: () => "preview",
    canvas: "canvas",
    export: "export",
    thumbnail: "thumbnail",
    preview: "preview",
}
import {
    Scene,
    PerspectiveCamera,
    WebGLRenderer,
    Color,
    Points,
    BufferGeometry,
    Float32BufferAttribute,
    PointsMaterial,
    SphereGeometry,
    MeshBasicMaterial,
    InstancedMesh,
    Matrix4,
    Group,
    Vector3,
    AdditiveBlending,
} from "three"

interface ParticleSphereRefactorProps {
    particlesCount: number
    particleScale: number
    speed: number
    smoothing: number
    scale: number
    stopOnHover: boolean
    rotationDirection?: "clockwise" | "anticlockwise"
    dragSpeed?: number
    drag?: boolean
    cursorOn: boolean
    cursorRadiusUI: number
    cursorStrengthUI: number
    clickForce: number
    sphereColor: string
    style?: React.CSSProperties
}

// CSS variable token and color parsing (hex/rgba/var())
const cssVariableRegex =
    /var\s*\(\s*(--[\w-]+)(?:\s*,\s*((?:[^)(]+|\((?:[^)(]+|\([^)(]*\))*\))*))?\s*\)/

function extractDefaultValue(cssVar: string): string {
    if (!cssVar || !cssVar.startsWith("var(")) return cssVar
    const match = cssVariableRegex.exec(cssVar)
    if (!match) return cssVar
    const fallback = (match[2] || "").trim()
    if (fallback.startsWith("var(")) return extractDefaultValue(fallback)
    return fallback || cssVar
}

function resolveTokenColor(input: any): any {
    if (typeof input !== "string") return input
    if (!input.startsWith("var(")) return input
    return extractDefaultValue(input)
}

// Parse color string to RGBA values (0-1 range)
function parseColorToRgba(input: string | undefined): {
    r: number
    g: number
    b: number
    a: number
} {
    if (!input || input.trim() === "") return { r: 0, g: 0, b: 0, a: 0 }
    const str = input.trim()

    // Handle rgba() format
    const rgbaMatch = str.match(
        /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/i
    )
    if (rgbaMatch) {
        const r = Math.max(0, Math.min(255, parseFloat(rgbaMatch[1]))) / 255
        const g = Math.max(0, Math.min(255, parseFloat(rgbaMatch[2]))) / 255
        const b = Math.max(0, Math.min(255, parseFloat(rgbaMatch[3]))) / 255
        const a =
            rgbaMatch[4] !== undefined
                ? Math.max(0, Math.min(1, parseFloat(rgbaMatch[4])))
                : 1
        return { r, g, b, a }
    }

    // Handle hex formats
    const hex = str.replace(/^#/, "")
    if (hex.length === 8) {
        return {
            r: parseInt(hex.slice(0, 2), 16) / 255,
            g: parseInt(hex.slice(2, 4), 16) / 255,
            b: parseInt(hex.slice(4, 6), 16) / 255,
            a: parseInt(hex.slice(6, 8), 16) / 255,
        }
    }
    if (hex.length === 6) {
        return {
            r: parseInt(hex.slice(0, 2), 16) / 255,
            g: parseInt(hex.slice(2, 4), 16) / 255,
            b: parseInt(hex.slice(4, 6), 16) / 255,
            a: 1,
        }
    }
    if (hex.length === 4) {
        return {
            r: parseInt(hex[0] + hex[0], 16) / 255,
            g: parseInt(hex[1] + hex[1], 16) / 255,
            b: parseInt(hex[2] + hex[2], 16) / 255,
            a: parseInt(hex[3] + hex[3], 16) / 255,
        }
    }
    if (hex.length === 3) {
        return {
            r: parseInt(hex[0] + hex[0], 16) / 255,
            g: parseInt(hex[1] + hex[1], 16) / 255,
            b: parseInt(hex[2] + hex[2], 16) / 255,
            a: 1,
        }
    }
    return { r: 0, g: 0, b: 0, a: 1 }
}

// Value mapping functions
function mapLinear(
    value: number,
    inMin: number,
    inMax: number,
    outMin: number,
    outMax: number
): number {
    if (inMax === inMin) return outMin
    const t = (value - inMin) / (inMax - inMin)
    return outMin + t * (outMax - outMin)
}

// Speed: UI [0.1..1] → internal [0.01..0.05] (rotation speed multiplier)
function mapSpeedUiToInternal(ui: number): number {
    return mapLinear(ui, 0.1, 1.0, 0.01, 0.05)
}

// Scale: UI [0..1] → scale multiplier [0.5..3.0] (overall sphere size multiplier)
function mapScaleUiToMultiplier(ui: number): number {
    const clamped = Math.max(0, Math.min(1, ui))
    return mapLinear(clamped, 0, 1.0, 0.25, 1.25)
}

// Particle Size: UI [0.1..1] → size [0.01..0.1] (individual particle size)
function mapParticleSizeUiToInternal(ui: number): number {
    const clamped = Math.max(0.1, Math.min(1, ui))
    return mapLinear(clamped, 0.1, 1.0, 0.01, 0.1)
}

// Cursor Strength: UI [0..1] → force multiplier [0..15]
// Default 0.3 maps to 4.5 (stronger default behavior)
// Maximum strength (1.0) creates a much larger void around cursor
function mapCursorStrengthUiToMultiplier(ui: number): number {
    const clamped = Math.max(0, Math.min(1, ui))
    return mapLinear(clamped, 0, 1.0, 0, 15)
}

// Cursor interaction constants (from ref.tsx)
const CURSOR_PHYSICS = {
    RETURN_FORCE: 0.015, // Balanced for smooth return after click scatter
    FRICTION: 0.94, // Slightly higher friction for smoother decay
} as const

/**
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight any-prefer-fixed
 * @framerIntrinsicWidth 500
 * @framerIntrinsicHeight 500
 * @framerDisableUnlink
 */
export default function ParticleSphereRefactor(__props: ParticleSphereRefactorProps) {
    const {
        particlesCount = 10000,
        speed = 20,
        smoothing = 7,
        scale = 10,
        stopOnHover = false,
        rotationDirection = "clockwise",
        dragSpeed = 5,
        drag = true,
        particleScale = 8,
        cursorOn = true,
        cursorRadiusUI = 75,
        cursorStrengthUI = 10,
        clickForce = 5,
        sphereColor = "#BE3014",
        style,
    } = { ...COMPONENT_DEFAULTS, ...__props }
    // Flat controls rebuilt into the config objects the engine expects.
    const particlesConfig = { shape: "sphere", scale: particleScale }
    const cursorConfig = {
        enabled: cursorOn,
        radius: cursorRadiusUI,
        strength: cursorStrengthUI,
        clickForce,
    }

    // Whole-number sliders (1–10 etc.) → the engine's internal 0–1 ranges.
    const speedN = speed / 10
    const smoothingN = smoothing / 10
    const scaleN = scale / 10
    const dragN = dragSpeed / 10
    const sizeN = particlesConfig.scale / 10
    const strengthN = cursorConfig.strength / 10
    const containerRef = useRef<HTMLDivElement>(null)
    const zoomProbeRef = useRef<HTMLDivElement>(null)
    const sceneRef = useRef<any>(null)
    const cameraRef = useRef<any>(null)
    const rendererRef = useRef<any>(null)
    const particlesRef = useRef<any>(null)
    const particlesGroupRef = useRef<any>(null)
    const animationFrameRef = useRef<number | null>(null)
    const animateFnRef = useRef<(() => void) | null>(null)
    const startAnimationRef = useRef<(() => void) | null>(null)
    const lastResizeRef = useRef({ ts: 0, zoom: 0, w: 0, h: 0, aspect: 0 })
    const mouseRef = useRef<{ x: number; y: number } | null>(null)
    const baseParticlePositionsRef = useRef<any[]>([])
    const particleDisplacementsRef = useRef<any[]>([])
    const particleScatterVelocitiesRef = useRef<any[]>([])

    // Check canvas mode ONCE at component mount and cache it
    const isCanvasRef = useRef<boolean | null>(null)
    if (isCanvasRef.current === null) {
        isCanvasRef.current = RenderTarget.current() === RenderTarget.canvas
    }
    const isCanvas = isCanvasRef.current

    // Map UI speed to internal speed
    const rotationSpeed = React.useMemo(() => {
        const baseSpeed = mapSpeedUiToInternal(speedN)
        return rotationDirection === "anticlockwise" ? -baseSpeed : baseSpeed
    }, [speedN, rotationDirection])

    // Map UI scale to internal scale multiplier (overall sphere size)
    const scaleMultiplier = React.useMemo(
        () => mapScaleUiToMultiplier(scaleN),
        [scaleN]
    )

    // Map UI particle size to internal particle size
    const particleSize = React.useMemo(
        () => mapParticleSizeUiToInternal(sizeN),
        [sizeN]
    )

    // Cursor radius in pixels (clamped to reasonable range)
    const cursorRadius = React.useMemo(
        () => Math.max(0, Math.min(600, cursorConfig.radius)),
        [cursorConfig.radius]
    )

    // Map UI cursor strength to force multiplier
    const cursorStrength = React.useMemo(
        () => mapCursorStrengthUiToMultiplier(strengthN),
        [strengthN]
    )

    useEffect(() => {
        if (!containerRef.current) return

        const container = containerRef.current

        // Guard: remove any canvas left behind by a previous effect run
        // (React StrictMode double-mounts effects in dev, and a canvas can
        // otherwise linger, producing doubled additive-blended spheres).
        container.querySelectorAll("canvas").forEach((c) => c.remove())

        const containerWidth =
            container.clientWidth || container.offsetWidth || 400
        const containerHeight =
            container.clientHeight || container.offsetHeight || 400

        // Canvas overflow multiplier - makes canvas larger than container to prevent clipping
        // The sphere and camera remain the same, just more "empty space" around the edges
        const canvasOverflowMultiplier = 2.5 // 50% larger canvas on each side
        const canvasWidth = containerWidth * canvasOverflowMultiplier
        const canvasHeight = containerHeight * canvasOverflowMultiplier

        // Scene setup
        const scene = new Scene()
        sceneRef.current = scene

        // Calculate adjusted FOV to keep sphere the same size regardless of canvas overflow
        // When canvas is larger, we need a wider FOV to show the same content at the same size
        // FOV adjustment: tan(newFOV/2) = tan(baseFOV/2) * canvasOverflowMultiplier
        const baseFOV = 50
        const adjustedFOV =
            2 *
            Math.atan(
                Math.tan((baseFOV * Math.PI) / 180 / 2) *
                    canvasOverflowMultiplier
            ) *
            (180 / Math.PI)

        const camera = new PerspectiveCamera(
            adjustedFOV,
            canvasWidth / canvasHeight, // Use canvas aspect ratio for correct projection
            0.1,
            1000
        )
        // Base camera distance - keep it relatively fixed so sphere appears bigger when scaled
        // The sphere radius is 1.0 * scaleMultiplier, so we need camera at least at that distance + margin
        const baseCameraDistance = 3.0
        const currentSphereRadius = 1.0 * scaleMultiplier
        // Ensure camera is always outside the sphere with a safe margin
        const cameraDistance = Math.max(
            baseCameraDistance,
            currentSphereRadius + 1.0
        )
        camera.position.z = cameraDistance
        cameraRef.current = camera

        // Renderer setup - canvas is larger than container to prevent clipping
        const renderer = new WebGLRenderer({ antialias: true, alpha: true })
        renderer.setSize(canvasWidth, canvasHeight)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.outputColorSpace = "srgb"
        const canvas = renderer.domElement
        canvas.style.position = "absolute"
        // Center the larger canvas within the container
        const offsetX = (canvasWidth - containerWidth) / 2
        const offsetY = (canvasHeight - containerHeight) / 2
        canvas.style.left = `-${offsetX}px`
        canvas.style.top = `-${offsetY}px`
        canvas.style.width = `${canvasWidth}px`
        canvas.style.height = `${canvasHeight}px`
        canvas.style.display = "block"
        container.appendChild(canvas)
        rendererRef.current = renderer

        // Create particles evenly distributed on sphere surface
        const vertices = []

        // Fibonacci sphere distribution for even spacing on sphere surface
        // This creates evenly distributed points on a unit sphere
        const goldenAngle = Math.PI * (3 - Math.sqrt(5)) // Golden angle in radians
        const baseSphereRadius = 1.0 // Base radius of the particle sphere
        const sphereRadius = baseSphereRadius * scaleMultiplier // Scale the sphere

        // Initialize base positions, displacements, and scatter velocities for cursor interaction
        baseParticlePositionsRef.current = []
        particleDisplacementsRef.current = []
        particleScatterVelocitiesRef.current = []

        // Resolve color tokens (CSS variables) and parse color properly
        const resolvedSphereColor = resolveTokenColor(sphereColor)
        const sphereRgba = parseColorToRgba(resolvedSphereColor || sphereColor)
        // Use Color constructor with string for proper color space handling
        // Then apply the parsed RGB values to ensure opacity is extracted correctly
        const baseColorObj = resolvedSphereColor
            ? new Color(resolvedSphereColor)
            : new Color(sphereRgba.r, sphereRgba.g, sphereRgba.b)
        const particleOpacity = sphereRgba.a

        // Red color for displaced particles
        const redColor = new Color(1, 0, 0)

        for (let i = 0; i < particlesCount; i++) {
            // Use golden angle spiral for even distribution
            const y = 1 - (i / (particlesCount - 1)) * 2 // y goes from 1 to -1
            const radius = Math.sqrt(1 - y * y) // Radius at y
            const theta = goldenAngle * i // Golden angle increment

            const x = Math.cos(theta) * radius
            const z = Math.sin(theta) * radius

            // Scale to sphere surface with scale multiplier
            const posX = x * sphereRadius
            const posY = y * sphereRadius
            const posZ = z * sphereRadius
            vertices.push(posX, posY, posZ)

            // Store base position and initialize displacement and scatter velocity
            baseParticlePositionsRef.current.push(new Vector3(posX, posY, posZ))
            particleDisplacementsRef.current.push(new Vector3(0, 0, 0))
            particleScatterVelocitiesRef.current.push(new Vector3(0, 0, 0))
        }

        // Create particles based on shape
        const particleShape = particlesConfig.shape || "sphere"
        let particles: any

        if (particleShape === "sphere") {
            // Round particles using actual sphere geometries with InstancedMesh
            // Convert screen-space particle size to world-space radius to match visual size
            const sphereRadius = particleSize * 0.15 // Adjust this factor to match visual size
            const sphereGeometry = new SphereGeometry(sphereRadius, 8, 8)
            // Use MeshBasicMaterial with AdditiveBlending for the glow effect
            const sphereMaterial = new MeshBasicMaterial({
                color: 0xffffff,
                blending: AdditiveBlending,
                transparent: particleOpacity < 1,
                opacity: particleOpacity,
            })

            particles = new InstancedMesh(
                sphereGeometry,
                sphereMaterial,
                particlesCount
            )

            // Set positions for each instance
            const matrix = new Matrix4()
            for (let i = 0; i < particlesCount; i++) {
                const idx = i * 3
                matrix.setPosition(
                    vertices[idx],
                    vertices[idx + 1],
                    vertices[idx + 2]
                )
                particles.setMatrixAt(i, matrix)
            }
            particles.instanceMatrix.needsUpdate = true

            // Set up instance colors (per-instance coloring)
            const instanceColors = new Float32Array(particlesCount * 3)
            for (let i = 0; i < particlesCount; i++) {
                const idx = i * 3
                instanceColors[idx] = baseColorObj.r
                instanceColors[idx + 1] = baseColorObj.g
                instanceColors[idx + 2] = baseColorObj.b
            }
            particles.instanceColor = new Float32BufferAttribute(
                instanceColors,
                3
            )
            sphereMaterial.vertexColors = false
            particles.instanceColor.needsUpdate = true
        } else {
            // Square particles using Points
            const particlesGeometry = new BufferGeometry()
            particlesGeometry.setAttribute(
                "position",
                new Float32BufferAttribute(vertices, 3)
            )

            // Set up vertex colors (per-vertex coloring)
            const colors = new Float32Array(particlesCount * 3)
            for (let i = 0; i < particlesCount; i++) {
                const idx = i * 3
                colors[idx] = baseColorObj.r
                colors[idx + 1] = baseColorObj.g
                colors[idx + 2] = baseColorObj.b
            }
            particlesGeometry.setAttribute(
                "color",
                new Float32BufferAttribute(colors, 3)
            )

            const particlesMaterial = new PointsMaterial({
                size: particleSize,
                color: 0xffffff, // White multiplier when using vertexColors
                blending: AdditiveBlending,
                depthTest: false,
                transparent: particleOpacity < 1,
                opacity: particleOpacity,
                vertexColors: true, // Enable vertex colors
            })

            particles = new Points(particlesGeometry, particlesMaterial)
        }

        particlesRef.current = particles

        // Create group to hold particles for rotation
        const particlesGroup = new Group()
        particlesGroupRef.current = particlesGroup
        particlesGroup.add(particles)
        scene.add(particlesGroup)

        // Rotation state - initialize
        const rotation = { x: 0, y: 0 }
        const targetRotation = { x: 0, y: 0 }
        const velocity = { x: 0, y: 0 }
        let isDragging = false
        let isHovering = false
        let lastMouseX = 0
        let lastMouseY = 0
        let lastDragTime = 0
        let animationFrameId: number | null = null

        // Delta time tracking for frame-rate independent animation
        let lastFrameTime = performance.now()
        const targetDeltaTime = 1000 / 60 // Reference delta time (60 FPS = 16.67ms)

        // Lerp factor: smoothing 0 = instant (factor=1), smoothing 1 = very smooth (factor=0.03)
        const lerpFactor =
            smoothingN === 0 ? 1 : mapLinear(smoothingN, 0, 1, 0.4, 0.03)
        // Velocity decay for throw: higher smoothing = more momentum
        const velocityDecay = mapLinear(smoothingN, 0, 1, 0.7, 0.96)

        // Animation loop - uses cached isCanvas value for performance
        const animate = () => {
            // Continue with animation (component should always render to show changes)
            animateCore()
        }

        // Core animation logic - uses delta time for frame-rate independent animation
        const animateCore = () => {
            const now = performance.now()

            // Calculate delta time and normalize it relative to 60 FPS
            const deltaTime = now - lastFrameTime
            lastFrameTime = now
            const deltaFactor = deltaTime / targetDeltaTime

            let needsRender = false
            const threshold = 0.01

            // Auto-rotation: add to target when not dragging and not hovering.
            const canAutoRotate = true
            if (
                !isDragging &&
                rotationSpeed !== 0 &&
                canAutoRotate &&
                (!stopOnHover || !isHovering)
            ) {
                targetRotation.x += rotationSpeed * 0.1 * deltaFactor
            }

            // Apply throw velocity when not dragging
            if (!isDragging && smoothingN > 0) {
                if (
                    Math.abs(velocity.x) > threshold ||
                    Math.abs(velocity.y) > threshold
                ) {
                    targetRotation.x += velocity.x * deltaFactor
                    targetRotation.y += velocity.y * deltaFactor
                    targetRotation.y = Math.max(
                        -Math.PI / 2,
                        Math.min(Math.PI / 2, targetRotation.y)
                    )
                    const decayFactor = Math.pow(velocityDecay, deltaFactor)
                    velocity.x *= decayFactor
                    velocity.y *= decayFactor
                } else {
                    velocity.x = 0
                    velocity.y = 0
                }
            }

            // Lerp current rotation toward target
            const dx = targetRotation.x - rotation.x
            const dy = targetRotation.y - rotation.y

            if (
                Math.abs(dx) > threshold ||
                Math.abs(dy) > threshold ||
                rotationSpeed !== 0 ||
                isDragging
            ) {
                // While dragging, track the cursor 1:1 so the sphere never lags
                // behind the mouse. Smoothing only applies to idle/spin motion.
                const activeLerpFactor = isDragging ? 1 : lerpFactor
                const timeLerpFactor =
                    1 - Math.pow(1 - activeLerpFactor, deltaFactor)
                rotation.x += dx * timeLerpFactor
                rotation.y += dy * timeLerpFactor
                rotation.y = Math.max(
                    -Math.PI / 2,
                    Math.min(Math.PI / 2, rotation.y)
                )
                needsRender = true
            }

            // Apply rotation to group BEFORE cursor interaction (so matrix is current)
            particlesGroup.rotation.y = rotation.x
            particlesGroup.rotation.x = rotation.y
            particlesGroup.updateMatrixWorld(true)

            // Get container and camera info for both cursor interaction and color updates
            // Use canvas dimensions for projection since mouse coordinates are in canvas space
            const currentContainerWidth =
                containerRef.current?.clientWidth || 400
            const currentContainerHeight =
                containerRef.current?.clientHeight || 400
            const currentCanvasWidth =
                currentContainerWidth * canvasOverflowMultiplier
            const currentCanvasHeight =
                currentContainerHeight * canvasOverflowMultiplier
            const currentCamera = cameraRef.current
            const cursorRadiusSquared = cursorRadius * cursorRadius

            // Apply cursor repulsion to particles (only if enabled)
            if (
                cursorConfig.enabled &&
                baseParticlePositionsRef.current.length > 0
            ) {
                for (
                    let i = 0;
                    i < baseParticlePositionsRef.current.length;
                    i++
                ) {
                    const basePos = baseParticlePositionsRef.current[i]
                    const displacement = particleDisplacementsRef.current[i]

                    // Apply repulsion force only if cursor is present and near particle
                    if (mouseRef.current) {
                        const mouse = mouseRef.current

                        // Calculate current position: base position + displacement, then rotated by group
                        const currentLocalPos = new Vector3()
                        currentLocalPos.copy(basePos)
                        currentLocalPos.add(displacement)

                        // Transform to world space (apply group rotation)
                        const worldPos = new Vector3()
                        worldPos.copy(currentLocalPos)
                        worldPos.applyMatrix4(particlesGroup.matrixWorld)

                        // Project 3D position to 2D screen space (using canvas dimensions)
                        const projected = worldPos
                            .clone()
                            .project(currentCamera)
                        const screenX =
                            (projected.x * 0.5 + 0.5) * currentCanvasWidth
                        const screenY =
                            (-projected.y * 0.5 + 0.5) * currentCanvasHeight

                        // Calculate distance from cursor to particle in screen space
                        const dx = mouse.x - screenX
                        const dy = mouse.y - screenY
                        const distanceSquared = dx * dx + dy * dy

                        // Only the front layer (facing the camera, worldPos.z
                        // > 0) reacts — the back layer keeps rotating untouched.
                        if (
                            distanceSquared < cursorRadiusSquared &&
                            distanceSquared > 0 &&
                            worldPos.z > 0
                        ) {
                            // Apply repulsion force
                            const distance = Math.sqrt(distanceSquared)
                            const force =
                                (cursorRadius - distance) / cursorRadius
                            const angle = Math.atan2(dy, dx)

                            // Get camera's right and up vectors in world space
                            const cameraRight = new Vector3()
                            const cameraUp = new Vector3()
                            cameraRight
                                .setFromMatrixColumn(
                                    currentCamera.matrixWorld,
                                    0
                                )
                                .normalize()
                            cameraUp
                                .setFromMatrixColumn(
                                    currentCamera.matrixWorld,
                                    1
                                )
                                .normalize()

                            // Calculate repulsion direction in screen space
                            const repulsion2D =
                                force * cursorStrength * speedN * deltaFactor
                            const repulsionX =
                                -Math.cos(angle) * repulsion2D * 0.01
                            const repulsionY =
                                Math.sin(angle) * repulsion2D * 0.01

                            // Convert screen space repulsion to world space, then to local space
                            const worldRepulsion = new Vector3()
                            worldRepulsion.addScaledVector(
                                cameraRight,
                                repulsionX
                            )
                            worldRepulsion.addScaledVector(cameraUp, repulsionY)

                            // Transform world repulsion back to local space (inverse of group rotation)
                            const localRepulsion = new Vector3()
                            localRepulsion.copy(worldRepulsion)
                            const inverseGroupMatrix = new Matrix4()
                            inverseGroupMatrix
                                .copy(particlesGroup.matrixWorld)
                                .invert()
                            localRepulsion.applyMatrix4(inverseGroupMatrix)

                            // Apply to displacement
                            displacement.add(localRepulsion)
                        }
                    }

                    // Always apply friction and return force to decay displacements (even when cursor is gone)
                    const frictionFactor = Math.pow(
                        CURSOR_PHYSICS.FRICTION,
                        deltaFactor
                    )
                    const returnForce =
                        CURSOR_PHYSICS.RETURN_FORCE * speedN * deltaFactor
                    // Apply friction (multiplicative decay)
                    displacement.multiplyScalar(frictionFactor)
                    // Apply return force (decay towards zero)
                    displacement.multiplyScalar(1 - returnForce)
                }
            }

            // Apply scatter velocities to displacements (spring-like effect)
            if (particleScatterVelocitiesRef.current.length > 0) {
                for (
                    let i = 0;
                    i < particleScatterVelocitiesRef.current.length;
                    i++
                ) {
                    const scatterVelocity =
                        particleScatterVelocitiesRef.current[i]
                    const displacement = particleDisplacementsRef.current[i]

                    // Apply velocity to displacement (frame-rate independent)
                    displacement.addScaledVector(
                        scatterVelocity,
                        deltaFactor * 0.1
                    )

                    // Apply friction to scatter velocity (decay over time)
                    const scatterFriction = Math.pow(0.95, deltaFactor)
                    scatterVelocity.multiplyScalar(scatterFriction)

                    // Apply return force to scatter velocity (spring back)
                    const scatterReturnForce =
                        CURSOR_PHYSICS.RETURN_FORCE * speedN * deltaFactor
                    scatterVelocity.multiplyScalar(1 - scatterReturnForce)
                }
            }

            // Update particle positions and colors (ALWAYS, not just when cursor is enabled)
            const particleShape = particlesConfig.shape || "sphere"

            if (particleShape === "sphere" && particlesRef.current) {
                // Update InstancedMesh positions
                const matrix = new Matrix4()
                const instanceColors = particlesRef.current.instanceColor
                    ? particlesRef.current.instanceColor.array
                    : null
                let anyDisplaced = false

                for (
                    let i = 0;
                    i < baseParticlePositionsRef.current.length;
                    i++
                ) {
                    const basePos = baseParticlePositionsRef.current[i]
                    const displacement = particleDisplacementsRef.current[i]
                    const finalPos = new Vector3()
                    finalPos.copy(basePos)
                    finalPos.add(displacement)
                    matrix.setPosition(finalPos.x, finalPos.y, finalPos.z)
                    particlesRef.current.setMatrixAt(i, matrix)

                    // Blend displaced particles toward red, settle back to base color
                    if (instanceColors && displacement.lengthSq() > 0.0004) {
                        const t = Math.min(displacement.length() / 0.18, 1)
                        const idx = i * 3
                        instanceColors[idx] =
                            baseColorObj.r + (redColor.r - baseColorObj.r) * t
                        instanceColors[idx + 1] =
                            baseColorObj.g + (redColor.g - baseColorObj.g) * t
                        instanceColors[idx + 2] =
                            baseColorObj.b + (redColor.b - baseColorObj.b) * t
                        anyDisplaced = true
                    }
                }
                particlesRef.current.instanceMatrix.needsUpdate = true
                if (anyDisplaced && instanceColors) {
                    particlesRef.current.instanceColor.needsUpdate = true
                }
            } else if (particleShape === "cube" && particlesRef.current) {
                // Update Points geometry positions and colors
                const positions =
                    particlesRef.current.geometry.attributes.position

                for (
                    let i = 0;
                    i < baseParticlePositionsRef.current.length;
                    i++
                ) {
                    const basePos = baseParticlePositionsRef.current[i]
                    const displacement = particleDisplacementsRef.current[i]
                    const finalPos = new Vector3()
                    finalPos.copy(basePos)
                    finalPos.add(displacement)
                    positions.setXYZ(i, finalPos.x, finalPos.y, finalPos.z)
                }
                positions.needsUpdate = true
            }

            needsRender = true

            // Render every frame
            if (needsRender || rotationSpeed !== 0 || isDragging) {
                renderer.render(scene, camera)
            }

            // Continue loop if animation is needed
            const hasVelocity =
                Math.abs(velocity.x) > threshold ||
                Math.abs(velocity.y) > threshold
            const hasLerpDelta =
                Math.abs(dx) > threshold || Math.abs(dy) > threshold
            // Check if cursor interaction is active (any non-zero displacements) - only if enabled
            const hasCursorInteraction =
                cursorConfig.enabled &&
                particleDisplacementsRef.current.some(
                    (disp) =>
                        Math.abs(disp.x) > threshold ||
                        Math.abs(disp.y) > threshold ||
                        Math.abs(disp.z) > threshold
                )
            // In canvas mode, always continue animation so component is visible
            // In preview/live mode, only continue if there's actual animation
            const canAutoRotateForContinue = true
            const needsContinue =
                isCanvas || // Always run in canvas mode for visibility
                isDragging ||
                (rotationSpeed !== 0 && canAutoRotateForContinue) ||
                hasVelocity ||
                hasLerpDelta ||
                hasCursorInteraction

            if (needsContinue) {
                animationFrameId = requestAnimationFrame(animate)
                animationFrameRef.current = animationFrameId
            } else {
                animationFrameId = null
                animationFrameRef.current = null
            }
        }

        // Store animate function in ref for preview effect to use
        animateFnRef.current = animate

        // Start animation loop - resets lastFrameTime to prevent delta jump
        const startAnimation = () => {
            if (animationFrameId === null) {
                lastFrameTime = performance.now()
                animationFrameId = requestAnimationFrame(animate)
                animationFrameRef.current = animationFrameId
            }
        }

        // Store startAnimation in ref for preview effect to use
        startAnimationRef.current = startAnimation

        // Always start animation to ensure component is visible and interactive
        // In canvas mode, rotation will be controlled by preview state
        startAnimation()

        // Mouse interaction handlers (only if drag is enabled)
        const handleMouseDown = (event: MouseEvent) => {
            if (!drag) return
            isDragging = true
            velocity.x = 0
            velocity.y = 0
            lastMouseX = event.clientX
            lastMouseY = event.clientY
            lastDragTime = performance.now()
            startAnimation()

            const handleMouseMove = (moveEvent: MouseEvent) => {
                const currentTime = performance.now()
                const timeSinceLastMove = currentTime - lastDragTime

                // Surface-tracking sensitivity: rotating the sphere so the point
                // under the cursor moves 1:1 with the mouse. Sensitivity =
                // 1 / projected sphere radius (px). This keeps the drag synced
                // with the cursor regardless of sphere/container size.
                const dragContainerHeight =
                    containerRef.current?.clientHeight || 400
                const dragCanvasHeight =
                    dragContainerHeight * canvasOverflowMultiplier
                const dragCam = cameraRef.current
                const fovRad = ((dragCam?.fov ?? 50) * Math.PI) / 180
                const camDist = dragCam?.position.z ?? 3
                const worldRadius = 1.0 * scaleMultiplier
                const screenRadiusPx =
                    (worldRadius * (dragCanvasHeight / 2)) /
                    (Math.tan(fovRad / 2) * camDist)
                const baseSensitivity = 1 / Math.max(screenRadiusPx, 1)
                // dragSpeed still scales the feel around the 1:1 value
                const sensitivity =
                    baseSensitivity *
                    mapLinear(dragN, 0, 1, 0.75, 1.5)

                const dx = moveEvent.clientX - lastMouseX
                const dy = moveEvent.clientY - lastMouseY

                targetRotation.x += dx * sensitivity
                targetRotation.y += dy * sensitivity
                targetRotation.y = Math.max(
                    -Math.PI / 2,
                    Math.min(Math.PI / 2, targetRotation.y)
                )

                // Track velocity for throw - TIME NORMALIZED
                if (timeSinceLastMove > 0) {
                    const timeNormalization =
                        targetDeltaTime / timeSinceLastMove
                    velocity.x =
                        dx * sensitivity * 0.12 * timeNormalization
                    velocity.y =
                        dy * sensitivity * 0.12 * timeNormalization
                }

                lastMouseX = moveEvent.clientX
                lastMouseY = moveEvent.clientY
                lastDragTime = currentTime
            }

            const handleMouseUp = () => {
                document.removeEventListener("mousemove", handleMouseMove)
                document.removeEventListener("mouseup", handleMouseUp)
                isDragging = false
            }

            document.addEventListener("mousemove", handleMouseMove)
            document.addEventListener("mouseup", handleMouseUp)
        }

        if (drag) {
            canvas.addEventListener("mousedown", handleMouseDown)
        }

        // Handle hover to stop auto-rotation (only when cursor is over the sphere)
        const handleMouseMoveHover = (event: MouseEvent) => {
            if (!stopOnHover) return

            // Check if mouse is over the logical container area (not the extended canvas)
            const containerRect = container.getBoundingClientRect()
            const mouseX = event.clientX - containerRect.left
            const mouseY = event.clientY - containerRect.top
            isHovering =
                mouseX >= 0 &&
                mouseX <= containerRect.width &&
                mouseY >= 0 &&
                mouseY <= containerRect.height
        }

        if (stopOnHover) {
            canvas.addEventListener("mousemove", handleMouseMoveHover)
        }

        // Track cursor position for particle repulsion
        // Mouse coordinates need to be relative to the container center, then offset to canvas coordinates
        const handleMouseMoveCursor = (event: MouseEvent) => {
            const containerRect = container.getBoundingClientRect()
            const mouseXInContainer = event.clientX - containerRect.left
            const mouseYInContainer = event.clientY - containerRect.top
            // Only track if mouse is over the logical container area
            if (
                mouseXInContainer >= 0 &&
                mouseXInContainer <= containerRect.width &&
                mouseYInContainer >= 0 &&
                mouseYInContainer <= containerRect.height
            ) {
                // Convert container coordinates to canvas coordinates (add offset)
                mouseRef.current = {
                    x: mouseXInContainer + offsetX,
                    y: mouseYInContainer + offsetY,
                }
                // Start animation if not running (needed for cursor interaction to work)
                startAnimation()
            } else {
                mouseRef.current = null
            }
        }

        const handleMouseLeaveCursor = () => {
            mouseRef.current = null
        }

        // Track touch position for particle repulsion
        const handleTouchMove = (event: TouchEvent) => {
            event.preventDefault() // Prevent scrolling
            const containerRect = container.getBoundingClientRect()
            const touch = event.touches[0]
            if (touch) {
                const touchXInContainer = touch.clientX - containerRect.left
                const touchYInContainer = touch.clientY - containerRect.top
                // Only track if touch is over the logical container area
                if (
                    touchXInContainer >= 0 &&
                    touchXInContainer <= containerRect.width &&
                    touchYInContainer >= 0 &&
                    touchYInContainer <= containerRect.height
                ) {
                    // Convert container coordinates to canvas coordinates (add offset)
                    mouseRef.current = {
                        x: touchXInContainer + offsetX,
                        y: touchYInContainer + offsetY,
                    }
                    // Start animation if not running (needed for cursor interaction to work)
                    startAnimation()
                } else {
                    mouseRef.current = null
                }
            }
        }

        const handleTouchEnd = () => {
            mouseRef.current = null
        }

        // Click scatter effect handler
        const handleClick = (event: MouseEvent) => {
            if (!cursorConfig.enabled || !cursorConfig.clickForce) return

            // Update matrix to ensure it's current
            particlesGroup.updateMatrixWorld(true)

            const containerRect = container.getBoundingClientRect()
            // Convert container coordinates to canvas coordinates (add offset)
            const clickX = event.clientX - containerRect.left + offsetX
            const clickY = event.clientY - containerRect.top + offsetY
            const cursorRadiusSquared = cursorRadius * cursorRadius
            const clickForce = cursorConfig.clickForce || 10

            const clickContainerWidth = containerRef.current?.clientWidth || 400
            const clickContainerHeight =
                containerRef.current?.clientHeight || 400
            const clickCanvasWidth =
                clickContainerWidth * canvasOverflowMultiplier
            const clickCanvasHeight =
                clickContainerHeight * canvasOverflowMultiplier
            const currentCamera = cameraRef.current

            // Convert click point from screen space to 3D world space
            // Normalize click coordinates to NDC (Normalized Device Coordinates) using canvas dimensions
            const ndcX = (clickX / clickCanvasWidth) * 2 - 1
            const ndcY = 1 - (clickY / clickCanvasHeight) * 2

            // Create a ray from camera through the click point
            const clickRay = new Vector3(ndcX, ndcY, 0.5)
            clickRay.unproject(currentCamera)

            // Get camera position in world space
            const cameraWorldPos = new Vector3()
            cameraWorldPos.setFromMatrixPosition(currentCamera.matrixWorld)

            // Calculate direction from camera through click point
            const clickDirection = new Vector3()
            clickDirection.subVectors(clickRay, cameraWorldPos).normalize()

            // Estimate click point in world space (at sphere distance)
            const sphereCenter = new Vector3(0, 0, 0)
            const cameraToCenter = new Vector3()
            cameraToCenter.subVectors(sphereCenter, cameraWorldPos)
            const sphereDistance = cameraToCenter.length()
            const clickWorldPos = new Vector3()
            clickWorldPos.copy(cameraWorldPos)
            clickWorldPos.addScaledVector(clickDirection, sphereDistance)

            // Apply scatter velocity to particles (velocity-based, radial in 3D)
            for (let i = 0; i < baseParticlePositionsRef.current.length; i++) {
                const basePos = baseParticlePositionsRef.current[i]
                const displacement = particleDisplacementsRef.current[i]
                const scatterVelocity = particleScatterVelocitiesRef.current[i]

                // Calculate current position: base position + displacement, then rotated by group
                const currentLocalPos = new Vector3()
                currentLocalPos.copy(basePos)
                currentLocalPos.add(displacement)

                // Transform to world space (apply group rotation)
                const worldPos = new Vector3()
                worldPos.copy(currentLocalPos)
                worldPos.applyMatrix4(particlesGroup.matrixWorld)

                // Project 3D position to 2D screen space for distance check (using canvas dimensions)
                const projected = worldPos.clone().project(currentCamera)
                const screenX = (projected.x * 0.5 + 0.5) * clickCanvasWidth
                const screenY = (-projected.y * 0.5 + 0.5) * clickCanvasHeight

                // Calculate distance from click point to particle in screen space
                const dx = clickX - screenX
                const dy = clickY - screenY
                const distanceSquared = dx * dx + dy * dy

                if (
                    distanceSquared < cursorRadiusSquared &&
                    distanceSquared > 0
                ) {
                    // Calculate scatter force based on screen distance
                    const screenDistance = Math.sqrt(distanceSquared)
                    const force =
                        ((cursorRadius - screenDistance) / cursorRadius) *
                        clickForce

                    // Calculate radial direction in 3D: from click point to particle
                    const radialDirection = new Vector3()
                    radialDirection.subVectors(worldPos, clickWorldPos)
                    const radialDistance = radialDirection.length()

                    if (radialDistance > 0.001) {
                        radialDirection.normalize()

                        // Apply scatter velocity along radial direction (in world space)
                        const scatterMagnitude = force * 0.5 // Velocity multiplier
                        const worldScatter = new Vector3()
                        worldScatter.copy(radialDirection)
                        worldScatter.multiplyScalar(scatterMagnitude)

                        // Transform world scatter back to local space (inverse of group rotation)
                        const localScatter = new Vector3()
                        localScatter.copy(worldScatter)
                        const inverseGroupMatrix = new Matrix4()
                        inverseGroupMatrix
                            .copy(particlesGroup.matrixWorld)
                            .invert()
                        localScatter.applyMatrix4(inverseGroupMatrix)

                        // Set scatter velocity (adds to existing velocity for momentum)
                        scatterVelocity.add(localScatter)
                    }
                }
            }

            // Start animation to ensure scatter effect is visible
            startAnimation()
        }

        // Touch scatter effect handler
        const handleTouchStart = (event: TouchEvent) => {
            if (!cursorConfig.enabled || !cursorConfig.clickForce) return

            event.preventDefault()

            // Update matrix to ensure it's current
            particlesGroup.updateMatrixWorld(true)

            const containerRect = container.getBoundingClientRect()
            const touch = event.touches[0]
            if (!touch) return

            // Convert container coordinates to canvas coordinates (add offset)
            const touchX = touch.clientX - containerRect.left + offsetX
            const touchY = touch.clientY - containerRect.top + offsetY
            const cursorRadiusSquared = cursorRadius * cursorRadius
            const clickForce = cursorConfig.clickForce || 10

            const touchContainerWidth = containerRef.current?.clientWidth || 400
            const touchContainerHeight =
                containerRef.current?.clientHeight || 400
            const touchCanvasWidth =
                touchContainerWidth * canvasOverflowMultiplier
            const touchCanvasHeight =
                touchContainerHeight * canvasOverflowMultiplier
            const currentCamera = cameraRef.current

            // Convert touch point from screen space to 3D world space
            // Normalize touch coordinates to NDC (Normalized Device Coordinates) using canvas dimensions
            const ndcX = (touchX / touchCanvasWidth) * 2 - 1
            const ndcY = 1 - (touchY / touchCanvasHeight) * 2

            // Create a ray from camera through the touch point
            const touchRay = new Vector3(ndcX, ndcY, 0.5)
            touchRay.unproject(currentCamera)

            // Get camera position in world space
            const cameraWorldPos = new Vector3()
            cameraWorldPos.setFromMatrixPosition(currentCamera.matrixWorld)

            // Calculate direction from camera through touch point
            const touchDirection = new Vector3()
            touchDirection.subVectors(touchRay, cameraWorldPos).normalize()

            // Estimate touch point in world space (at sphere distance)
            const sphereCenter = new Vector3(0, 0, 0)
            const cameraToCenter = new Vector3()
            cameraToCenter.subVectors(sphereCenter, cameraWorldPos)
            const sphereDistance = cameraToCenter.length()
            const touchWorldPos = new Vector3()
            touchWorldPos.copy(cameraWorldPos)
            touchWorldPos.addScaledVector(touchDirection, sphereDistance)

            // Apply scatter velocity to particles (velocity-based, radial in 3D)
            for (let i = 0; i < baseParticlePositionsRef.current.length; i++) {
                const basePos = baseParticlePositionsRef.current[i]
                const displacement = particleDisplacementsRef.current[i]
                const scatterVelocity = particleScatterVelocitiesRef.current[i]

                // Calculate current position: base position + displacement, then rotated by group
                const currentLocalPos = new Vector3()
                currentLocalPos.copy(basePos)
                currentLocalPos.add(displacement)

                // Transform to world space (apply group rotation)
                const worldPos = new Vector3()
                worldPos.copy(currentLocalPos)
                worldPos.applyMatrix4(particlesGroup.matrixWorld)

                // Project 3D position to 2D screen space for distance check (using canvas dimensions)
                const projected = worldPos.clone().project(currentCamera)
                const screenX = (projected.x * 0.5 + 0.5) * touchCanvasWidth
                const screenY = (-projected.y * 0.5 + 0.5) * touchCanvasHeight

                // Calculate distance from touch point to particle in screen space
                const dx = touchX - screenX
                const dy = touchY - screenY
                const distanceSquared = dx * dx + dy * dy

                if (
                    distanceSquared < cursorRadiusSquared &&
                    distanceSquared > 0
                ) {
                    // Calculate scatter force based on screen distance
                    const screenDistance = Math.sqrt(distanceSquared)
                    const force =
                        ((cursorRadius - screenDistance) / cursorRadius) *
                        clickForce

                    // Calculate radial direction in 3D: from touch point to particle
                    const radialDirection = new Vector3()
                    radialDirection.subVectors(worldPos, touchWorldPos)
                    const radialDistance = radialDirection.length()

                    if (radialDistance > 0.001) {
                        radialDirection.normalize()

                        // Apply scatter velocity along radial direction (in world space)
                        const scatterMagnitude = force * 0.5 // Velocity multiplier
                        const worldScatter = new Vector3()
                        worldScatter.copy(radialDirection)
                        worldScatter.multiplyScalar(scatterMagnitude)

                        // Transform world scatter back to local space (inverse of group rotation)
                        const localScatter = new Vector3()
                        localScatter.copy(worldScatter)
                        const inverseGroupMatrix = new Matrix4()
                        inverseGroupMatrix
                            .copy(particlesGroup.matrixWorld)
                            .invert()
                        localScatter.applyMatrix4(inverseGroupMatrix)

                        // Set scatter velocity (adds to existing velocity for momentum)
                        scatterVelocity.add(localScatter)
                    }
                }
            }

            // Start animation to ensure scatter effect is visible
            startAnimation()
        }

        // Only add cursor interaction event listeners if enabled
        if (cursorConfig.enabled) {
            canvas.addEventListener("mousemove", handleMouseMoveCursor)
            canvas.addEventListener("mouseleave", handleMouseLeaveCursor)
            canvas.addEventListener("click", handleClick)
            canvas.addEventListener("touchmove", handleTouchMove, {
                passive: false,
            })
            canvas.addEventListener("touchstart", handleTouchStart, {
                passive: false,
            })
            canvas.addEventListener("touchend", handleTouchEnd)
            canvas.addEventListener("touchcancel", handleTouchEnd)
        }

        // Resize handler
        const handleResize = () => {
            if (
                !containerRef.current ||
                !cameraRef.current ||
                !rendererRef.current
            )
                return

            const newWidth =
                containerRef.current.clientWidth ||
                containerRef.current.offsetWidth ||
                400
            const newHeight =
                containerRef.current.clientHeight ||
                containerRef.current.offsetHeight ||
                400

            // Calculate new canvas dimensions with overflow
            const newCanvasWidth = newWidth * canvasOverflowMultiplier
            const newCanvasHeight = newHeight * canvasOverflowMultiplier
            const newOffsetX = (newCanvasWidth - newWidth) / 2
            const newOffsetY = (newCanvasHeight - newHeight) / 2

            cameraRef.current.aspect = newCanvasWidth / newCanvasHeight // Use canvas aspect ratio
            cameraRef.current.updateProjectionMatrix()

            // Update camera distance based on scale - ensure it stays outside sphere
            const baseCameraDistance = 3.0
            const currentSphereRadius = 1.0 * scaleMultiplier
            const cameraDistance = Math.max(
                baseCameraDistance,
                currentSphereRadius + 1.0
            )
            cameraRef.current.position.z = cameraDistance

            // Update canvas size and position
            rendererRef.current.setSize(newCanvasWidth, newCanvasHeight)
            const canvasEl = rendererRef.current.domElement
            canvasEl.style.left = `-${newOffsetX}px`
            canvasEl.style.top = `-${newOffsetY}px`
            canvasEl.style.width = `${newCanvasWidth}px`
            canvasEl.style.height = `${newCanvasHeight}px`

            rendererRef.current.render(sceneRef.current!, cameraRef.current)
        }

        // Canvas resize detection using zoom probe
        if (isCanvas && typeof window !== "undefined") {
            const TICK_MS = 250 // throttle to 4Hz
            const EPS_ZOOM = 0.001
            const EPS_SIZE = 0.5
            const EPS_ASPECT = 0.001

            let rafId = 0
            const tick = (now?: number) => {
                const probe = zoomProbeRef.current
                if (probe && containerRef.current) {
                    const currentZoom = probe.getBoundingClientRect().width / 20
                    const rect = containerRef.current.getBoundingClientRect()
                    const cw = rect.width
                    const ch = rect.height
                    const aspect = cw / ch

                    const timeOk =
                        !lastResizeRef.current.ts ||
                        (now || performance.now()) - lastResizeRef.current.ts >=
                            TICK_MS
                    const zoomChanged =
                        Math.abs(currentZoom - lastResizeRef.current.zoom) >
                        EPS_ZOOM
                    const sizeChanged =
                        Math.abs(cw - lastResizeRef.current.w) > EPS_SIZE ||
                        Math.abs(ch - lastResizeRef.current.h) > EPS_SIZE
                    const aspectChanged =
                        Math.abs(aspect - lastResizeRef.current.aspect) >
                        EPS_ASPECT

                    if (
                        timeOk &&
                        (zoomChanged || sizeChanged || aspectChanged)
                    ) {
                        lastResizeRef.current = {
                            ts: now || performance.now(),
                            zoom: currentZoom,
                            w: cw,
                            h: ch,
                            aspect,
                        }
                        handleResize()
                    }
                }
                rafId = requestAnimationFrame(tick)
            }
            rafId = requestAnimationFrame(tick)

            // Cleanup for canvas mode
            return () => {
                cancelAnimationFrame(rafId)
                if (animationFrameId !== null) {
                    cancelAnimationFrame(animationFrameId)
                }
                if (animationFrameRef.current) {
                    cancelAnimationFrame(animationFrameRef.current)
                }
                if (drag) {
                    canvas.removeEventListener("mousedown", handleMouseDown)
                }
                if (stopOnHover) {
                    canvas.removeEventListener(
                        "mousemove",
                        handleMouseMoveHover
                    )
                }
                // Remove cursor interaction event listeners if they were added
                if (cursorConfig.enabled) {
                    canvas.removeEventListener(
                        "mousemove",
                        handleMouseMoveCursor
                    )
                    canvas.removeEventListener(
                        "mouseleave",
                        handleMouseLeaveCursor
                    )
                    canvas.removeEventListener("click", handleClick)
                    canvas.removeEventListener("touchmove", handleTouchMove)
                    canvas.removeEventListener("touchstart", handleTouchStart)
                    canvas.removeEventListener("touchend", handleTouchEnd)
                    canvas.removeEventListener("touchcancel", handleTouchEnd)
                }
                if (rendererRef.current) {
                    rendererRef.current.dispose()
                    if (containerRef.current && canvas.parentNode) {
                        containerRef.current.removeChild(canvas)
                    }
                }
                if (particlesRef.current) {
                    if (particlesRef.current.geometry) {
                        particlesRef.current.geometry.dispose()
                    }
                    if (particlesRef.current.material) {
                        if (Array.isArray(particlesRef.current.material)) {
                            particlesRef.current.material.forEach((mat: any) =>
                                mat.dispose()
                            )
                        } else {
                            particlesRef.current.material.dispose()
                        }
                    }
                }
            }
        }

        // Preview/Live: use ResizeObserver
        const resizeObserver = new ResizeObserver(() => handleResize())
        resizeObserver.observe(container)
        window.addEventListener("resize", handleResize)

        // Cleanup for preview/live mode
        return () => {
            resizeObserver.disconnect()
            window.removeEventListener("resize", handleResize)
            if (animationFrameId !== null) {
                cancelAnimationFrame(animationFrameId)
            }
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current)
            }
            if (drag) {
                canvas.removeEventListener("mousedown", handleMouseDown)
            }
            if (stopOnHover) {
                canvas.removeEventListener("mousemove", handleMouseMoveHover)
            }
            // Remove cursor interaction event listeners if they were added
            if (cursorConfig.enabled) {
                canvas.removeEventListener("mousemove", handleMouseMoveCursor)
                canvas.removeEventListener("mouseleave", handleMouseLeaveCursor)
                canvas.removeEventListener("click", handleClick)
                canvas.removeEventListener("touchmove", handleTouchMove)
                canvas.removeEventListener("touchstart", handleTouchStart)
                canvas.removeEventListener("touchend", handleTouchEnd)
                canvas.removeEventListener("touchcancel", handleTouchEnd)
            }
            if (rendererRef.current) {
                rendererRef.current.dispose()
                if (containerRef.current && canvas.parentNode) {
                    containerRef.current.removeChild(canvas)
                }
            }
            if (particlesRef.current) {
                if (particlesRef.current.geometry) {
                    particlesRef.current.geometry.dispose()
                }
                if (particlesRef.current.material) {
                    if (Array.isArray(particlesRef.current.material)) {
                        particlesRef.current.material.forEach((mat: any) =>
                            mat.dispose()
                        )
                    } else {
                        particlesRef.current.material.dispose()
                    }
                }
            }
        }
    }, [
        particlesCount,
        speed,
        smoothing,
        scale,
        stopOnHover,
        rotationDirection,
        dragSpeed,
        drag,
        particleScale,
        cursorOn,
        clickForce,
        cursorRadius,
        cursorStrength,
        sphereColor,
        rotationSpeed,
        scaleMultiplier,
        particleSize,
        isCanvas,
    ])

    // Container styles
    const containerStyle: React.CSSProperties = {
        ...style,
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "visible", // Allow canvas to extend beyond container bounds
    }

    return (
        <div style={containerStyle}>
            {/* Zoom probe for canvas mode resize detection */}
            <div
                ref={zoomProbeRef}
                style={{
                    position: "absolute",
                    width: 20,
                    height: 20,
                    opacity: 0,
                    pointerEvents: "none",
                }}
            />
            <div
                ref={containerRef}
                style={{
                    width: "100%",
                    height: "100%",
                    position: "relative",
                    overflow: "visible",
                }}
            />
        </div>
    )
}

// Property Controls
const COMPONENT_DEFAULTS = {
    particlesCount: 10000,
    particleScale: 4,
    rotationDirection: "clockwise",
    speed: 20,
    scale: 10,
    drag: true,
    smoothing: 7,
    dragSpeed: 5,
    stopOnHover: false,
    cursorOn: true,
    cursorRadiusUI: 75,
    cursorStrengthUI: 10,
    clickForce: 5,
    sphereColor: "#ffffff",
}

ParticleSphereRefactor.displayName = "Particle Sphere"
