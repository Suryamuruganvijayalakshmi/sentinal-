/* eslint-disable */
// Globe — Originkit Aerospace Situational Awareness Globe
// High-fidelity 3D Earth with aligned country borders, sovereign labels, ground stations, and orbital asset tracks

"use client";

import React, { useEffect, useRef, useState, type CSSProperties } from "react";
import {
    Scene,
    PerspectiveCamera,
    WebGLRenderer,
    SphereGeometry,
    MeshBasicMaterial,
    LineBasicMaterial,
    LineDashedMaterial,
    Line,
    LineLoop,
    LineSegments,
    Float32BufferAttribute,
    BufferGeometry,
    Color,
    Mesh,
    Group,
    InstancedMesh,
    Matrix4,
    Raycaster,
    Vector2,
    Vector3,
    RingGeometry,
    CanvasTexture,
    DoubleSide,
    Sprite,
    SpriteMaterial,
} from "three";
import { geoEquirectangular, geoPath } from "d3-geo";

export type Rgba = { r: number; g: number; b: number; a: number };

export function parseColorToRgba(input: string): Rgba {
    if (!input || input.trim() === "") return { r: 0, g: 0, b: 0, a: 0 };
    const str = input.trim();
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
    const hex = str.replace(/^#/, "");
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

function mapSpeedUiToInternal(ui: number): number {
    if (ui === 0) return 0;
    const clamped = Math.max(0, Math.min(10, ui));
    return mapLinear(clamped, 0, 10, 0, 0.7);
}

function mapDensityUiToSpacing(ui: number): number {
    const clamped = Math.max(1, Math.min(10, ui));
    return mapLinear(clamped, 1, 10, 24, 8);
}

function mapDotSizeUiToMultiplier(ui: number): number {
    const clamped = Math.max(1, Math.min(10, ui));
    return mapLinear(clamped, 1, 10, 0.1, 0.5);
}

function mapMarkerDotSizeUiToMultiplier(ui: number): number {
    const clamped = Math.max(0, Math.min(100, ui));
    return mapLinear(clamped, 0, 100, 0.1, 2.5);
}

function normalizeSmoothing(ui: number): number {
    return Math.max(0, Math.min(1, ui / 10));
}

function mapDragSpeedUiToSensitivity(ui: number): number {
    return mapLinear(Math.max(0, Math.min(10, ui)), 0, 10, 0.001, 0.02);
}

export function latLngToPosition(
    lat: number,
    lng: number
): { x: number; y: number; z: number } {
    const latRad = lat * (Math.PI / 180);
    const lngRad = lng * (Math.PI / 180);
    const x = Math.cos(latRad) * Math.sin(lngRad);
    const y = Math.sin(latRad);
    const z = Math.cos(latRad) * Math.cos(lngRad);
    return { x, y, z };
}

export function positionToLatLng(
    x: number,
    y: number,
    z: number
): { lat: number; lng: number } {
    const r = Math.sqrt(x * x + y * y + z * z);
    if (r === 0) return { lat: 0, lng: 0 };
    const lat = Math.asin(Math.max(-1, Math.min(1, y / r))) * (180 / Math.PI);
    const lng = Math.atan2(x, z) * (180 / Math.PI);
    return { lat, lng };
}

function createCachedLabelMaterial(
    text: string,
    textColor: string = "#e2e8f0",
    borderColor: string = "rgba(56, 189, 248, 0.5)",
    bgColor: string = "rgba(7, 13, 30, 0.82)",
    isPrimary: boolean = false
): SpriteMaterial {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 56;
    const ctx = canvas.getContext("2d")!;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.font = isPrimary ? "bold 21px monospace" : "bold 18px monospace";
    const measured = ctx.measureText(text).width;
    const boxW = Math.min(244, Math.max(72, measured + 28));
    const boxH = isPrimary ? 34 : 28;
    const boxX = (canvas.width - boxW) / 2;
    const boxY = (canvas.height - boxH) / 2;

    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 7);
    ctx.fill();

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = isPrimary ? 2.2 : 1.4;
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1);

    const texture = new CanvasTexture(canvas);
    return new SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
    });
}

export interface Marker {
    lat: number;
    lng: number;
    label?: string;
    type?: "satellite" | "threat" | "ground_station" | "country";
}

export interface MarkerConfig {
    markers: Marker[];
    color: string;
    size: number;
}

export interface DotsConfig {
    color: string;
    size: number;
    density: number;
    allDots: boolean;
}

export interface HoveredPlaceInfo {
    name: string;
    country?: string;
    lat: number;
    lng: number;
    type: string;
}

export interface GroundTrack {
    id: string;
    color: string;
    points: Array<{ lat: number; lng: number }>;
    dashed?: boolean;
}

export interface GlobeProps {
    speed?: number;
    smoothing?: number;
    dots?: DotsConfig;
    fill?: "dots" | "solid";
    fillColor?: string;
    scale?: number;
    stopOnHover?: boolean;
    markerConfig?: MarkerConfig;
    groundTracks?: GroundTrack[];
    direction?: "left" | "right";
    initialLatitude?: number;
    initialLongitude?: number;
    oceanColor?: string;
    outlineColor?: string;
    showOutline?: boolean;
    graticuleColor?: string;
    showGrid?: boolean;
    outlineWidth?: number;
    dragSpeed?: number;
    detail?: number;
    showCountries?: boolean;
    showPlaces?: boolean;
    onHoverLocation?: (info: HoveredPlaceInfo | null) => void;
    style?: CSSProperties;
}

// Well-spaced global country & strategic space region anchors so major landmasses are clearly identified
const MAJOR_COUNTRY_LABELS: { name: string; lat: number; lng: number }[] = [
    { name: "USA", lat: 39.5, lng: -98.3 },
    { name: "CANADA", lat: 58.0, lng: -106.0 },
    { name: "BRAZIL", lat: -12.0, lng: -51.0 },
    { name: "UK", lat: 54.0, lng: -2.0 },
    { name: "FRANCE", lat: 46.5, lng: 2.2 },
    { name: "GERMANY", lat: 51.1, lng: 10.4 },
    { name: "RUSSIA", lat: 61.5, lng: 95.0 },
    { name: "INDIA", lat: 21.5, lng: 79.0 },
    { name: "CHINA", lat: 35.8, lng: 104.2 },
    { name: "JAPAN", lat: 36.2, lng: 138.2 },
    { name: "AUSTRALIA", lat: -25.2, lng: 133.7 },
    { name: "EGYPT", lat: 26.8, lng: 30.8 },
    { name: "SOUTH AFRICA", lat: -29.0, lng: 24.0 },
];

export default function Globe({
    speed = 1.2,
    smoothing = 8,
    dots = { color: "#38bdf8", size: 5, density: 8, allDots: false },
    fill = "dots",
    fillColor = "#162442",
    scale = 8,
    stopOnHover = true,
    markerConfig = { markers: [], color: "#ef4444", size: 40 },
    groundTracks = [],
    direction = "left",
    initialLatitude = 20,
    initialLongitude = -30,
    oceanColor = "#070d1e",
    outlineColor = "#38bdf8",
    showOutline = true,
    graticuleColor = "#1e293b",
    showGrid = true,
    dragSpeed = 5,
    showCountries = true,
    showPlaces = true,
    onHoverLocation,
    style,
}: GlobeProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [hoveredPlace, setHoveredPlace] = useState<HoveredPlaceInfo | null>(null);
    const [placesDatabase, setPlacesDatabase] = useState<{ stations: any[]; countries: any[] }>({
        stations: [],
        countries: [],
    });

    const markerConfigRef = useRef(markerConfig);
    markerConfigRef.current = markerConfig;
    const groundTracksRef = useRef(groundTracks);
    groundTracksRef.current = groundTracks;
    const speedRef = useRef(speed);
    speedRef.current = speed;
    const placesDatabaseRef = useRef(placesDatabase);
    placesDatabaseRef.current = placesDatabase;
    const showCountriesRef = useRef(showCountries);
    showCountriesRef.current = showCountries;
    const showPlacesRef = useRef(showPlaces);
    showPlacesRef.current = showPlaces;
    const onHoverLocationRef = useRef(onHoverLocation);
    onHoverLocationRef.current = onHoverLocation;
    const renderMarkersFnRef = useRef<(() => void) | null>(null);
    const renderStaticLabelsFnRef = useRef<(() => void) | null>(null);

    const dotColorProp = dots.color;
    const dotSizeProp = dots.size;
    const dotDensityProp = dots.density;
    const dotAllDotsProp = dots.allDots;

    useEffect(() => {
        let isMounted = true;
        fetch("/places.json")
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (isMounted && data) {
                    setPlacesDatabase(data);
                }
            })
            .catch(() => {});
        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        if (!containerRef.current) return;
        const container = containerRef.current;
        const containerWidth = container.clientWidth || container.offsetWidth || 600;
        const containerHeight = container.clientHeight || container.offsetHeight || 600;

        const scene = new Scene();
        const camera = new PerspectiveCamera(45, containerWidth / containerHeight, 0.1, 1000);

        const baseRadius = 1.0;
        const globeRadius = baseRadius;

        // Compute dynamic camera distance considering BOTH horizontal & vertical FOV
        // so the entire globe is ALWAYS 100% visible with comfortable margin
        const computeCameraDistance = (width: number, height: number, radius: number) => {
            const aspect = width / height;
            const vFovRad = (camera.fov * Math.PI) / 360;
            const hFovRad = Math.atan(Math.tan(vFovRad) * aspect);
            const minFovRad = Math.min(vFovRad, hFovRad);
            const occupancy = 0.78;
            return radius / (Math.sin(minFovRad) * occupancy);
        };

        const initialCamDist = computeCameraDistance(containerWidth, containerHeight, globeRadius);
        camera.position.set(0, 0, initialCamDist);
        camera.lookAt(0, 0, 0);

        const renderer = new WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(containerWidth, containerHeight, false);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputColorSpace = "srgb";

        const canvas = renderer.domElement;
        canvas.style.position = "absolute";
        canvas.style.inset = "0";
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.display = "block";
        canvas.style.outline = "none";
        canvas.style.cursor = "grab";
        canvas.style.touchAction = "none";
        container.appendChild(canvas);

        const dotSpacing = mapDensityUiToSpacing(dotDensityProp);
        const dotSizeMultiplier = mapDotSizeUiToMultiplier(dotSizeProp);
        const smoothingN = normalizeSmoothing(smoothing);

        const resolvedOceanColor = oceanColor || "#070d1e";
        const resolvedOutlineColor = outlineColor || "#38bdf8";
        const resolvedDotColor = dotColorProp || "#38bdf8";
        const resolvedGraticuleColor = graticuleColor || "#1e293b";

        const oceanRgba = parseColorToRgba(resolvedOceanColor);
        const outlineRgba = parseColorToRgba(resolvedOutlineColor);
        const graticuleRgba = parseColorToRgba(resolvedGraticuleColor);

        // 1. Ocean Sphere
        const oceanGeometry = new SphereGeometry(globeRadius, 64, 64);
        const oceanMaterial = new MeshBasicMaterial({
            color: new Color(resolvedOceanColor),
            transparent: oceanRgba.a < 1,
            opacity: Math.max(0.95, oceanRgba.a),
        });
        const oceanMesh = new Mesh(oceanGeometry, oceanMaterial);

        // Subtle atmospheric perimeter glow halo
        const haloGeometry = new RingGeometry(globeRadius * 1.008, globeRadius * 1.038, 96);
        const haloMaterial = new MeshBasicMaterial({
            color: new Color("#38bdf8"),
            transparent: true,
            opacity: 0.22,
            side: DoubleSide,
            depthTest: false,
        });
        const haloMesh = new Mesh(haloGeometry, haloMaterial);
        scene.add(haloMesh);

        // Main rotating globe group
        const globeGroup = new Group();
        const initialLongitudeRad = (initialLongitude * Math.PI) / 180;
        const initialLatitudeRad = (initialLatitude * Math.PI) / 180;
        globeGroup.rotation.y = initialLongitudeRad;
        globeGroup.rotation.x = initialLatitudeRad;
        globeGroup.add(oceanMesh);
        scene.add(globeGroup);

        // 2. Graticules (Latitude & Longitude reference lines)
        const graticuleGroup = new Group();
        if (showGrid && graticuleRgba.a > 0) {
            const gridSpacing = 20;
            const graticuleMat = new LineBasicMaterial({
                color: new Color(resolvedGraticuleColor),
                transparent: true,
                opacity: Math.max(0.25, graticuleRgba.a * 0.45),
            });

            for (let lat = -80; lat <= 80; lat += gridSpacing) {
                const pts: Vector3[] = [];
                const segments = 64;
                for (let i = 0; i <= segments; i++) {
                    const lng = (i / segments) * 360 - 180;
                    const pos = latLngToPosition(lat, lng);
                    pts.push(
                        new Vector3(
                            pos.x * globeRadius * 1.001,
                            pos.y * globeRadius * 1.001,
                            pos.z * globeRadius * 1.001
                        )
                    );
                }
                graticuleGroup.add(new LineLoop(new BufferGeometry().setFromPoints(pts), graticuleMat));
            }

            for (let lng = -180; lng < 180; lng += gridSpacing) {
                const pts: Vector3[] = [];
                const segments = 64;
                for (let i = 0; i <= segments; i++) {
                    const lat = (i / segments) * 180 - 90;
                    const pos = latLngToPosition(lat, lng);
                    pts.push(
                        new Vector3(
                            pos.x * globeRadius * 1.001,
                            pos.y * globeRadius * 1.001,
                            pos.z * globeRadius * 1.001
                        )
                    );
                }
                graticuleGroup.add(new LineLoop(new BufferGeometry().setFromPoints(pts), graticuleMat));
            }
            globeGroup.add(graticuleGroup);
        }

        // 3. Country Borders, Static Labels, Dynamic Markers & Caches
        const countryBordersGroup = new Group();
        globeGroup.add(countryBordersGroup);

        const staticLabelsGroup = new Group();
        globeGroup.add(staticLabelsGroup);

        const markersGroup = new Group();
        globeGroup.add(markersGroup);

        const staticLabelSprites: { sprite: Sprite; lat: number; lng: number }[] = [];
        const dynamicLabelSprites: { sprite: Sprite; lat: number; lng: number }[] = [];
        const labelMaterialCache = new Map<string, SpriteMaterial>();
        const markerSphereMatCache = new Map<string, MeshBasicMaterial>();
        const markerRingMatCache = new Map<string, MeshBasicMaterial>();
        const unitSphereGeo = new SphereGeometry(1, 16, 16);
        const unitRingGeo = new RingGeometry(1.4, 2.3, 24);

        const getOrCreateLabelSprite = (
            cacheKey: string,
            text: string,
            textColor: string,
            borderColor: string,
            bgColor: string,
            isPrimary: boolean
        ): Sprite => {
            let mat = labelMaterialCache.get(cacheKey);
            if (!mat) {
                mat = createCachedLabelMaterial(text, textColor, borderColor, bgColor, isPrimary);
                labelMaterialCache.set(cacheKey, mat);
            }
            const sprite = new Sprite(mat);
            sprite.scale.set(isPrimary ? 0.34 : 0.25, isPrimary ? 0.075 : 0.055, 1);
            sprite.renderOrder = 4;
            sprite.userData.cached = true;
            return sprite;
        };

        const loadWorldData = async () => {
            try {
                const countryRes = await fetch("/countries_neat.json");
                if (!countryRes.ok || isDisposed) return;
                const countryGeoJson = await countryRes.json();
                if (isDisposed) return;

                // Build crisp vector country border lines
                if (showOutline && showCountries) {
                    const countryLinePositions: number[] = [];
                    const countryRadius = globeRadius * 1.006;

                    const addRing = (ring: number[][]) => {
                        if (!ring || ring.length < 2) return;
                        for (let i = 0; i < ring.length; i++) {
                            const curr = ring[i];
                            const next = ring[(i + 1) % ring.length];
                            const p1 = latLngToPosition(curr[1], curr[0]);
                            const p2 = latLngToPosition(next[1], next[0]);
                            countryLinePositions.push(
                                p1.x * countryRadius,
                                p1.y * countryRadius,
                                p1.z * countryRadius,
                                p2.x * countryRadius,
                                p2.y * countryRadius,
                                p2.z * countryRadius
                            );
                        }
                    };

                    countryGeoJson.features.forEach((feature: any) => {
                        const geom = feature.geometry;
                        if (!geom) return;
                        if (geom.type === "Polygon") {
                            geom.coordinates.forEach((ring: number[][]) => addRing(ring));
                        } else if (geom.type === "MultiPolygon") {
                            geom.coordinates.forEach((poly: number[][][]) => {
                                poly.forEach((ring: number[][]) => addRing(ring));
                            });
                        }
                    });

                    if (countryLinePositions.length > 0) {
                        const countryGeo = new BufferGeometry();
                        countryGeo.setAttribute(
                            "position",
                            new Float32BufferAttribute(countryLinePositions, 3)
                        );
                        const countryMat = new LineBasicMaterial({
                            color: new Color(resolvedOutlineColor),
                            transparent: true,
                            opacity: Math.max(0.85, outlineRgba.a),
                            depthTest: true,
                            depthWrite: false,
                        });
                        const countrySegments = new LineSegments(countryGeo, countryMat);
                        countrySegments.renderOrder = 2;
                        countryBordersGroup.add(countrySegments);
                    }
                }

                // Rasterize land polygons onto bitmap for exact spherical land-test & aligned landmass texture
                const bitmapWidth = 1024;
                const bitmapHeight = 512;
                const offscreenCanvas = document.createElement("canvas");
                offscreenCanvas.width = bitmapWidth;
                offscreenCanvas.height = bitmapHeight;
                const ctx = offscreenCanvas.getContext("2d", { willReadFrequently: true });

                if (ctx) {
                    const projection = geoEquirectangular().fitSize(
                        [bitmapWidth, bitmapHeight],
                        { type: "Sphere" } as any
                    );
                    const pathGen = geoPath().projection(projection).context(ctx);
                    ctx.fillStyle = "#000";
                    ctx.fillRect(0, 0, bitmapWidth, bitmapHeight);
                    ctx.fillStyle = "#fff";
                    countryGeoJson.features.forEach((f: any) => {
                        ctx.beginPath();
                        pathGen(f);
                        ctx.fill();
                    });

                    const imgData = ctx.getImageData(0, 0, bitmapWidth, bitmapHeight);
                    const pixels = imgData.data;
                    const isOnLand = (lng: number, lat: number) => {
                        let normLng = ((((lng + 180) % 360) + 360) % 360) - 180;
                        const x = Math.round(((normLng + 180) / 360) * bitmapWidth) % bitmapWidth;
                        const y = Math.round(((90 - lat) / 180) * bitmapHeight);
                        const clampedY = Math.max(0, Math.min(bitmapHeight - 1, y));
                        const idx = (clampedY * bitmapWidth + x) * 4;
                        return pixels[idx] > 120;
                    };

                    // Re-map land silhouette texture specifically for Three.js SphereGeometry UV convention
                    // SphereGeometry maps u in [0..1] to lng = u*360 - 90, and with flipY=true maps ty=0 to lat=+90
                    const fillCanvas = document.createElement("canvas");
                    fillCanvas.width = bitmapWidth;
                    fillCanvas.height = bitmapHeight;
                    const fctx = fillCanvas.getContext("2d")!;
                    const fillImg = fctx.createImageData(bitmapWidth, bitmapHeight);
                    const fData = fillImg.data;
                    const landColor = parseColorToRgba(fillColor || "#162442");
                    const lr = Math.round(landColor.r * 255);
                    const lg = Math.round(landColor.g * 255);
                    const lb = Math.round(landColor.b * 255);

                    for (let ty = 0; ty < bitmapHeight; ty++) {
                        const lat = 90 - (ty / bitmapHeight) * 180;
                        for (let tx = 0; tx < bitmapWidth; tx++) {
                            const u = tx / bitmapWidth;
                            let lng = u * 360 - 90;
                            lng = ((((lng + 180) % 360) + 360) % 360) - 180;
                            const idx = (ty * bitmapWidth + tx) * 4;
                            if (isOnLand(lng, lat)) {
                                fData[idx] = lr;
                                fData[idx + 1] = lg;
                                fData[idx + 2] = lb;
                                fData[idx + 3] = 240;
                            } else {
                                fData[idx + 3] = 0;
                            }
                        }
                    }
                    fctx.putImageData(fillImg, 0, 0);

                    const landTexture = new CanvasTexture(fillCanvas);
                    landTexture.flipY = true;
                    landTexture.needsUpdate = true;

                    const landGeo = new SphereGeometry(globeRadius * 1.001, 64, 64);
                    const landMat = new MeshBasicMaterial({
                        map: landTexture,
                        transparent: true,
                        opacity: 0.95,
                    });
                    const landMesh = new Mesh(landGeo, landMat);
                    landMesh.renderOrder = 1;
                    globeGroup.add(landMesh);

                    // Add Instanced Dots Matrix perfectly aligned on land
                    const dotCoords: [number, number][] = [];
                    const baseStep = Math.max(2.4, dotSpacing * 0.22);
                    for (let lat = -85; lat <= 85; lat += baseStep) {
                        const latRad = (Math.abs(lat) * Math.PI) / 180;
                        const cosLat = Math.cos(latRad);
                        const lngStep = cosLat > 0.05 ? baseStep / Math.max(0.3, cosLat) : 360;
                        for (let lng = -180; lng < 180; lng += lngStep) {
                            if (dotAllDotsProp || isOnLand(lng, lat)) {
                                dotCoords.push([lng, lat]);
                            }
                        }
                    }

                    if (dotCoords.length > 0 && fill === "dots") {
                        const dotRadius = 0.006 * dotSizeMultiplier;
                        const dotGeo = new SphereGeometry(dotRadius, 6, 6);
                        const dotMat = new MeshBasicMaterial({
                            color: new Color(resolvedDotColor),
                            transparent: true,
                            opacity: 0.85,
                            depthTest: true,
                            depthWrite: false,
                        });
                        const instMesh = new InstancedMesh(dotGeo, dotMat, dotCoords.length);
                        instMesh.renderOrder = 2;
                        const matrix = new Matrix4();
                        const dotSurfaceR = globeRadius * 1.003;
                        for (let i = 0; i < dotCoords.length; i++) {
                            const [lng, lat] = dotCoords[i];
                            const p = latLngToPosition(lat, lng);
                            matrix.makeScale(1, 1, 1);
                            matrix.setPosition(
                                p.x * dotSurfaceR,
                                p.y * dotSurfaceR,
                                p.z * dotSurfaceR
                            );
                            instMesh.setMatrixAt(i, matrix);
                        }
                        instMesh.instanceMatrix.needsUpdate = true;
                        globeGroup.add(instMesh);
                    }
                }

                renderMarkersAndLabels();
                renderer.render(scene, camera);
            } catch (err) {
                console.warn("[Globe] Data load fallback:", err);
            }
        };

        let isDisposed = false;

        const clearDynamicMarkersGroup = () => {
            while (markersGroup.children.length > 0) {
                const child = markersGroup.children[0] as any;
                if (child.geometry && child.geometry !== unitSphereGeo && child.geometry !== unitRingGeo) {
                    child.geometry.dispose?.();
                }
                if (child.material && !child.userData?.cached && !child.userData?.sharedMat) {
                    child.material.dispose?.();
                }
                markersGroup.remove(child);
            }
        };

        const renderStaticCountryLabels = () => {
            if (isDisposed) return;
            while (staticLabelsGroup.children.length > 0) {
                staticLabelsGroup.remove(staticLabelsGroup.children[0]);
            }
            staticLabelSprites.length = 0;

            if (showCountriesRef.current && showPlacesRef.current) {
                MAJOR_COUNTRY_LABELS.forEach((c) => {
                    const p = latLngToPosition(c.lat, c.lng);
                    const sprite = getOrCreateLabelSprite(
                        `static:${c.name}`,
                        c.name,
                        "#cbd5e1",
                        "rgba(56, 189, 248, 0.35)",
                        "rgba(7, 13, 30, 0.72)",
                        false
                    );
                    const labelR = globeRadius * 1.028;
                    sprite.position.set(p.x * labelR, p.y * labelR, p.z * labelR);
                    staticLabelsGroup.add(sprite);
                    staticLabelSprites.push({ sprite, lat: c.lat, lng: c.lng });
                });
            }
        };
        renderStaticLabelsFnRef.current = renderStaticCountryLabels;

        const renderMarkersAndLabels = () => {
            if (isDisposed) return;
            clearDynamicMarkersGroup();
            dynamicLabelSprites.length = 0;

            const currentMarkerCfg = markerConfigRef.current;
            const currentMarkerRadiusMult = mapMarkerDotSizeUiToMultiplier(currentMarkerCfg?.size ?? 40);

            // Key Orbital Assets, Threats, and Spaceport Ground Stations
            if (currentMarkerCfg?.markers && currentMarkerCfg.markers.length > 0) {
                const markerRadius = 0.015 * currentMarkerRadiusMult;

                currentMarkerCfg.markers.forEach((marker, idx) => {
                    if (typeof marker.lat !== "number" || typeof marker.lng !== "number") return;
                    const p = latLngToPosition(marker.lat, marker.lng);
                    const markerSurfaceR = globeRadius * 1.015;

                    let mColor = "#38bdf8";
                    let labelTitle = marker.label || "";
                    let isPrimaryAsset = false;

                    if (idx === 0) {
                        mColor = "#10b981"; // SAT-01 Protected Asset
                        labelTitle = labelTitle || "SAT-01";
                        isPrimaryAsset = true;
                    } else if (idx === 1) {
                        mColor = "#f43f5e"; // Debris Threat
                        labelTitle = labelTitle || "THREAT";
                        isPrimaryAsset = true;
                    }

                    let mMat = markerSphereMatCache.get(mColor);
                    if (!mMat) {
                        mMat = new MeshBasicMaterial({ color: new Color(mColor) });
                        markerSphereMatCache.set(mColor, mMat);
                    }
                    const mMesh = new Mesh(unitSphereGeo, mMat);
                    mMesh.userData.sharedMat = true;
                    mMesh.scale.setScalar(markerRadius);
                    mMesh.position.set(
                        p.x * markerSurfaceR,
                        p.y * markerSurfaceR,
                        p.z * markerSurfaceR
                    );
                    mMesh.renderOrder = 3;
                    markersGroup.add(mMesh);

                    // Flat outward-facing radar ring tangent to Earth surface
                    let ringMat = markerRingMatCache.get(mColor);
                    if (!ringMat) {
                        ringMat = new MeshBasicMaterial({
                            color: new Color(mColor),
                            transparent: true,
                            opacity: 0.75,
                            side: DoubleSide,
                            depthTest: true,
                        });
                        markerRingMatCache.set(mColor, ringMat);
                    }
                    const ringMesh = new Mesh(unitRingGeo, ringMat);
                    ringMesh.userData.sharedMat = true;
                    ringMesh.scale.setScalar(markerRadius);
                    ringMesh.position.copy(mMesh.position);
                    const outwardNormal = new Vector3(p.x, p.y, p.z).normalize();
                    ringMesh.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), outwardNormal);
                    ringMesh.renderOrder = 3;
                    markersGroup.add(ringMesh);

                    // Add primary asset/station labels neatly using cached sprite materials
                    if (isPrimaryAsset && labelTitle) {
                        const shortLabel = labelTitle.split("(")[0].trim().slice(0, 16);
                        const roleKey = idx === 0 ? "sat" : "threat";
                        const sprite = getOrCreateLabelSprite(
                            `dyn:${roleKey}:${shortLabel}`,
                            shortLabel,
                            idx === 0 ? "#34d399" : "#fb7185",
                            mColor,
                            "rgba(7, 13, 30, 0.92)",
                            true
                        );
                        const labelR = globeRadius * 1.055;
                        sprite.position.set(p.x * labelR, p.y * labelR, p.z * labelR);
                        markersGroup.add(sprite);
                        dynamicLabelSprites.push({ sprite, lat: marker.lat, lng: marker.lng });
                    }
                });
            }

            // Real-time propagated RK4 orbital ground-track arcs (split cleanly across +/-180 deg dateline)
            const tracks = groundTracksRef.current;
            if (tracks && tracks.length > 0) {
                const trackR = globeRadius * 1.012;
                tracks.forEach((tr) => {
                    if (!tr.points || tr.points.length < 2) return;
                    let segment: Vector3[] = [];
                    const flushSegment = () => {
                        if (segment.length >= 2) {
                            const geo = new BufferGeometry().setFromPoints(segment);
                            const mat = tr.dashed
                                ? new LineDashedMaterial({
                                      color: new Color(tr.color),
                                      transparent: true,
                                      opacity: 0.72,
                                      dashSize: 0.04,
                                      gapSize: 0.025,
                                  })
                                : new LineBasicMaterial({
                                      color: new Color(tr.color),
                                      transparent: true,
                                      opacity: 0.85,
                                  });
                            const lineObj = new Line(geo, mat);
                            if (tr.dashed) lineObj.computeLineDistances();
                            lineObj.renderOrder = 3;
                            markersGroup.add(lineObj);
                        }
                        segment = [];
                    };

                    for (let i = 0; i < tr.points.length; i++) {
                        const pt = tr.points[i];
                        if (i > 0 && Math.abs(pt.lng - tr.points[i - 1].lng) > 180) {
                            flushSegment();
                        }
                        const p = latLngToPosition(pt.lat, pt.lng);
                        segment.push(new Vector3(p.x * trackR, p.y * trackR, p.z * trackR));
                    }
                    flushSegment();
                });
            }
        };
        renderMarkersFnRef.current = renderMarkersAndLabels;

        // Interactive Drag & Smooth Rotation
        const rotation = { x: initialLongitudeRad, y: initialLatitudeRad };
        const targetRotation = { x: initialLongitudeRad, y: initialLatitudeRad };
        const velocity = { x: 0, y: 0 };
        let isDragging = false;
        let isHovering = false;
        let lastMouseX = 0;
        let lastMouseY = 0;
        let animationFrameId: number | null = null;
        const lerpFactor = smoothingN === 0 ? 1 : mapLinear(smoothingN, 0, 1, 0.4, 0.04);
        const velocityDecay = mapLinear(smoothingN, 0, 1, 0.7, 0.95);
        const worldPosTmp = new Vector3();

        const animate = () => {
            const dynBaseSpeed = mapSpeedUiToInternal(speedRef.current ?? 0.35);
            const dynRotSpeed = direction === "left" ? -dynBaseSpeed : dynBaseSpeed;
            if (!isDragging && dynRotSpeed !== 0 && (!stopOnHover || !isHovering)) {
                targetRotation.x += dynRotSpeed * 0.01;
            }

            if (!isDragging && smoothingN > 0) {
                const threshold = 0.001;
                if (Math.abs(velocity.x) > threshold || Math.abs(velocity.y) > threshold) {
                    targetRotation.x += velocity.x;
                    targetRotation.y += velocity.y;
                    targetRotation.y = Math.max(
                        -Math.PI / 2,
                        Math.min(Math.PI / 2, targetRotation.y)
                    );
                    velocity.x *= velocityDecay;
                    velocity.y *= velocityDecay;
                } else {
                    velocity.x = 0;
                    velocity.y = 0;
                }
            }

            const dx = targetRotation.x - rotation.x;
            const dy = targetRotation.y - rotation.y;
            rotation.x += dx * lerpFactor;
            rotation.y += dy * lerpFactor;
            rotation.y = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotation.y));

            globeGroup.rotation.y = rotation.x;
            globeGroup.rotation.x = rotation.y;
            globeGroup.updateMatrixWorld();

            // Front-hemisphere visibility culling for sprites so labels never clutter the far side
            for (let i = 0; i < staticLabelSprites.length; i++) {
                const item = staticLabelSprites[i];
                item.sprite.getWorldPosition(worldPosTmp);
                item.sprite.visible = worldPosTmp.z > 0.28 * globeRadius;
            }
            for (let i = 0; i < dynamicLabelSprites.length; i++) {
                const item = dynamicLabelSprites[i];
                item.sprite.getWorldPosition(worldPosTmp);
                item.sprite.visible = worldPosTmp.z > 0.28 * globeRadius;
            }

            renderer.render(scene, camera);
            animationFrameId = requestAnimationFrame(animate);
        };

        animationFrameId = requestAnimationFrame(animate);

        const raycaster = new Raycaster();
        const mouse = new Vector2();

        const inspectAtClientPoint = (clientX: number, clientY: number) => {
            const rect = canvas.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);

            const intersects = raycaster.intersectObject(oceanMesh);
            isHovering = intersects.length > 0;

            const currentDb = placesDatabaseRef.current;
            if (intersects.length > 0 && currentDb) {
                const pt = intersects[0].point.clone();
                // Exact inverse transform into globe local coordinates
                globeGroup.worldToLocal(pt);
                const latLng = positionToLatLng(pt.x, pt.y, pt.z);

                let nearest: HoveredPlaceInfo | null = null;
                let minDist = 18.0;

                if (currentDb.stations) {
                    for (const s of currentDb.stations) {
                        const d = Math.hypot(s.lat - latLng.lat, s.lng - latLng.lng);
                        if (d < minDist && d < 8.0) {
                            minDist = d;
                            nearest = {
                                name: s.name,
                                country: s.country,
                                lat: s.lat,
                                lng: s.lng,
                                type: s.type === "spaceport" ? "Space Launch Center" : "Ground Station",
                            };
                        }
                    }
                }

                if (!nearest && currentDb.countries) {
                    for (const c of currentDb.countries) {
                        const d = Math.hypot(c.lat - latLng.lat, c.lng - latLng.lng);
                        if (d < minDist) {
                            minDist = d;
                            nearest = {
                                name: c.name,
                                lat: c.lat,
                                lng: c.lng,
                                type: "Sovereign Country",
                            };
                        }
                    }
                }

                if (nearest) {
                    setHoveredPlace(nearest);
                    if (onHoverLocationRef.current) onHoverLocationRef.current(nearest);
                } else {
                    setHoveredPlace({
                        name: "International Waters",
                        lat: latLng.lat,
                        lng: latLng.lng,
                        type: "Orbital Sub-Satellite Point",
                    });
                }
            } else {
                setHoveredPlace(null);
                if (onHoverLocationRef.current) onHoverLocationRef.current(null);
            }
        };

        const handleMouseDown = (e: MouseEvent) => {
            isDragging = true;
            canvas.style.cursor = "grabbing";
            velocity.x = 0;
            velocity.y = 0;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;

            const handleMouseMoveDrag = (me: MouseEvent) => {
                const sensitivity = mapDragSpeedUiToSensitivity(dragSpeed);
                const dx = me.clientX - lastMouseX;
                const dy = me.clientY - lastMouseY;
                targetRotation.x += dx * sensitivity;
                targetRotation.y += dy * sensitivity;
                targetRotation.y = Math.max(
                    -Math.PI / 2,
                    Math.min(Math.PI / 2, targetRotation.y)
                );
                velocity.x = dx * sensitivity * 0.3;
                velocity.y = dy * sensitivity * 0.3;
                lastMouseX = me.clientX;
                lastMouseY = me.clientY;
            };

            const handleMouseUp = () => {
                document.removeEventListener("mousemove", handleMouseMoveDrag);
                document.removeEventListener("mouseup", handleMouseUp);
                isDragging = false;
                canvas.style.cursor = "grab";
            };

            document.addEventListener("mousemove", handleMouseMoveDrag);
            document.addEventListener("mouseup", handleMouseUp);
        };
        canvas.addEventListener("mousedown", handleMouseDown);

        const handleTouchStart = (e: TouchEvent) => {
            if (e.touches.length !== 1) return;
            e.preventDefault();
            const touch = e.touches[0];
            isDragging = true;
            velocity.x = 0;
            velocity.y = 0;
            lastMouseX = touch.clientX;
            lastMouseY = touch.clientY;
            inspectAtClientPoint(touch.clientX, touch.clientY);
        };
        const handleTouchMove = (e: TouchEvent) => {
            if (!isDragging || e.touches.length !== 1) return;
            e.preventDefault();
            const touch = e.touches[0];
            const sensitivity = mapDragSpeedUiToSensitivity(dragSpeed);
            const dx = touch.clientX - lastMouseX;
            const dy = touch.clientY - lastMouseY;
            targetRotation.x += dx * sensitivity;
            targetRotation.y += dy * sensitivity;
            targetRotation.y = Math.max(
                -Math.PI / 2,
                Math.min(Math.PI / 2, targetRotation.y)
            );
            velocity.x = dx * sensitivity * 0.3;
            velocity.y = dy * sensitivity * 0.3;
            lastMouseX = touch.clientX;
            lastMouseY = touch.clientY;
        };
        const handleTouchEnd = () => {
            isDragging = false;
            isHovering = false;
        };
        canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
        canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
        canvas.addEventListener("touchend", handleTouchEnd);
        canvas.addEventListener("touchcancel", handleTouchEnd);

        const handleMouseMove = (e: MouseEvent) => {
            inspectAtClientPoint(e.clientX, e.clientY);
        };
        const handleMouseLeave = () => {
            isHovering = false;
            setHoveredPlace(null);
            if (onHoverLocationRef.current) onHoverLocationRef.current(null);
        };
        canvas.addEventListener("mousemove", handleMouseMove);
        canvas.addEventListener("mouseleave", handleMouseLeave);

        let resizeRafId: number | null = null;
        let lastObsWidth = Math.round(containerWidth);
        let lastObsHeight = Math.round(containerHeight);
        const resizeObserver = new ResizeObserver(() => {
            if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
            resizeRafId = requestAnimationFrame(() => {
                if (isDisposed) return;
                const rect = container.getBoundingClientRect();
                const newWidth = Math.round(rect.width || container.clientWidth || 0);
                const newHeight = Math.round(rect.height || container.clientHeight || 0);
                if (newWidth <= 1 || newHeight <= 1 || (newWidth === lastObsWidth && newHeight === lastObsHeight)) return;
                lastObsWidth = newWidth;
                lastObsHeight = newHeight;
                camera.aspect = newWidth / newHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(newWidth, newHeight, false);

                const newCamDist = computeCameraDistance(newWidth, newHeight, globeRadius);
                camera.position.set(0, 0, newCamDist);
                camera.lookAt(0, 0, 0);
                renderer.render(scene, camera);
            });
        });
        resizeObserver.observe(container);

        renderStaticCountryLabels();
        renderMarkersAndLabels();
        loadWorldData();

        return () => {
            isDisposed = true;
            renderMarkersFnRef.current = null;
            renderStaticLabelsFnRef.current = null;
            if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
            if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
            canvas.removeEventListener("mousedown", handleMouseDown);
            canvas.removeEventListener("touchstart", handleTouchStart);
            canvas.removeEventListener("touchmove", handleTouchMove);
            canvas.removeEventListener("touchend", handleTouchEnd);
            canvas.removeEventListener("touchcancel", handleTouchEnd);
            canvas.removeEventListener("mousemove", handleMouseMove);
            canvas.removeEventListener("mouseleave", handleMouseLeave);
            resizeObserver.disconnect();
            clearDynamicMarkersGroup();
            labelMaterialCache.forEach((mat) => {
                mat.map?.dispose?.();
                mat.dispose();
            });
            labelMaterialCache.clear();
            markerSphereMatCache.forEach((mat) => mat.dispose());
            markerSphereMatCache.clear();
            markerRingMatCache.forEach((mat) => mat.dispose());
            markerRingMatCache.clear();
            unitSphereGeo.dispose();
            unitRingGeo.dispose();
            renderer.dispose();
            if (container.contains(canvas)) {
                container.removeChild(canvas);
            }
        };
    }, [
        smoothing,
        dotColorProp,
        dotSizeProp,
        dotDensityProp,
        dotAllDotsProp,
        fill,
        fillColor,
        scale,
        stopOnHover,
        direction,
        initialLatitude,
        initialLongitude,
        oceanColor,
        outlineColor,
        showOutline,
        graticuleColor,
        showGrid,
        dragSpeed,
        showCountries,
    ]);

    // Static country labels only rebuild when country/place visibility toggles change
    useEffect(() => {
        renderStaticLabelsFnRef.current?.();
    }, [showCountries, showPlaces]);

    // Lightweight update when dynamic orbital markers or ground tracks change without rebuilding WebGL scene
    useEffect(() => {
        renderMarkersFnRef.current?.();
    }, [markerConfig, groundTracks]);

    const containerStyle: CSSProperties = {
        ...style,
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
    };

    return (
        <div ref={containerRef} style={containerStyle}>
            {hoveredPlace && (
                <div className="absolute bottom-2.5 sm:bottom-4 left-2.5 sm:left-4 z-20 pointer-events-none max-w-[calc(100%-8.5rem)] bg-slate-950/85 backdrop-blur-md px-2.5 sm:px-3 py-1.5 rounded-xl border border-sky-500/40 shadow-xl flex items-center gap-2 transition-all">
                    <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping shrink-0" />
                    <div className="flex flex-col min-w-0">
                        <div className="text-[10px] sm:text-[11px] font-bold text-white font-mono flex items-center gap-1.5 truncate">
                            <span className="truncate">{hoveredPlace.name}</span>
                            {hoveredPlace.country && (
                                <span className="hidden sm:inline text-slate-400 font-normal">({hoveredPlace.country})</span>
                            )}
                        </div>
                        <div className="text-[9px] text-sky-300 font-mono truncate">
                            {hoveredPlace.type} •{" "}
                            {hoveredPlace.lat >= 0
                                ? `${hoveredPlace.lat.toFixed(1)}°N`
                                : `${Math.abs(hoveredPlace.lat).toFixed(1)}°S`}
                            ,{" "}
                            {hoveredPlace.lng >= 0
                                ? `${hoveredPlace.lng.toFixed(1)}°E`
                                : `${Math.abs(hoveredPlace.lng).toFixed(1)}°W`}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
