import React, { useEffect, useRef, useMemo } from 'react';

import {
    Scene,
    PerspectiveCamera,
    WebGLRenderer,
    Color,
    SphereGeometry,
    MeshBasicMaterial,
    InstancedMesh,
    Matrix4,
    Group,
    Vector3,
    AdditiveBlending,
} from 'three';

interface ParticleSphereRefactorProps {
    particlesCount?: number;
    particleScale?: number;
    speed?: number;
    smoothing?: number;
    scale?: number;
    stopOnHover?: boolean;
    rotationDirection?: 'clockwise' | 'anticlockwise';
    dragSpeed?: number;
    drag?: boolean;
    cursorOn?: boolean;
    cursorRadiusUI?: number;
    cursorStrengthUI?: number;
    clickForce?: number;
    sphereColor?: string;
    style?: React.CSSProperties;
}

const RenderTarget = {
    current: () => 'preview',
    canvas: 'canvas',
    export: 'export',
    thumbnail: 'thumbnail',
    preview: 'preview',
};

// CSS variable token and color parsing (hex/rgba/var())
const cssVariableRegex =
    /var\s*\(\s*(--[\w-]+)(?:\s*,\s*((?:[^)(]+|\((?:[^)(]+|\([^)(]*\))*\))*))?\s*\)/;

function extractDefaultValue(cssVar: string): string {
    if (!cssVar || !cssVar.startsWith('var(')) return cssVar;
    const match = cssVariableRegex.exec(cssVar);
    if (!match) return cssVar;
    const fallback = (match[2] || '').trim();
    if (fallback.startsWith('var(')) return extractDefaultValue(fallback);
    return fallback || cssVar;
}

function resolveTokenColor(input: any): any {
    if (typeof input !== 'string') return input;
    if (!input.startsWith('var(')) return input;
    return extractDefaultValue(input);
}

// Parse color string to RGBA values (0-1 range)
function parseColorToRgba(input: string | undefined): {
    r: number;
    g: number;
    b: number;
    a: number;
} {
    if (!input || input.trim() === '') return { r: 0, g: 0, b: 0, a: 0 };
    const str = input.trim();

    // Handle rgba() format
    const rgbaMatch = str.match(
        /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/i
    );
    if (rgbaMatch) {
        const r = Math.max(0, Math.min(255, parseFloat(rgbaMatch[1]))) / 255;
        const g = Math.max(0, Math.min(255, parseFloat(rgbaMatch[2]))) / 255;
        const b = Math.max(0, Math.min(255, parseFloat(rgbaMatch[3]))) / 255;
        const a =
            rgbaMatch[4] !== undefined
                ? Math.max(0, Math.min(1, parseFloat(rgbaMatch[4])))
                : 1;
        return { r, g, b, a };
    }

    // Handle hex formats
    const hex = str.replace(/^#/, '');
    if (hex.length === 8) {
        return {
            r: parseInt(hex.slice(0, 2), 16) / 255,
            g: parseInt(hex.slice(2, 4), 16) / 255,
            b: parseInt(hex.slice(4, 6), 16) / 255,
            a: parseInt(hex.slice(6, 8), 16) / 255,
        };
    }
    if (hex.length === 6) {
        return {
            r: parseInt(hex.slice(0, 2), 16) / 255,
            g: parseInt(hex.slice(2, 4), 16) / 255,
            b: parseInt(hex.slice(4, 6), 16) / 255,
            a: 1,
        };
    }
    if (hex.length === 4) {
        return {
            r: parseInt(hex[0] + hex[0], 16) / 255,
            g: parseInt(hex[1] + hex[1], 16) / 255,
            b: parseInt(hex[2] + hex[2], 16) / 255,
            a: parseInt(hex[3] + hex[3], 16) / 255,
        };
    }
    if (hex.length === 3) {
        return {
            r: parseInt(hex[0] + hex[0], 16) / 255,
            g: parseInt(hex[1] + hex[1], 16) / 255,
            b: parseInt(hex[2] + hex[2], 16) / 255,
            a: 1,
        };
    }
    return { r: 0, g: 0, b: 0, a: 1 };
}

// Value mapping functions
function mapLinear(
    value: number,
    inMin: number,
    inMax: number,
    outMin: number,
    outMax: number
): number {
    if (inMax === inMin) return outMin;
    const t = (value - inMin) / (inMax - inMin);
    return outMin + t * (outMax - outMin);
}

// Speed: UI [0.1..1] → internal [0.01..0.05] (rotation speed multiplier)
function mapSpeedUiToInternal(ui: number): number {
    return mapLinear(ui, 0.1, 1.0, 0.01, 0.05);
}

// Scale: UI [0..1] → scale multiplier [0.5..3.0] (overall sphere size multiplier)
function mapScaleUiToMultiplier(ui: number): number {
    const clamped = Math.max(0, Math.min(1, ui));
    return mapLinear(clamped, 0, 1.0, 0.25, 1.25);
}

// Particle Size: UI [0.1..1] → size [0.01..0.1] (individual particle size)
function mapParticleSizeUiToInternal(ui: number): number {
    const clamped = Math.max(0.1, Math.min(1, ui));
    return mapLinear(clamped, 0.1, 1.0, 0.01, 0.1);
}

// Cursor Strength: UI [0..1] → force multiplier [0..15]
function mapCursorStrengthUiToMultiplier(ui: number): number {
    const clamped = Math.max(0, Math.min(1, ui));
    return mapLinear(clamped, 0, 1.0, 0, 30);
}

// Cursor interaction constants
const CURSOR_PHYSICS = {
    RETURN_FORCE: 0.005,
    FRICTION: 0.94,
} as const;

const COMPONENT_DEFAULTS = {
    particlesCount: 2000,
    particleScale: 8,
    speed: 20,
    smoothing: 7,
    scale: 10,
    stopOnHover: false,
    rotationDirection: 'clockwise' as const,
    dragSpeed: 5,
    drag: true,
    cursorOn: true,
    cursorRadiusUI: 75,
    cursorStrengthUI: 10,
    clickForce: 5,
    sphereColor: '#BE3014',
};

export default function ParticleSphereRefactor(props: ParticleSphereRefactorProps = {}) {
    const {
        particlesCount = COMPONENT_DEFAULTS.particlesCount,
        particleScale = COMPONENT_DEFAULTS.particleScale,
        speed = COMPONENT_DEFAULTS.speed,
        smoothing = COMPONENT_DEFAULTS.smoothing,
        scale = COMPONENT_DEFAULTS.scale,
        stopOnHover = COMPONENT_DEFAULTS.stopOnHover,
        rotationDirection = COMPONENT_DEFAULTS.rotationDirection,
        dragSpeed = COMPONENT_DEFAULTS.dragSpeed,
        drag = COMPONENT_DEFAULTS.drag,
        cursorOn = COMPONENT_DEFAULTS.cursorOn,
        cursorRadiusUI = COMPONENT_DEFAULTS.cursorRadiusUI,
        cursorStrengthUI = COMPONENT_DEFAULTS.cursorStrengthUI,
        clickForce = COMPONENT_DEFAULTS.clickForce,
        sphereColor = COMPONENT_DEFAULTS.sphereColor,
        style,
    } = props;

    const containerRef = useRef<HTMLDivElement>(null);
    const isCanvasRef = useRef<boolean | null>(null);

    // Scene refs
    const sceneRef = useRef<Scene | null>(null);
    const cameraRef = useRef<PerspectiveCamera | null>(null);
    const rendererRef = useRef<WebGLRenderer | null>(null);
    const particlesGroupRef = useRef<Group | null>(null);

    // Animation state
    const animationIdRef = useRef<{ current: number | null }>({ current: null });
    const isDraggingRef = useRef(false);
    const isHoveringRef = useRef(false);
    const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);
    const rotationRef = useRef({ x: 0, y: 0 });
    const targetRotationRef = useRef({ x: 0, y: 0 });
    const velocityRef = useRef({ x: 0, y: 0 });
    const lastFrameTimeRef = useRef(0);

    // Cursor interaction state
    const mouseRef = useRef<{ x: number; y: number } | null>(null);
    const baseParticlePositionsRef = useRef<Vector3[]>([]);
    const particleDisplacementsRef = useRef<Vector3[]>([]);
    const scatterVelocitiesRef = useRef<Vector3[]>([]);

    const isCanvas = isCanvasRef.current;

    // Map UI speed to internal speed
    const rotationSpeed = useMemo(() => {
        const baseSpeed = mapSpeedUiToInternal(speed / 10);
        return rotationDirection === 'anticlockwise' ? -baseSpeed : baseSpeed;
    }, [speed, rotationDirection]);

    const smoothingN = smoothing / 10;
    const scaleN = scale / 10;
    const sizeN = particleScale / 10;
    const dragN = dragSpeed / 10;
    const strengthN = cursorStrengthUI / 10;
    const cursorRadius = Math.max(0, Math.min(600, cursorRadiusUI));
    const cursorStrength = useMemo(() => mapCursorStrengthUiToMultiplier(strengthN), [strengthN]);

    const particleSize = useMemo(() => mapParticleSizeUiToInternal(sizeN), [sizeN]);
    const scaleMultiplier = useMemo(() => mapScaleUiToMultiplier(scaleN), [scaleN]);

    useEffect(() => {
        if (!containerRef.current) return;

        const container = containerRef.current;
        const containerWidth = container.clientWidth || container.offsetWidth || 400;
        const containerHeight = container.clientHeight || container.offsetHeight || 400;

        // Canvas overflow multiplier
        const canvasOverflowMultiplier = 2.5;
        const canvasWidth = containerWidth * canvasOverflowMultiplier;
        const canvasHeight = containerHeight * canvasOverflowMultiplier;

        // Scene setup
        const scene = new Scene();
        sceneRef.current = scene;

        // Calculate adjusted FOV
        const baseFOV = 50;
        const adjustedFOV =
            2 * Math.atan(Math.tan((baseFOV * Math.PI) / 180 / 2) * canvasOverflowMultiplier) * (180 / Math.PI);

        const camera = new PerspectiveCamera(adjustedFOV, canvasWidth / canvasHeight, 0.1, 1000);
        const baseCameraDistance = 3.0;
        const currentSphereRadius = 1.0 * scaleMultiplier;
        const cameraDistance = Math.max(baseCameraDistance, currentSphereRadius + 1.0);
        camera.position.z = cameraDistance;
        cameraRef.current = camera;

        // Renderer
        const renderer = new WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(canvasWidth, canvasHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputColorSpace = 'srgb';
        const canvas = renderer.domElement;
        canvas.style.position = 'absolute';
        const offsetX = (canvasWidth - containerWidth) / 2;
        const offsetY = (canvasHeight - containerHeight) / 2;
        canvas.style.left = `-${offsetX}px`;
        canvas.style.top = `-${offsetY}px`;
        canvas.style.width = `${canvasWidth}px`;
        canvas.style.height = `${canvasHeight}px`;
        canvas.style.display = 'block';
        container.appendChild(canvas);
        rendererRef.current = renderer;

        // Check canvas mode
        isCanvasRef.current = RenderTarget.current() === RenderTarget.canvas;

        // Parse color
        const resolvedSphereColor = resolveTokenColor(sphereColor);
        const sphereRgba = parseColorToRgba(resolvedSphereColor || sphereColor);
        const baseColorObj = resolvedSphereColor
            ? new Color(resolvedSphereColor)
            : new Color(sphereRgba.r, sphereRgba.g, sphereRgba.b);

        // Create particles
        const vertices: number[] = [];
        const goldenAngle = Math.PI * (3 - Math.sqrt(5));
        const sphereRadius = 1.0 * scaleMultiplier;

        baseParticlePositionsRef.current = [];
        particleDisplacementsRef.current = [];
        scatterVelocitiesRef.current = [];

        for (let i = 0; i < particlesCount; i++) {
            const y = 1 - (i / (particlesCount - 1)) * 2;
            const radius = Math.sqrt(1 - y * y);
            const theta = goldenAngle * i;

            const x = Math.cos(theta) * radius;
            const z = Math.sin(theta) * radius;

            const posX = x * sphereRadius;
            const posY = y * sphereRadius;
            const posZ = z * sphereRadius;
            vertices.push(posX, posY, posZ);

            baseParticlePositionsRef.current.push(new Vector3(posX, posY, posZ));
            particleDisplacementsRef.current.push(new Vector3(0, 0, 0));
            scatterVelocitiesRef.current.push(new Vector3(0, 0, 0));
        }

        // Create InstancedMesh for spherical particles
        const sphereGeometry = new SphereGeometry(particleSize * 0.1, 8, 8);
        const sphereMaterial = new MeshBasicMaterial({
            color: baseColorObj,
            blending: AdditiveBlending,
            transparent: sphereRgba.a < 1,
            opacity: sphereRgba.a,
        });

        const particles = new InstancedMesh(sphereGeometry, sphereMaterial, particlesCount);
        const matrix = new Matrix4();

        for (let i = 0; i < particlesCount; i++) {
            const idx = i * 3;
            matrix.setPosition(vertices[idx], vertices[idx + 1], vertices[idx + 2]);
            particles.setMatrixAt(i, matrix);
        }
        particles.instanceMatrix.needsUpdate = true;

        const particlesGroup = new Group();
        particlesGroupRef.current = particlesGroup;
        particlesGroup.add(particles);
        scene.add(particlesGroup);

        // Animation loop
        const animate = () => {
            const now = performance.now();
            if (lastFrameTimeRef.current === 0) lastFrameTimeRef.current = now;
            const deltaTime = now - lastFrameTimeRef.current;
            lastFrameTimeRef.current = now;
            const deltaFactor = deltaTime / (1000 / 60);

            const threshold = 0.01;

            // Auto-rotation
            if (!isDraggingRef.current && rotationSpeed !== 0 && !isHoveringRef.current) {
                targetRotationRef.current.x += rotationSpeed * 0.1 * deltaFactor;
            }

            // Apply velocity for throw
            if (!isDraggingRef.current) {
                if (Math.abs(velocityRef.current.x) > threshold || Math.abs(velocityRef.current.y) > threshold) {
                    targetRotationRef.current.x += velocityRef.current.x * deltaFactor;
                    targetRotationRef.current.y += velocityRef.current.y * deltaFactor;
                    targetRotationRef.current.y = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, targetRotationRef.current.y));
                    const decayFactor = Math.pow(0.94, deltaFactor);
                    velocityRef.current.x *= decayFactor;
                    velocityRef.current.y *= decayFactor;
                } else {
                    velocityRef.current.x = 0;
                    velocityRef.current.y = 0;
                }
            }

            // Lerp rotation
            const dx = targetRotationRef.current.x - rotationRef.current.x;
            const dy = targetRotationRef.current.y - rotationRef.current.y;

            if (Math.abs(dx) > threshold || Math.abs(dy) > threshold || isDraggingRef.current) {
                const lerpFactor = smoothingN === 0 ? 1 : mapLinear(smoothingN, 0, 1, 0.4, 0.03);
                const timeLerpFactor = 1 - Math.pow(1 - lerpFactor, deltaFactor);
                rotationRef.current.x += dx * timeLerpFactor;
                rotationRef.current.y += dy * timeLerpFactor;
                rotationRef.current.y = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotationRef.current.y));
            }

            particlesGroup.rotation.y = rotationRef.current.x;
            particlesGroup.rotation.x = rotationRef.current.y;
            particlesGroup.updateMatrixWorld(true);

            // Cursor interaction
            if (cursorOn && baseParticlePositionsRef.current.length > 0 && mouseRef.current) {
                for (let i = 0; i < baseParticlePositionsRef.current.length; i++) {
                    const basePos = baseParticlePositionsRef.current[i];
                    const displacement = particleDisplacementsRef.current[i];

                    // Apply repulsion
                    const mouse = mouseRef.current;
                    if (mouse && rendererRef.current && cameraRef.current) {
                        const camera = cameraRef.current;
                        const currentContainerWidth = container.clientWidth;
                        const currentContainerHeight = container.clientHeight;
                        const currentCanvasWidth = currentContainerWidth * 2.5;
                        const currentCanvasHeight = currentContainerHeight * 2.5;

                        // Screen to world projection
                        const currentLocalPos = new Vector3().copy(basePos).add(displacement);
                        const worldPos = new Vector3().copy(currentLocalPos).applyMatrix4(particlesGroup.matrixWorld);
                        const projected = worldPos.clone().project(camera);
                        const screenX = (projected.x * 0.5 + 0.5) * currentCanvasWidth;
                        const screenY = (-projected.y * 0.5 + 0.5) * currentCanvasHeight;

                        const dx = mouse.x - screenX;
                        const dy = mouse.y - screenY;
                        const distanceSquared = dx * dx + dy * dy;
                        const cursorRadiusSquared = cursorRadius * cursorRadius;

                        if (distanceSquared < cursorRadiusSquared && distanceSquared > 0 && worldPos.z > 0) {
                            const distance = Math.sqrt(distanceSquared);
                            const force = (cursorRadius - distance) / cursorRadius;
                            const angle = Math.atan2(dy, dx);

                            const cameraRight = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
                            const cameraUp = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();

                            const repulsion2D = force * cursorStrength * (speed / 10) * (deltaFactor / (1000 / 60));
                            const repulsionX = -Math.cos(angle) * repulsion2D * 0.01;
                            const repulsionY = Math.sin(angle) * repulsion2D * 0.01;

                            const worldRepulsion = new Vector3()
                                .addScaledVector(cameraRight, repulsionX)
                                .addScaledVector(cameraUp, repulsionY);

                            const inverseMatrix = new Matrix4().copy(particlesGroup.matrixWorld).invert();
                            const localRepulsion = new Vector3().copy(worldRepulsion).applyMatrix4(inverseMatrix);
                            displacement.add(localRepulsion);
                        }
                    }

                    // Apply friction and return force
                    const frictionFactor = Math.pow(CURSOR_PHYSICS.FRICTION, deltaFactor / (1000 / 60));
                    const returnForce = CURSOR_PHYSICS.RETURN_FORCE * (speed / 10) * (deltaFactor / (1000 / 60));
                    displacement.multiplyScalar(frictionFactor);
                    displacement.multiplyScalar(1 - returnForce);
                }
            }

            // Update particle positions
            for (let i = 0; i < particlesCount; i++) {
                const basePos = baseParticlePositionsRef.current[i];
                const displacement = particleDisplacementsRef.current[i];
                const finalPos = new Vector3().copy(basePos).add(displacement);
                matrix.setPosition(finalPos.x, finalPos.y, finalPos.z);
                particles.setMatrixAt(i, matrix);
            }
            particles.instanceMatrix.needsUpdate = true;

            // Render
            renderer.render(scene, camera);

            // Continue animation
            const hasVelocity = Math.abs(velocityRef.current.x) > threshold || Math.abs(velocityRef.current.y) > threshold;
            const hasLerp = Math.abs(dx) > threshold || Math.abs(dy) > threshold;
            const hasCursorInteraction = cursorOn && particleDisplacementsRef.current.some(d => Math.abs(d.x) > threshold || Math.abs(d.y) > threshold || Math.abs(d.z) > threshold);

            const needsContinue =
                isCanvas ||
                isDraggingRef.current ||
                (rotationSpeed !== 0) ||
                hasVelocity ||
                hasLerp ||
                hasCursorInteraction;

            if (needsContinue) {
                animationIdRef.current.current = requestAnimationFrame(animate);
            }
        };

        // Start animation
        lastFrameTimeRef.current = performance.now();
        animationIdRef.current.current = requestAnimationFrame(animate);

        // Mouse event handlers
        const canvasElement = canvas;

        const handleMouseDown = (e: MouseEvent) => {
            if (!drag) return;
            isDraggingRef.current = true;
            velocityRef.current.x = 0;
            velocityRef.current.y = 0;
            lastMousePosRef.current = { x: e.clientX, y: e.clientY };

            const handleMouseMove = (e: MouseEvent) => {
                if (!lastMousePosRef.current) return;
                const curTime = performance.now();
                const dx = e.clientX - lastMousePosRef.current.x;
                const dy = e.clientY - lastMousePosRef.current.y;
                const timeDif = curTime - lastMousePosRef.current.y;

                const sensitivity = mapLinear(dragN, 0, 1, 0.001, 0.02);
                targetRotationRef.current.x += dx * sensitivity;
                targetRotationRef.current.y += dy * sensitivity;
                targetRotationRef.current.y = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, targetRotationRef.current.y));

                if (timeDif > 0) {
                    const timeNormalization = 60 / Math.max(timeDif, 1);
                    velocityRef.current.x = dx * sensitivity * 0.3 * timeNormalization;
                    velocityRef.current.y = dy * sensitivity * 0.3 * timeNormalization;
                }

                lastMousePosRef.current = { x: e.clientX, y: e.clientY };
            };

            const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
                isDraggingRef.current = false;
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        };

        const handleMouseMove = (e: MouseEvent) => {
            const rect = container.getBoundingClientRect();
            mouseRef.current = {
                x: e.clientX - rect.left + offsetX,
                y: e.clientY - rect.top + offsetY,
            };
        };

        const handleMouseLeave = () => {
            mouseRef.current = null;
        };

        const handleTouchMove = (e: TouchEvent) => {
            e.preventDefault();
            if (e.touches.length > 0) {
                const touch = e.touches[0];
                const rect = container.getBoundingClientRect();
                mouseRef.current = {
                    x: touch.clientX - rect.left + offsetX,
                    y: touch.clientY - rect.top + offsetY,
                };
            }
        };

        const handleTouchEnd = () => {
            mouseRef.current = null;
        };

        if (cursorOn) {
            canvasElement.addEventListener('mousemove', handleMouseMove);
            canvasElement.addEventListener('mouseleave', handleMouseLeave);
            canvasElement.addEventListener('touchmove', handleTouchMove as any, { passive: false });
            canvasElement.addEventListener('touchend', handleTouchEnd);
        }

        if (drag) {
            canvasElement.addEventListener('mousedown', handleMouseDown);
        }

        // Cleanup
        return () => {
            if (animationIdRef.current.current) {
                cancelAnimationFrame(animationIdRef.current.current);
            }
            if (rendererRef.current) {
                rendererRef.current.dispose();
            }
            if (containerRef.current && containerRef.current.contains(canvas)) {
                containerRef.current.removeChild(canvas);
            }
            canvasElement.removeEventListener('mousedown', handleMouseDown);
            if (cursorOn) {
                canvasElement.removeEventListener('mousemove', handleMouseMove);
                canvasElement.removeEventListener('mouseleave', handleMouseLeave);
                canvasElement.removeEventListener('touchmove', handleTouchMove as any);
                canvasElement.removeEventListener('touchend', handleTouchEnd);
            }
        };
    }, [
        particlesCount, particleScale, speed, smoothing, scale,
        stopOnHover, rotationDirection, dragSpeed, drag,
        cursorOn, cursorRadiusUI, cursorStrengthUI, clickForce, sphereColor
    ]);

    return (
        <div
            ref={containerRef}
            style={{
                width: '100%',
                height: '100%',
                ...style,
            }}
        />
    );
}