/**
 * ============================================================================
 * 3D Virtual Chemical Storage Room – Three.js Emergency-Response Builder
 * Features:
 * - FRONT WALL: Centered MAIN DOOR + Emergency EXIT Sign & Evacuation Strip
 * - RIGHT WALL: WINDOW 1 & WINDOW 2
 * - BACK WALL : VENTILATION UNIT 1 & 2
 * - LEFT WALL  : COOLING CHILLER UNIT
 * - CEILING    : Flashing Red Emergency Beacon / Strobe Light
 * - OCCUPANCY  : 3D Animated Personnel Avatar with Full FSM Walking Paths:
 *                OUTSIDE -> ENTERING -> WORKING -> ALERTED -> EVACUATING -> EXITED
 * - LABELS     : Object labels, sensor tags, and zone tags (A, B, C, D)
 * ============================================================================
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export class Room3D {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        
        // Room Dimensions
        this.W = 12; this.H = 4; this.D = 8; this.T = 0.15;
        
        // Door
        this.doorW = 1.8; this.doorH = 2.6; this.doorX = 0;
        this.doorAngle = 0; this.doorTarget = 0;

        // Windows
        this.winW = 1.4; this.winH = 1.0; this.winY = 1.6;
        this.win1Z = -1.8; this.win2Z = 1.8;
        this.winPos = 0; this.winTarget = 0;
        this.windowGlassMeshes = [];

        // Emergency Visuals
        this.strobeLight = null;
        this.strobeMesh = null;
        this.strobeActive = false;
        
        this.evacStripMesh = null;
        this.exitSignMesh = null;

        // 3D Avatar & FSM State Machine
        this.avatarGroup = null;
        this.avatarLabel = null;
        this.avatarLabelDiv = null;
        this.leftLeg = null;
        this.rightLeg = null;
        this.leftArm = null;
        this.rightArm = null;
        
        // Avatar FSM: OUTSIDE, ENTERING, WORKING, ALERTED, EVACUATING, EXITED
        this.occupancyState = 'OUTSIDE';
        this.avatarPos = new THREE.Vector3(0, 0, -5.5);
        this.avatarTarget = new THREE.Vector3(0, 0, -5.5);
        this.walkWaypoints = [];
        this.currentWaypointIdx = 0;
        this.walkSpeed = 0.04;
        this.walkCycleTime = 0;

        // Object References
        this.doorPivot = null;
        this.coolingFan = null;
        this.coolingLight = null;
        this.ventFan = null;

        this.sensorLabels = {};
        this.sensorMeshes = {};
        this.heatDiscs = {};
        this.mats = {};

        this.activeSensorIds = ['S1','S2','S3','S4','S5'];
        this.init();
    }

    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xeef2f7);

        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 200);
        
        this.defaultCamPos = new THREE.Vector3(-14, 11, -12);
        this.defaultCamTarget = new THREE.Vector3(0, 1.5, 0);
        this.camera.position.copy(this.defaultCamPos);

        // Renderers
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.container.appendChild(this.renderer.domElement);

        this.labelRenderer = new CSS2DRenderer();
        this.labelRenderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.labelRenderer.domElement.style.position = 'absolute';
        this.labelRenderer.domElement.style.top = '0';
        this.labelRenderer.domElement.style.left = '0';
        this.labelRenderer.domElement.style.pointerEvents = 'none';
        this.container.appendChild(this.labelRenderer.domElement);

        // Orbit Controls (Orbit, Zoom, Pan)
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.minDistance = 5;
        this.controls.maxDistance = 40;
        this.controls.maxPolarAngle = Math.PI / 2.02;
        this.controls.target.copy(this.defaultCamTarget);
        this.controls.update();

        this.createMaterials();
        this.setupLighting();
        this.buildFloorAndCeiling();
        this.buildWalls();
        this.buildDoor();
        this.buildWindows();
        this.buildCoolingUnit();
        this.buildVentilationSystem();
        this.buildRacks();
        this.buildSensors();
        this.buildHeatDiscs();
        this.buildEmergencyAssets();
        this.buildOccupantAvatar();
        this.buildGroundPlane();

        window.addEventListener('resize', () => this.onResize());
        this.animate();
    }

    createMaterials() {
        this.mats.floor     = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.8, metalness: 0.1 });
        this.mats.ceiling   = new THREE.MeshStandardMaterial({ color: 0xf3f4f6, roughness: 0.9 });
        this.mats.wall      = new THREE.MeshStandardMaterial({ color: 0xf9fafb, roughness: 0.7 });
        this.mats.door      = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.5, metalness: 0.1 });
        this.mats.doorFrame = new THREE.MeshStandardMaterial({ color: 0x44403c, roughness: 0.4, metalness: 0.3 });
        this.mats.glass     = new THREE.MeshStandardMaterial({ color: 0x93c5fd, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.45 });
        this.mats.rack      = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.4, metalness: 0.6 });
        this.mats.rackShelf = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.5, metalness: 0.4 });
        this.mats.cooling   = new THREE.MeshStandardMaterial({ color: 0xe0f2fe, roughness: 0.3, metalness: 0.4 });
        this.mats.coolingOK = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.3, metalness: 0.5 });
        this.mats.coolingFail = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.3, metalness: 0.5 });
        this.mats.ground    = new THREE.MeshStandardMaterial({ color: 0xc5ccd6, roughness: 1.0 });
        this.mats.vent      = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5, metalness: 0.5 });
        this.mats.exitSign  = new THREE.MeshStandardMaterial({ color: 0x15803d, emissive: 0x15803d, emissiveIntensity: 0.8 });
        this.mats.evacStrip = new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.0 });
        
        // Avatar Materials
        this.mats.avatarSkin = new THREE.MeshStandardMaterial({ color: 0xfbcfe8, roughness: 0.6 });
        this.mats.avatarVest = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4 });
        this.mats.avatarPants = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.6 });
        this.mats.avatarHelmet = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.3, metalness: 0.2 });
    }

    setupLighting() {
        const hemi = new THREE.HemisphereLight(0xffffff, 0x94a3b8, 0.75);
        this.scene.add(hemi);

        const dir = new THREE.DirectionalLight(0xffffff, 1.2);
        dir.position.set(8, 12, 6);
        dir.castShadow = true;
        this.scene.add(dir);

        const fill1 = new THREE.PointLight(0xfff5e6, 0.5, 20);
        fill1.position.set(0, 3.5, 0);
        this.scene.add(fill1);

        // Emergency Red Strobe Light on ceiling
        this.strobeLight = new THREE.PointLight(0xef4444, 0.0, 30);
        this.strobeLight.position.set(0, 3.8, 0);
        this.scene.add(this.strobeLight);
    }

    box(w, h, d, mat) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.castShadow = true; m.receiveShadow = true;
        return m;
    }

    addCSSLabel(parent, text, className, offsetVector) {
        const div = document.createElement('div');
        div.className = className;
        div.textContent = text;
        const obj = new CSS2DObject(div);
        obj.position.copy(offsetVector);
        parent.add(obj);
        return div;
    }

    buildFloorAndCeiling() {
        const floor = this.box(this.W, this.T, this.D, this.mats.floor);
        floor.position.set(0, -this.T / 2, 0);
        this.scene.add(floor);

        const ceil = this.box(this.W + this.T * 2, this.T, this.D + this.T * 2, this.mats.ceiling);
        ceil.position.set(0, this.H + this.T / 2, 0);
        this.scene.add(ceil);
    }

    buildWalls() {
        const hw = this.W / 2, hd = this.D / 2;

        const back = this.box(this.W + this.T * 2, this.H, this.T, this.mats.wall);
        back.position.set(0, this.H / 2, hd + this.T / 2);
        this.scene.add(back);

        const left = this.box(this.T, this.H, this.D, this.mats.wall);
        left.position.set(-hw - this.T / 2, this.H / 2, 0);
        this.scene.add(left);

        const right = this.box(this.T, this.H, this.D, this.mats.wall);
        right.position.set(hw + this.T / 2, this.H / 2, 0);
        this.scene.add(right);

        // Front Wall with Door Opening
        const doorL = this.doorX - this.doorW / 2;
        const doorR = this.doorX + this.doorW / 2;

        const fwl = doorL - (-hw);
        if (fwl > 0) {
            const wl = this.box(fwl, this.H, this.T, this.mats.wall);
            wl.position.set(-hw + fwl / 2, this.H / 2, -hd - this.T / 2);
            this.scene.add(wl);
        }

        const fwr = hw - doorR;
        if (fwr > 0) {
            const wr = this.box(fwr, this.H, this.T, this.mats.wall);
            wr.position.set(doorR + fwr / 2, this.H / 2, -hd - this.T / 2);
            this.scene.add(wr);
        }

        const aboveH = this.H - this.doorH;
        if (aboveH > 0) {
            const wa = this.box(this.doorW, aboveH, this.T, this.mats.wall);
            wa.position.set(this.doorX, this.doorH + aboveH / 2, -hd - this.T / 2);
            this.scene.add(wa);
        }
    }

    buildDoor() {
        const hd = this.D / 2;
        this.doorPivot = new THREE.Group();
        this.doorPivot.position.set(this.doorX - this.doorW / 2, 0, -hd);

        const doorMesh = this.box(this.doorW, this.doorH, 0.06, this.mats.door);
        doorMesh.position.set(this.doorW / 2, this.doorH / 2, 0);
        this.doorPivot.add(doorMesh);

        const handle = this.box(0.04, 0.16, 0.08, this.mats.doorFrame);
        handle.position.set(this.doorW - 0.15, this.doorH / 2, 0.06);
        this.doorPivot.add(handle);

        this.addCSSLabel(this.doorPivot, '🚪 MAIN DOOR', 'object-label-3d', new THREE.Vector3(this.doorW / 2, this.doorH + 0.2, 0));

        this.scene.add(this.doorPivot);
    }

    buildWindows() {
        const x = this.W / 2 + this.T / 2;

        [this.win1Z, this.win2Z].forEach((z, idx) => {
            const group = new THREE.Group();
            const glass = this.box(0.05, this.winH, this.winW, this.mats.glass);
            glass.position.set(0, 0, 0);
            group.add(glass);

            const ft = 0.06;
            const topBar = this.box(0.1, ft, this.winW + ft * 2, this.mats.doorFrame);
            topBar.position.set(0, this.winH / 2, 0);
            group.add(topBar);

            const botBar = this.box(0.1, ft, this.winW + ft * 2, this.mats.doorFrame);
            botBar.position.set(0, -this.winH / 2, 0);
            group.add(botBar);

            this.addCSSLabel(group, `🪟 WINDOW ${idx + 1}`, 'object-label-3d', new THREE.Vector3(0, this.winH / 2 + 0.25, 0));

            group.position.set(x, this.winY + this.winH / 2, z);
            this.scene.add(group);
            this.windowGlassMeshes.push(glass);
        });
    }

    buildCoolingUnit() {
        const group = new THREE.Group();
        const coolingBody = this.box(0.4, 1.2, 2.2, this.mats.cooling);
        coolingBody.position.set(0, 0.6, 0);
        group.add(coolingBody);

        const fanHousing = new THREE.Mesh(
            new THREE.CylinderGeometry(0.35, 0.35, 0.05, 24),
            this.mats.coolingOK
        );
        fanHousing.rotation.z = Math.PI / 2;
        fanHousing.position.set(0.23, 0.6, 0);
        group.add(fanHousing);

        this.coolingFan = new THREE.Group();
        for (let i = 0; i < 4; i++) {
            const blade = this.box(0.02, 0.28, 0.04, this.mats.coolingOK);
            blade.rotation.x = (Math.PI / 2) * i;
            this.coolingFan.add(blade);
        }
        this.coolingFan.position.set(0.27, 0.6, 0);
        this.coolingFan.rotation.z = Math.PI / 2;
        group.add(this.coolingFan);

        this.coolingLight = new THREE.Mesh(
            new THREE.SphereGeometry(0.06, 12, 12),
            new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 0.8 })
        );
        this.coolingLight.position.set(0.21, 1.0, 0.9);
        group.add(this.coolingLight);

        const labelDiv = this.addCSSLabel(group, '❄️ COOLING UNIT', 'cooling-label-3d', new THREE.Vector3(0, 1.5, 0));
        labelDiv.id = 'cooling-3d-label';

        group.position.set(-this.W / 2 + 0.2, 2.2, 0);
        this.scene.add(group);
    }

    buildVentilationSystem() {
        const group = new THREE.Group();
        const ventBox = this.box(1.8, 1.0, 0.3, this.mats.vent);
        ventBox.position.set(0, 0.5, 0);
        group.add(ventBox);

        for (let i = 0; i < 5; i++) {
            const slat = this.box(1.5, 0.04, 0.02, this.mats.doorFrame);
            slat.position.set(0, 0.2 + i * 0.15, -0.16);
            group.add(slat);
        }

        this.ventFan = new THREE.Group();
        for (let i = 0; i < 4; i++) {
            const b = this.box(0.35, 0.03, 0.02, this.mats.rackShelf);
            b.rotation.z = (Math.PI / 2) * i;
            this.ventFan.add(b);
        }
        this.ventFan.position.set(0, 0.5, -0.18);
        group.add(this.ventFan);

        this.addCSSLabel(group, '🌀 VENT 1 & VENT 2', 'object-label-3d', new THREE.Vector3(0, 1.2, 0));

        group.position.set(0, 2.7, this.D / 2 - 0.15);
        this.scene.add(group);
    }

    buildRack(x, z, w, d, label, colorHex) {
        const rackH = 2.2;
        const group = new THREE.Group();
        const legW = 0.06;

        for (let dx of [-w/2 + legW, w/2 - legW]) {
            for (let dz of [-d/2 + legW, d/2 - legW]) {
                const leg = this.box(legW, rackH, legW, this.mats.rack);
                leg.position.set(dx, rackH / 2, dz);
                group.add(leg);
            }
        }

        for (let i = 0; i < 3; i++) {
            const sy = 0.05 + i * (rackH / 3);
            const shelf = this.box(w, 0.04, d, this.mats.rackShelf);
            shelf.position.set(0, sy, 0);
            group.add(shelf);

            const bmat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.5, metalness: 0.2 });
            const nBarrels = Math.floor(w / 0.35);
            for (let b = 0; b < nBarrels; b++) {
                const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 12), bmat);
                barrel.position.set(-w/2 + 0.2 + b * 0.35, sy + 0.19, 0);
                group.add(barrel);
            }
        }

        this.addCSSLabel(group, label, 'rack-label-3d', new THREE.Vector3(0, rackH + 0.25, 0));

        group.position.set(x, 0, z);
        this.scene.add(group);
    }

    buildRacks() {
        const qx = Math.min(this.W / 2 * 0.55, 4.0);
        const qz = Math.min(this.D / 2 * 0.45, 2.5);
        this.buildRack(-qx, -qz, 2.4, 0.7, 'ZONE A: ⚠️ Flammables', 0xef4444);
        this.buildRack(-qx,  qz, 2.4, 0.7, 'ZONE B: ☠️ Toxics',     0xa855f7);
        this.buildRack( qx, -qz, 2.4, 0.7, 'ZONE C: 🧪 Corrosives',  0xf59e0b);
        this.buildRack( qx,  qz, 2.4, 0.7, 'ZONE D: 📦 Storage Bay', 0x10b981);
    }

    buildSensors() {
        const positions = {
            'S1': new THREE.Vector3(this.doorX, 1.6, -this.D / 2 + 0.8),
            'S2': new THREE.Vector3(0, 1.6, 0),
            'S3': new THREE.Vector3(-this.W / 2 + 0.8, 2.2, 0),
            'S4': new THREE.Vector3(-3.2, 1.6, -0.6),
            'S5': new THREE.Vector3(this.W / 2 - 0.8, 1.6, 0),
            'S6': new THREE.Vector3(0, 2.6, this.D / 2 - 0.8),
            'S7': new THREE.Vector3(3.2, 1.6, 1.8)
        };

        const colors = {
            'S1': 0x3b82f6, 'S2': 0x8b5cf6, 'S3': 0x06b6d4, 'S4': 0xf97316, 'S5': 0xec4899, 'S6': 0x10b981, 'S7': 0x6366f1
        };

        for (const [id, pos] of Object.entries(positions)) {
            const group = new THREE.Group();
            const body = new THREE.Mesh(
                new THREE.BoxGeometry(0.18, 0.25, 0.1),
                new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.4, metalness: 0.3 })
            );
            group.add(body);

            const indicator = new THREE.Mesh(
                new THREE.BoxGeometry(0.12, 0.06, 0.02),
                new THREE.MeshStandardMaterial({ color: colors[id], emissive: colors[id], emissiveIntensity: 0.5 })
            );
            indicator.position.set(0, 0.05, 0.06);
            group.add(indicator);

            const led = new THREE.Mesh(
                new THREE.SphereGeometry(0.025, 8, 8),
                new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 1.0 })
            );
            led.position.set(0, -0.07, 0.06);
            group.add(led);

            this.sensorMeshes[id] = { group, indicator, led };

            const labelDiv = document.createElement('div');
            labelDiv.className = 'sensor-label-3d';
            labelDiv.id = `label3d-${id}`;
            labelDiv.innerHTML = `<span class="sl-id">${id}</span> <span class="sl-temp">--°C</span> <span class="sl-status badge-normal-3d">NORMAL</span>`;
            
            const labelObj = new CSS2DObject(labelDiv);
            labelObj.position.set(0, 0.35, 0);
            group.add(labelObj);
            this.sensorLabels[id] = labelDiv;

            group.position.copy(pos);
            this.scene.add(group);
        }
    }

    buildHeatDiscs() {
        const positions = {
            'S1': new THREE.Vector3(this.doorX, 0.02, -this.D / 2 + 0.8),
            'S2': new THREE.Vector3(0, 0.02, 0),
            'S3': new THREE.Vector3(-this.W / 2 + 0.8, 0.02, 0),
            'S4': new THREE.Vector3(-3.2, 0.02, -0.6),
            'S5': new THREE.Vector3(this.W / 2 - 0.8, 0.02, 0),
            'S6': new THREE.Vector3(0, 0.02, this.D / 2 - 0.8),
            'S7': new THREE.Vector3(3.2, 0.02, 1.8)
        };

        for (const [id, pos] of Object.entries(positions)) {
            const disc = new THREE.Mesh(
                new THREE.CircleGeometry(1.6, 32),
                new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.12, side: THREE.DoubleSide })
            );
            disc.rotation.x = -Math.PI / 2;
            disc.position.copy(pos);
            this.heatDiscs[id] = disc;
            this.scene.add(disc);
        }
    }

    buildEmergencyAssets() {
        // 1. Emergency Strobe Light on ceiling center
        const strobeGroup = new THREE.Group();
        const base = this.box(0.3, 0.1, 0.3, this.mats.doorFrame);
        strobeGroup.add(base);

        this.strobeMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.12, 0.15, 16),
            new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.2, transparent: true, opacity: 0.8 })
        );
        this.strobeMesh.position.y = -0.1;
        strobeGroup.add(this.strobeMesh);

        strobeGroup.position.set(0, 3.95, 0);
        this.scene.add(strobeGroup);

        // 2. Emergency EXIT Sign above door
        const exitBox = this.box(0.8, 0.3, 0.06, this.mats.exitSign);
        exitBox.position.set(this.doorX, 3.1, -this.D / 2 + 0.05);
        this.scene.add(exitBox);

        this.addCSSLabel(exitBox, '🚨 EMERGENCY EXIT', 'exit-label-3d', new THREE.Vector3(0, 0.3, 0));

        // 3. Illuminated Evacuation Pathway Strip on floor
        this.evacStripMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(1.2, this.D - 1.0),
            this.mats.evacStrip
        );
        this.evacStripMesh.rotation.x = -Math.PI / 2;
        this.evacStripMesh.position.set(this.doorX, 0.015, 0);
        this.scene.add(this.evacStripMesh);
    }

    buildOccupantAvatar() {
        this.avatarGroup = new THREE.Group();
        
        // 1. Head & Hardhat
        const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.14, 12, 12),
            this.mats.avatarSkin
        );
        head.position.y = 1.55;
        this.avatarGroup.add(head);

        const helmet = new THREE.Mesh(
            new THREE.CylinderGeometry(0.17, 0.18, 0.1, 12),
            this.mats.avatarHelmet
        );
        helmet.position.y = 1.66;
        this.avatarGroup.add(helmet);

        // 2. Torso (Safety Vest over shirt)
        const torso = new THREE.Mesh(
            new THREE.BoxGeometry(0.36, 0.55, 0.22),
            this.mats.avatarVest
        );
        torso.position.y = 1.15;
        this.avatarGroup.add(torso);

        // 3. Left & Right Arms
        this.leftArm = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 0.45, 0.1),
            this.mats.avatarVest
        );
        this.leftArm.position.set(-0.24, 1.15, 0);
        this.avatarGroup.add(this.leftArm);

        this.rightArm = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 0.45, 0.1),
            this.mats.avatarVest
        );
        this.rightArm.position.set(0.24, 1.15, 0);
        this.avatarGroup.add(this.rightArm);

        // 4. Left & Right Legs (Pants)
        this.leftLeg = new THREE.Mesh(
            new THREE.BoxGeometry(0.14, 0.65, 0.14),
            this.mats.avatarPants
        );
        this.leftLeg.position.set(-0.1, 0.55, 0);
        this.avatarGroup.add(this.leftLeg);

        this.rightLeg = new THREE.Mesh(
            new THREE.BoxGeometry(0.14, 0.65, 0.14),
            this.mats.avatarPants
        );
        this.rightLeg.position.set(0.1, 0.55, 0);
        this.avatarGroup.add(this.rightLeg);

        // Floating CSS2D Status Badge
        this.avatarLabelDiv = document.createElement('div');
        this.avatarLabelDiv.className = 'occupant-label-3d';
        this.avatarLabelDiv.innerHTML = '👷 OCCUPANT IN ROOM';
        
        this.avatarLabel = new CSS2DObject(this.avatarLabelDiv);
        this.avatarLabel.position.set(0, 1.95, 0);
        this.avatarGroup.add(this.avatarLabel);

        // Start Outside room entrance
        this.avatarGroup.position.set(0, 0, -5.5);
        this.avatarGroup.visible = false;
        this.scene.add(this.avatarGroup);
    }

    buildGroundPlane() {
        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(60, 60),
            this.mats.ground
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.01;
        ground.receiveShadow = true;
        this.scene.add(ground);
    }

    resetCamera() {
        this.camera.position.copy(this.defaultCamPos);
        this.controls.target.copy(this.defaultCamTarget);
        this.controls.update();
    }

    setEmergencyStrobe(active) {
        this.strobeActive = active;
        if (!active) {
            this.strobeLight.intensity = 0.0;
            this.strobeMesh.material.emissiveIntensity = 0.2;
        }
    }

    setEvacuationAlarm(active) {
        this.mats.evacStrip.opacity = active ? 0.35 : 0.0;
        this.setEmergencyStrobe(active);
    }

    // === OCCUPANCY FINITE STATE MACHINE (FSM) ===
    setOccupantPresence(occupied) {
        if (occupied) {
            if (this.occupancyState === 'OUTSIDE' || this.occupancyState === 'EXITED') {
                this.startOccupantEnteringSequence();
            }
        } else {
            if (this.occupancyState !== 'OUTSIDE' && this.occupancyState !== 'EXITED') {
                this.startOccupantEvacuatingSequence();
            }
        }
    }

    startOccupantEnteringSequence() {
        this.occupancyState = 'ENTERING';
        this.avatarGroup.visible = true;
        this.avatarGroup.position.set(0, 0, -5.5);
        
        // Waypoints: Outside -> Main Door Entrance -> Center Aisle -> Zone A Rack
        this.walkWaypoints = [
            new THREE.Vector3(0, 0, -5.5),
            new THREE.Vector3(0, 0, -3.5),
            new THREE.Vector3(0, 0, -1.0),
            new THREE.Vector3(-2.2, 0, -1.5)
        ];
        this.currentWaypointIdx = 1;
        
        // Open door for entry
        this.setDoorOpen(true);
        this.avatarLabelDiv.className = 'occupant-label-3d';
        this.avatarLabelDiv.innerHTML = '👷 ENTERING ROOM...';
    }

    startOccupantEvacuatingSequence() {
        this.occupancyState = 'EVACUATING';
        this.avatarLabelDiv.className = 'occupant-label-3d occupant-evac';
        this.avatarLabelDiv.innerHTML = '🚨 EVACUATING ROOM...';

        // Waypoints: Current Position -> Center Aisle -> Main Door -> Outside
        const currentPos = this.avatarGroup.position.clone();
        this.walkWaypoints = [
            currentPos,
            new THREE.Vector3(0, 0, -1.0),
            new THREE.Vector3(0, 0, -3.5),
            new THREE.Vector3(0, 0, -5.5)
        ];
        this.currentWaypointIdx = 1;
        
        // Open door for evacuation
        this.setDoorOpen(true);
    }

    triggerOccupantEmergencyAlert() {
        if (this.occupancyState === 'WORKING' || this.occupancyState === 'ENTERING') {
            this.occupancyState = 'ALERTED';
            this.avatarLabelDiv.className = 'occupant-label-3d occupant-crit';
            this.avatarLabelDiv.innerHTML = '⚠️ ALERTED! EVACUATING...';
            setTimeout(() => this.startOccupantEvacuatingSequence(), 800);
        }
    }

    updateOccupantFSM() {
        if (!this.avatarGroup || !this.avatarGroup.visible) return;

        if (this.occupancyState === 'ENTERING' || this.occupancyState === 'EVACUATING') {
            if (this.currentWaypointIdx < this.walkWaypoints.length) {
                const target = this.walkWaypoints[this.currentWaypointIdx];
                const current = this.avatarGroup.position;
                const dist = current.distanceTo(target);

                if (dist < 0.15) {
                    this.currentWaypointIdx++;
                    if (this.currentWaypointIdx >= this.walkWaypoints.length) {
                        // Reached Final Waypoint
                        if (this.occupancyState === 'ENTERING') {
                            this.occupancyState = 'WORKING';
                            this.setDoorOpen(false); // Close door behind worker
                            this.avatarLabelDiv.className = 'occupant-label-3d';
                            this.avatarLabelDiv.innerHTML = '👷 WORKING IN ZONE A';
                        } else if (this.occupancyState === 'EVACUATING') {
                            this.occupancyState = 'EXITED';
                            this.avatarGroup.visible = false;
                            this.setDoorOpen(false); // Close door after exit
                            
                            // Notify App Controller that room is evacuated
                            if (window.onOccupantEvacuated) window.onOccupantEvacuated();
                        }
                    }
                } else {
                    // Move towards target waypoint
                    const dir = target.clone().sub(current).normalize();
                    current.add(dir.multiplyScalar(this.walkSpeed));

                    // Face movement direction
                    const angle = Math.atan2(dir.x, dir.z);
                    this.avatarGroup.rotation.y = angle;

                    // Animate leg & arm swing walking cycle
                    this.walkCycleTime += 0.18;
                    const swing = Math.sin(this.walkCycleTime) * 0.45;
                    this.leftLeg.rotation.x = swing;
                    this.rightLeg.rotation.x = -swing;
                    this.leftArm.rotation.x = -swing;
                    this.rightArm.rotation.x = swing;
                }
            }
        } else if (this.occupancyState === 'WORKING') {
            // Subtle working/inspection motion
            this.walkCycleTime += 0.03;
            this.avatarGroup.rotation.y = -Math.PI / 2 + Math.sin(this.walkCycleTime) * 0.1;
            this.leftArm.rotation.x = Math.sin(this.walkCycleTime * 2) * 0.15;
            this.leftLeg.rotation.x = 0;
            this.rightLeg.rotation.x = 0;
        }
    }

    // === Interactive Setters ===
    setDoorOpen(open) {
        this.doorTarget = open ? -Math.PI / 2 : 0;
    }

    setWindowOpen(open) {
        this.winTarget = open ? 0.8 : 0;
    }

    setCoolingFailed(failed) {
        const mat = failed ? this.mats.coolingFail : this.mats.coolingOK;
        this.coolingFan.children.forEach(c => { c.material = mat; });
        this.coolingLight.material.color.set(failed ? 0xef4444 : 0x22c55e);
        this.coolingLight.material.emissive.set(failed ? 0xef4444 : 0x22c55e);
        
        const lbl = document.getElementById('cooling-3d-label');
        if (lbl) {
            lbl.textContent = failed ? '🔴 COOLING FAILED' : '❄️ COOLING UNIT';
            lbl.className = failed ? 'cooling-label-3d cooling-fail' : 'cooling-label-3d';
        }
    }

    setActivePreset(preset) {
        this.activeSensorIds = preset === '3' ? ['S1','S2','S3'] :
                               preset === '7' ? ['S1','S2','S3','S4','S5','S6','S7'] :
                               ['S1','S2','S3','S4','S5'];
        
        for (const id in this.sensorMeshes) {
            const active = this.activeSensorIds.includes(id);
            this.sensorMeshes[id].group.visible = active;
            this.heatDiscs[id].visible = active;
            if (this.sensorLabels[id]) {
                this.sensorLabels[id].style.display = active ? 'flex' : 'none';
            }
        }
    }

    updateSensorLabels(sensors, alertStates) {
        for (const id of this.activeSensorIds) {
            if (!sensors[id]) continue;
            const s = sensors[id];
            const state = alertStates[id] || 'normal';
            const lbl = this.sensorLabels[id];
            if (!lbl) continue;

            const isOffline = s.health === 'OFFLINE';
            const statusClass = isOffline ? 'badge-offline-3d' : state === 'critical' ? 'badge-critical-3d' : state === 'warning' ? 'badge-warning-3d' : 'badge-normal-3d';
            const tempStr = isOffline ? 'OFFLINE' : `${s.currentTemp.toFixed(1)}°C`;
            const statusText = isOffline ? 'OFFLINE' : state.toUpperCase();

            lbl.innerHTML = `<span class="sl-id">${id}</span> <span class="sl-temp">${tempStr}</span> <span class="sl-status ${statusClass}">${statusText}</span>`;

            const mesh = this.sensorMeshes[id];
            if (mesh) {
                const c = isOffline ? 0x64748b : state === 'critical' ? 0xef4444 : state === 'warning' ? 0xf59e0b : 0x22c55e;
                mesh.led.material.color.set(c);
                mesh.led.material.emissive.set(c);
            }

            const disc = this.heatDiscs[id];
            if (disc) {
                const c = isOffline ? 0x64748b : state === 'critical' ? 0xef4444 : state === 'warning' ? 0xf59e0b : 0x22c55e;
                disc.material.color.set(c);
                disc.material.opacity = state === 'critical' ? 0.35 : state === 'warning' ? 0.22 : 0.10;
            }
        }
    }

    onResize() {
        const w = this.container.clientWidth, h = this.container.clientHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
        this.labelRenderer.setSize(w, h);
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        // Door interpolation
        this.doorAngle += (this.doorTarget - this.doorAngle) * 0.06;
        if (this.doorPivot) this.doorPivot.rotation.y = this.doorAngle;

        // Windows interpolation
        this.winPos += (this.winTarget - this.winPos) * 0.06;
        this.windowGlassMeshes.forEach(mesh => {
            mesh.position.z = mesh.position.z > 0 ? 1.8 + this.winPos : -1.8 - this.winPos;
        });

        // Strobe beacon flashing
        if (this.strobeActive && this.strobeLight) {
            const time = Date.now() * 0.008;
            this.strobeLight.intensity = Math.sin(time) > 0 ? 2.5 : 0.0;
            this.strobeMesh.material.emissiveIntensity = Math.sin(time) > 0 ? 1.0 : 0.2;
        }

        // Fans spin
        if (this.coolingFan && !this._coolingFailed) this.coolingFan.rotation.x += 0.06;
        if (this.ventFan) this.ventFan.rotation.z += 0.04;

        // Update Occupant Walking FSM
        this.updateOccupantFSM();

        this.controls.update();
        this.renderer.render(this.scene, this.camera);
        this.labelRenderer.render(this.scene, this.camera);
    }

    set coolingFailedState(v) {
        this._coolingFailed = v;
        this.setCoolingFailed(v);
    }

    // =========================================================================
    // ROOM SETTINGS: Dynamic Room Rebuild & Sensor Repositioning
    // =========================================================================

    getSensorPositions() {
        const positions = {};
        for (const id in this.sensorMeshes) {
            const g = this.sensorMeshes[id].group;
            positions[id] = {
                x: parseFloat(g.position.x.toFixed(2)),
                y: parseFloat(g.position.y.toFixed(2)),
                z: parseFloat(g.position.z.toFixed(2))
            };
        }
        return positions;
    }

    getDefaultSensorPositions() {
        return {
            'S1': { x: this.doorX,              y: 1.6,  z: -(this.D / 2) + 0.8 },
            'S2': { x: 0,                        y: 1.6,  z: 0 },
            'S3': { x: -(this.W / 2) + 0.8,     y: 2.2,  z: 0 },
            'S4': { x: -Math.min(this.W/2*0.55, 4.0), y: 1.6, z: -0.6 },
            'S5': { x:  (this.W / 2) - 0.8,     y: 1.6,  z: 0 },
            'S6': { x: 0,                        y: 2.6,  z:  (this.D / 2) - 0.8 },
            'S7': { x:  Math.min(this.W/2*0.55, 4.0), y: 1.6, z: 1.8 }
        };
    }

    repositionSensors(sensorPositions) {
        for (const id in sensorPositions) {
            const p = sensorPositions[id];
            if (this.sensorMeshes[id]) {
                this.sensorMeshes[id].group.position.set(p.x, p.y, p.z);
            }
            if (this.heatDiscs[id]) {
                this.heatDiscs[id].position.set(p.x, 0.02, p.z);
            }
        }
    }

    rebuild(newW, newH, newD) {
        // 1. Clear entire Three.js scene
        const toRemove = [...this.scene.children];
        toRemove.forEach(obj => this.scene.remove(obj));

        // 2. Clear CSS2D label overlay
        while (this.labelRenderer.domElement.firstChild) {
            this.labelRenderer.domElement.removeChild(this.labelRenderer.domElement.firstChild);
        }

        // 3. Reset all stored references
        this.doorPivot         = null;
        this.coolingFan        = null;
        this.coolingLight      = null;
        this.ventFan           = null;
        this.strobeLight       = null;
        this.strobeMesh        = null;
        this.evacStripMesh     = null;
        this.exitSignMesh      = null;
        this.sensorLabels      = {};
        this.sensorMeshes      = {};
        this.heatDiscs         = {};
        this.windowGlassMeshes = [];
        this.avatarGroup       = null;
        this.leftLeg = this.rightLeg = this.leftArm = this.rightArm = null;

        // 4. Apply new dimensions
        this.W = newW;  this.H = newH;  this.D = newD;

        // Update window positions relative to new depth
        this.win1Z = -(newD / 4);
        this.win2Z =  (newD / 4);
        this.winY  = newH * 0.4;

        // 5. Reset animation state
        this.doorAngle = 0;  this.doorTarget = 0;
        this.winPos    = 0;  this.winTarget  = 0;
        this.strobeActive     = false;
        this._coolingFailed   = false;
        this.occupancyState   = 'OUTSIDE';
        this.walkWaypoints    = [];
        this.currentWaypointIdx = 0;
        this.walkCycleTime    = 0;

        // 6. Reposition camera for new room size
        const diagXZ  = Math.sqrt(newW * newW + newD * newD);
        const camDist = diagXZ * 1.3;
        this.defaultCamPos    = new THREE.Vector3(-camDist * 0.9, camDist * 0.75, -camDist * 0.9);
        this.defaultCamTarget = new THREE.Vector3(0, newH * 0.3, 0);
        this.camera.position.copy(this.defaultCamPos);
        this.controls.target.copy(this.defaultCamTarget);
        this.controls.minDistance = newW * 0.35;
        this.controls.maxDistance = diagXZ * 4.5;

        // 7. Rebuild scene from scratch
        this.createMaterials();
        this.setupLighting();
        this.buildFloorAndCeiling();
        this.buildWalls();
        this.buildDoor();
        this.buildWindows();
        this.buildCoolingUnit();
        this.buildVentilationSystem();
        this.buildRacks();
        this.buildSensors();
        this.buildHeatDiscs();
        this.buildEmergencyAssets();
        this.buildOccupantAvatar();
        this.buildGroundPlane();

        this.controls.update();
    }
}
