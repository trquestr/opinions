/**
 * CloudRelief — 2.5D Interactive Bas-Relief Cloud for Opinions («Мнения»)
 * 
 * Technology: Three.js + Heightmap Vertex Displacement + Normal Shading + Spring Physics
 * Preserves the antique woodcut engraving style while adding genuine sculptural depth,
 * cursor edge indentation, opposite edge bulging, subtle tilt parallax, and delicate lighting.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['three'], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('three'));
  } else {
    root.CloudRelief = factory(root.THREE);
  }
}(typeof self !== 'undefined' ? self : this, function (THREE) {
  'use strict';

  if (!THREE) {
    console.error('CloudRelief requires Three.js. Please load Three.js before cloud-relief.js.');
  }

  // Global pointer tracker across all CloudRelief instances
  // Enables continuous per-frame hit-testing even when elements drift under a stationary mouse
  if (typeof window !== 'undefined' && !window.__cloudReliefGlobalPointer) {
    window.__cloudReliefGlobalPointer = { x: -9999, y: -9999, inside: false };

    const updateGlobalPointer = (e) => {
      window.__cloudReliefGlobalPointer.x = e.clientX;
      window.__cloudReliefGlobalPointer.y = e.clientY;
      window.__cloudReliefGlobalPointer.inside = true;
    };

    window.addEventListener('pointermove', updateGlobalPointer, { passive: true, capture: true });
    window.addEventListener('pointerdown', updateGlobalPointer, { passive: true, capture: true });

    document.addEventListener('pointerleave', (e) => {
      if (!e.relatedTarget && !e.toElement) {
        window.__cloudReliefGlobalPointer.inside = false;
        window.__cloudReliefGlobalPointer.x = -9999;
        window.__cloudReliefGlobalPointer.y = -9999;
      }
    }, { passive: true });

    window.addEventListener('blur', () => {
      window.__cloudReliefGlobalPointer.inside = false;
      window.__cloudReliefGlobalPointer.x = -9999;
      window.__cloudReliefGlobalPointer.y = -9999;
    }, { passive: true });
  }

  // Default configuration conforming to the specification
  const DEFAULT_CONFIG = {
    depthStrength: 0.065,
    hoverIndentStrength: 0.045,
    oppositeBulgeStrength: 0.065,
    hoverRadius: 0.38,
    maxTilt: 0.22,
    springStiffness: 160,
    springDamping: 22,
    lightingStrength: 0.38,
    enabled: true,
    wireframe: false,
    debugMode: 0,
    segmentsX: 160,
    lightDirection: [-0.35, 0.52, 0.78]
  };

  const VERTEX_SHADER = /* glsl */ `
    uniform sampler2D u_heightmap;
    uniform float u_depthStrength;
    uniform vec2 u_mouseLocal;       // Normalized quad coordinates [-aspect*0.5, aspect*0.5] x [-0.5, 0.5]
    uniform float u_hoverActive;     // 0.0 to 1.0 (spring smoothed)
    uniform float u_hoverIndentStrength;
    uniform float u_oppositeBulgeStrength;
    uniform float u_hoverRadius;
    uniform float u_enabled;
    uniform int u_debugMode;

    varying vec2 vUv;
    varying float vHeight;

    void main() {
      vUv = uv;

      // Sample base height (0.0 at borders, up to 1.0 at billow crests)
      float baseH = texture2D(u_heightmap, uv).r;
      vHeight = baseH;

      // If disabled or debug mode 1 (original 2D PNG), keep plane completely flat
      if (u_enabled < 0.5 || u_debugMode == 1) {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        return;
      }

      vec2 posLocal = position.xy;

      // 1. Local Indentation (sinks surface under cursor backwards by -Z)
      float distCursor = length(posLocal - u_mouseLocal);
      // Smooth cubic / hermite falloff
      float indentFactor = smoothstep(u_hoverRadius, 0.0, distCursor);
      float indentZ = -indentFactor * u_hoverIndentStrength * u_hoverActive;

      // 2. Opposite Bulge (lifts opposite edge forwards by +Z)
      vec2 oppositeCenter = -u_mouseLocal;
      float distOpposite = length(posLocal - oppositeCenter);
      float bulgeFactor = smoothstep(u_hoverRadius * 1.35, 0.0, distOpposite);
      float bulgeZ = bulgeFactor * u_oppositeBulgeStrength * u_hoverActive;

      // Pin displacement to zero at silhouette edges so borders remain seamless
      float borderPin = smoothstep(0.01, 0.18, baseH);
      float interactionZ = (indentZ + bulgeZ) * borderPin;

      // Final vertex displacement: Base Sculptural Relief + Interactive Indent + Opposite Bulge
      float totalZ = baseH * u_depthStrength + interactionZ;

      vec3 displacedPos = vec3(position.x, position.y, totalZ);

      gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPos, 1.0);
    }
  `;

  const FRAGMENT_SHADER = /* glsl */ `
    uniform sampler2D u_diffuse;
    uniform sampler2D u_normalMap;
    uniform float u_lightingStrength;
    uniform vec3 u_lightDir;
    uniform int u_debugMode;
    uniform float u_opacity;

    varying vec2 vUv;
    varying float vHeight;

    void main() {
      vec4 texColor = texture2D(u_diffuse, vUv);

      // Discard outside silhouette to prevent any rectangular plane artifact
      if (texColor.a < 0.02) {
        discard;
      }

      // Debug Modes:
      // Mode 1: Original 2D PNG without any 3D modifications
      if (u_debugMode == 1) {
        gl_FragColor = vec4(texColor.rgb, texColor.a * u_opacity);
        return;
      }

      // Mode 2: Grayscale Heightmap view
      if (u_debugMode == 2) {
        gl_FragColor = vec4(vec3(vHeight), texColor.a * u_opacity);
        return;
      }

      // Mode 3: Tangent-space Normal Map RGB view
      if (u_debugMode == 3) {
        vec3 normRGB = texture2D(u_normalMap, vUv).rgb;
        gl_FragColor = vec4(normRGB, texColor.a * u_opacity);
        return;
      }

      // Mode 5: Unlit result (pure original texture mapped on deformed geometry, no extra shading)
      if (u_debugMode == 5) {
        gl_FragColor = vec4(texColor.rgb, texColor.a * u_opacity);
        return;
      }

      // Mode 0: Final High-Fidelity 2.5D Relief with Delicately Modulated Shading
      vec3 normalTex = texture2D(u_normalMap, vUv).rgb * 2.0 - 1.0;
      // Invert Y in tangent space to match WebGL UV orientation
      normalTex.y = -normalTex.y;
      vec3 N = normalize(normalTex);

      // Directional light in tangent space
      vec3 L = normalize(u_lightDir);
      float NdotL = dot(N, L);
      float diffuse = clamp(NdotL, 0.0, 1.0);

      // Subtle relief modulation factor:
      // Neutral baseline is ~0.66. Slopes facing light are gently brightened (+),
      // slopes facing away and crevices are subtly shaded (-).
      float lightModulation = 1.0 + (diffuse - 0.66) * 0.42;

      // Ensure black hatching lines remain deeply dark, and white puffs retain their purity
      vec3 finalRgb = texColor.rgb * mix(1.0, lightModulation, u_lightingStrength);

      gl_FragColor = vec4(finalRgb, texColor.a * u_opacity);
    }
  `;

  class CloudRelief {
    constructor(container, options = {}) {
      if (!container) {
        throw new Error('CloudRelief: container element or selector is required.');
      }
      this.container = typeof container === 'string' ? document.querySelector(container) : container;
      if (!this.container) {
        throw new Error('CloudRelief: container element not found in DOM.');
      }

      this.options = Object.assign({
        diffuseMap: '/assets/hero-cloud.png',
        heightMap: '/assets/hero-cloud-heightmap.png',
        normalMap: '/assets/hero-cloud-normal.png',
        aspectRatio: 1024 / 768, // 4:3 default for hero-cloud
        autoResize: true,
        useSharedRenderer: null,
        onReady: null
      }, options);

      this.config = Object.assign({}, DEFAULT_CONFIG, options.config || {});

      // Motion preferences
      this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

      // Physics state
      this.hoverActive = 0.0;
      this.targetHoverActive = 0.0;
      this.velocityHoverActive = 0.0;

      this.mouseNorm = { x: 0.0, y: 0.0 };         // Normalized to [-1, 1] relative to cloud
      this.mouseLocal = { x: 0.0, y: 0.0 };        // Normalized quad position [-aspect*0.5, aspect*0.5] x [-0.5, 0.5]
      this.currentMouseLocal = { x: 0.0, y: 0.0 };
      this.velocityMouseLocal = { x: 0.0, y: 0.0 };

      this.currentTiltX = 0.0;
      this.currentTiltY = 0.0;
      this.targetTiltX = 0.0;
      this.targetTiltY = 0.0;
      this.velocityTiltX = 0.0;
      this.velocityTiltY = 0.0;

      this.isInsideSilhouette = false;
      this.isPointerOver = false;
      this.isDestroyed = false;
      this.isRendering = false;
      this.lastFrameTime = performance.now();
      // Замыкание для rAF создаётся один раз, а не на каждый кадр
      this._tick = (t) => this._animate(t);

      // Alpha mask for pixel-perfect silhouette hit-testing
      this.alphaMaskData = null;
      this.alphaMaskWidth = 0;
      this.alphaMaskHeight = 0;

      // Debug mode HUD element
      this.debugPanel = null;

      // Fallback <img> element if WebGL fails
      this.fallbackImg = null;

      this._init();
    }

    _init() {
      try {
        this._setupScene();
        this._loadTexturesAndBuildMesh();
        this._setupEventListeners();
        if (this.options.enableDebugHUD !== false) {
          this._createDebugHUD();
        }
      } catch (err) {
        console.warn('CloudRelief: WebGL initialization failed. Falling back to static image.', err);
        this._showFallback();
      }
    }

    _setupScene() {
      const rect = this.container.getBoundingClientRect();
      this.width = this.options.width || rect.width || 600;
      this.height = this.options.height || rect.height || (this.width / this.options.aspectRatio);

      // Scene
      this.scene = new THREE.Scene();

      // View margins so 3D droplets can orbit freely ABOVE, BELOW, and around the cloud without canvas clipping
      this.viewMargin = { x: 1.40, y: 1.50 };
      const viewAspect = (this.width * this.viewMargin.x) / (this.height * this.viewMargin.y);

      // Camera: Perspective camera with narrow FOV (30°)
      const fov = 30;
      this.camera = new THREE.PerspectiveCamera(fov, viewAspect, 0.1, 100);
      
      const targetHeight = 3.0;
      const targetWidth = targetHeight * this.options.aspectRatio;
      this.targetMeshSize = { width: targetWidth, height: targetHeight };

      // Camera distance views the padded height
      const viewHeight = targetHeight * this.viewMargin.y;
      const dist = (viewHeight * 0.5) / Math.tan((fov * 0.5 * Math.PI) / 180);
      this.camera.position.set(0, 0, dist);
      this.camera.lookAt(0, 0, 0);

      // WebGL Renderer
      if (this.options.useSharedRenderer) {
        this.renderer = this.options.useSharedRenderer;
      } else {
        this.renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: 'high-performance'
        });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.renderer.setPixelRatio(dpr);
        this.renderer.setSize(this.width * this.viewMargin.x, this.height * this.viewMargin.y, false);
        this.renderer.setClearColor(0x000000, 0);

        this.domElement = this.renderer.domElement;
        this.domElement.className = 'cloud-relief-canvas';
        this.domElement.style.width = '100%';
        this.domElement.style.height = '100%';
        this.domElement.style.display = 'block';
        this.domElement.style.pointerEvents = 'auto';
        this.container.appendChild(this.domElement);
      }
    }

    _loadTexturesAndBuildMesh() {
      const loader = new THREE.TextureLoader();
      let loadedCount = 0;
      const totalTextures = 3;

      const checkLoaded = () => {
        loadedCount++;
        if (loadedCount === totalTextures && !this.isDestroyed) {
          this._createMesh();
          this._buildAlphaHitMask(this.diffuseTexture.image);
          this._requestFrame();
          if (typeof this.options.onReady === 'function') {
            this.options.onReady(this);
          }
        }
      };

      const onError = (err) => {
        if (this.isDestroyed) return;
        console.warn('CloudRelief: Texture loading error:', err);
        this._showFallback();
      };

      this.diffuseTexture = loader.load(this.options.diffuseMap, (tex) => {
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        if (tex.image && tex.image.width && tex.image.height) {
          this.options.aspectRatio = tex.image.width / tex.image.height;
          this.targetMeshSize.width = this.targetMeshSize.height * this.options.aspectRatio;
        }
        checkLoaded();
      }, undefined, onError);

      this.heightTexture = loader.load(this.options.heightMap, (tex) => {
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        checkLoaded();
      }, undefined, onError);

      this.normalTexture = loader.load(this.options.normalMap, (tex) => {
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        checkLoaded();
      }, undefined, onError);
    }

    _buildAlphaHitMask(image) {
      if (!image || !image.width) return;
      try {
        const offCanvas = document.createElement('canvas');
        const scale = Math.min(1.0, 256 / Math.max(image.width, image.height));
        this.alphaMaskWidth = Math.max(1, Math.floor(image.width * scale));
        this.alphaMaskHeight = Math.max(1, Math.floor(image.height * scale));
        offCanvas.width = this.alphaMaskWidth;
        offCanvas.height = this.alphaMaskHeight;
        const ctx = offCanvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(image, 0, 0, this.alphaMaskWidth, this.alphaMaskHeight);
        const imgData = ctx.getImageData(0, 0, this.alphaMaskWidth, this.alphaMaskHeight);
        this.alphaMaskData = imgData.data; // RGBA array
      } catch (e) {
        console.warn('CloudRelief: Unable to read alpha channel for hit testing (cross-origin limitation). Using geometric bounds.', e);
        this.alphaMaskData = null;
      }
    }

    _checkAlphaHit(u, v) {
      if (!this.alphaMaskData) return true; // Default to hit if cross-origin canvas is blocked
      const px = Math.floor(u * this.alphaMaskWidth);
      const py = Math.floor((1.0 - v) * this.alphaMaskHeight); // Texture V is inverted in 2D canvas
      if (px < 0 || px >= this.alphaMaskWidth || py < 0 || py >= this.alphaMaskHeight) return false;
      const idx = (py * this.alphaMaskWidth + px) * 4 + 3; // Alpha channel
      return this.alphaMaskData[idx] > 30; // Solid cloud body
    }

    _createMesh() {
      // Proportional PlaneGeometry with adaptive segments based on aspect ratio
      const w = this.targetMeshSize.width;
      const h = this.targetMeshSize.height;
      const segX = this.config.segmentsX || 160;
      const segY = Math.max(30, Math.round(segX / this.options.aspectRatio));
      this.geometry = new THREE.PlaneGeometry(w, h, segX, segY);

      // Custom Shader Material
      this.uniforms = {
        u_diffuse: { value: this.diffuseTexture },
        u_heightmap: { value: this.heightTexture },
        u_normalMap: { value: this.normalTexture },
        u_depthStrength: { value: this.config.depthStrength * w },
        u_mouseLocal: { value: new THREE.Vector2(0, 0) },
        u_hoverActive: { value: 0.0 },
        u_hoverIndentStrength: { value: this.config.hoverIndentStrength * w },
        u_oppositeBulgeStrength: { value: this.config.oppositeBulgeStrength * w },
        u_hoverRadius: { value: this.config.hoverRadius * w },
        u_lightingStrength: { value: this.config.lightingStrength },
        u_lightDir: { value: new THREE.Vector3(...this.config.lightDirection).normalize() },
        u_enabled: { value: this.config.enabled ? 1.0 : 0.0 },
        u_debugMode: { value: this.config.debugMode },
        u_opacity: { value: 1.0 }
      };

      this.material = new THREE.ShaderMaterial({
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: true,
        depthTest: true,
        wireframe: this.config.wireframe
      });

      this.mesh = new THREE.Mesh(this.geometry, this.material);
      this.scene.add(this.mesh);

      this._setupOrbitalSwarm();

      this.resize();
    }

    // ========================================================================
    // 3D Rutherford Atom / Planetary Orbit Swarm (3 Tilted Intersecting Rings)
    // ========================================================================
    _setupOrbitalSwarm() {
      this.swarmGroup = new THREE.Group();
      this.scene.add(this.swarmGroup);

      this.swarmActive = 0.0;
      this.targetSwarmActive = 0.0;
      this.swarmTime = 0.0;

      const w = this.targetMeshSize.width;
      const h = this.targetMeshSize.height;

      // 3 Rutherford / Atom orbital rings exactly matching user diagram:
      // Ring 0: diagonal left-down to right-up (-26° XY tilt)
      // Ring 1: diagonal right-down to left-up (+26° XY tilt)
      // Ring 2: steep near-vertical loop (+76° XY tilt, stretching high above and deep below)
      this.orbitalRings = [
        { alpha: -24 * Math.PI / 180, beta: 34 * Math.PI / 180, a: w * 0.40, b: h * 0.40, count: 6, speed: 0.36 },
        { alpha: 24 * Math.PI / 180, beta: -34 * Math.PI / 180, a: w * 0.40, b: h * 0.40, count: 6, speed: 0.32 },
        { alpha: 76 * Math.PI / 180, beta: 38 * Math.PI / 180, a: h * 0.54, b: w * 0.18, count: 6, speed: 0.40 }
      ];

      this.swarmDroplets = [];
      this.sphereMat = new THREE.MeshBasicMaterial({
        color: 0x0a0a0a,
        depthTest: true,
        depthWrite: true
      });

      // Organic, varied droplet sizes with larger primary drops and satellites
      const ringRadii = [
        [0.096, 0.046, 0.078, 0.038, 0.088, 0.058],
        [0.072, 0.104, 0.042, 0.084, 0.052, 0.068],
        [0.092, 0.054, 0.082, 0.036, 0.100, 0.048]
      ];

      this.sphereGeo = new THREE.SphereGeometry(1, 24, 24);

      this.orbitalRings.forEach((ring, ringIdx) => {
        const sizes = ringRadii[ringIdx] || [0.085, 0.050, 0.075, 0.040, 0.090, 0.060];

        // 6 droplets per ring, spaced along the orbit
        for (let k = 0; k < ring.count; k++) {
          const dMesh = new THREE.Mesh(this.sphereGeo, this.sphereMat);
          const radius = sizes[k % sizes.length];
          dMesh.scale.set(0, 0, 0);

          const phase = (k / ring.count) * Math.PI * 2;
          const totalIdx = ringIdx * 6 + k;

          // Natural detachment properties from cursor area:
          // Golden ratio angle spiral distribution for organic spread around cursor
          const spawnAngle = totalIdx * 2.399963;
          const spawnRadius = 0.06 + (totalIdx % 5) * 0.038;
          const spawnDelay = totalIdx * 0.040; // Ступенчатый отрыв: последняя капля стартует при swarmActive ≈ 0.68 (~0.18 с)

          this.swarmDroplets.push({
            mesh: dMesh,
            ring,
            phase,
            baseRadius: radius,
            currentScale: 0.0,
            deflectX: 0,
            deflectY: 0,
            deflectZ: 0,
            spawnAngle,
            spawnRadius,
            spawnDelay,
            migration: 0.0,
            originX: 0,
            originY: 0,
            originZ: 0
          });

          this.swarmGroup.add(dMesh);
        }
      });
    }

    _setupEventListeners() {
      this._onPointerMove = this._onPointerMove.bind(this);
      this._onPointerEnter = this._onPointerEnter.bind(this);
      this._onPointerLeave = this._onPointerLeave.bind(this);
      this._onResize = this._onResize.bind(this);
      this._onKeyDown = this._onKeyDown.bind(this);

      const el = this.domElement || this.container;
      el.addEventListener('pointerenter', this._onPointerEnter, { passive: true });
      el.addEventListener('pointermove', this._onPointerMove, { passive: true });
      el.addEventListener('pointerleave', this._onPointerLeave, { passive: true });

      if (this.options.autoResize) {
        window.addEventListener('resize', this._onResize, { passive: true });
      }

      // Горячая клавиша HUD нужна только если HUD включён
      if (this.options.enableDebugHUD !== false) {
        window.addEventListener('keydown', this._onKeyDown, { passive: true });
      }
    }

    _onPointerEnter(e) {
      if (this.reducedMotion.matches || !this.config.enabled) return;
      this.isPointerOver = true;
      this._updatePointerCoordinates(e);
      this._requestFrame();
    }

    _onPointerMove(e) {
      if (this.reducedMotion.matches || !this.config.enabled) return;
      this.isPointerOver = true;
      this._updatePointerCoordinates(e);
      this._requestFrame();
    }

    _updatePointerCoordinates(e) {
      const rect = this.container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      // Coordinate across cloud container [-1, 1]
      const normX = ((e.clientX - rect.left) / rect.width) * 2.0 - 1.0;
      const normY = -(((e.clientY - rect.top) / rect.height) * 2.0 - 1.0); // Y points up in WebGL

      // UV coordinates [0, 1] on the cloud texture
      const u = (normX * 0.5) + 0.5;
      const v = (normY * 0.5) + 0.5;

      this.mouseNorm.x = Math.max(-1.0, Math.min(1.0, normX));
      this.mouseNorm.y = Math.max(-1.0, Math.min(1.0, normY));

      // Local mesh coordinates for vertex displacement
      const w = this.targetMeshSize.width;
      const h = this.targetMeshSize.height;
      this.mouseLocal.x = this.mouseNorm.x * (w * 0.5);
      this.mouseLocal.y = this.mouseNorm.y * (h * 0.5);

      // Hit-testing against alpha mask (section 6.1)
      this.isInsideSilhouette = (u >= 0.0 && u <= 1.0 && v >= 0.0 && v <= 1.0) && this._checkAlphaHit(u, v);

      if (this.isInsideSilhouette) {
        this.isPointerOver = true;
        this.targetHoverActive = 1.0;
        this.targetTiltY = this.mouseNorm.x * this.config.maxTilt;
        this.targetTiltX = -this.mouseNorm.y * this.config.maxTilt;
      } else {
        this.isPointerOver = false;
        this.targetHoverActive = 0.0;
        this.targetTiltX = 0.0;
        this.targetTiltY = 0.0;
      }
    }

    _onPointerLeave() {
      this.isPointerOver = false;
      this.isInsideSilhouette = false;
      this.targetHoverActive = 0.0;
      this.targetTiltX = 0.0;
      this.targetTiltY = 0.0;
      this._requestFrame();
    }

    _onKeyDown(e) {
      // Toggle debug HUD with key 'd' or 'D' (when not inside an input field)
      if ((e.key === 'd' || e.key === 'D' || e.key === 'в' || e.key === 'В') && !e.target.closest('input, textarea, select')) {
        this.toggleDebugHUD();
      }
    }

    _onResize() {
      this.resize();
    }

    resize() {
      if (!this.container || this.isDestroyed) return;
      const rect = this.container.getBoundingClientRect();
      const newWidth = rect.width || 600;
      const newHeight = rect.height || (newWidth / this.options.aspectRatio);

      const dprNow = Math.min(window.devicePixelRatio || 1, 2);
      if (newWidth === this.width && newHeight === this.height && dprNow === this._lastResizeDpr) return;
      this._lastResizeDpr = dprNow;

      this.width = newWidth;
      this.height = newHeight;

      const mx = this.viewMargin ? this.viewMargin.x : 1.40;
      const my = this.viewMargin ? this.viewMargin.y : 1.50;
      if (this.renderer && !this.options.useSharedRenderer) {
        // DPR меняется при переносе окна на другой монитор — держим буфер чётким
        if (this.renderer.getPixelRatio() !== dprNow) this.renderer.setPixelRatio(dprNow);
        this.renderer.setSize(this.width * mx, this.height * my, false);
      }
      if (this.camera) {
        this.camera.aspect = (this.width * mx) / (this.height * my);
        this.camera.updateProjectionMatrix();
      }
      this._requestFrame();
    }

    _requestFrame() {
      if (!this.isRendering && !this.isDestroyed) {
        this.isRendering = true;
        this.lastFrameTime = 0; // Sentinel 0 ensures first frame uses safe fixed dt (no negative dt)
        requestAnimationFrame(this._tick);
      }
    }

    _animate(now) {
      if (this.isDestroyed) return;

      const dt = (this.lastFrameTime > 0 && now > this.lastFrameTime)
        ? Math.min(Math.max((now - this.lastFrameTime) * 0.001, 0.001), 0.064)
        : 0.016;
      this.lastFrameTime = now;

      // Continuous per-frame hit-testing against global cursor position
      // Fixes bug where drifting / animated clouds move under a stationary cursor:
      // Browsers do NOT dispatch pointermove or pointerleave on moving elements under a static mouse.
      if (typeof window !== 'undefined' && window.__cloudReliefGlobalPointer) {
        const ptr = window.__cloudReliefGlobalPointer;
        if (!ptr.inside) {
          this.isPointerOver = false;
          this.isInsideSilhouette = false;
          this.targetHoverActive = 0.0;
          this.targetTiltX = 0.0;
          this.targetTiltY = 0.0;
        } else {
          const rect = this.container.getBoundingClientRect();
          const inBounds = rect.width > 0 && rect.height > 0 &&
                           ptr.x >= rect.left && ptr.x <= rect.right &&
                           ptr.y >= rect.top && ptr.y <= rect.bottom;

          if (inBounds) {
            const normX = ((ptr.x - rect.left) / rect.width) * 2.0 - 1.0;
            const normY = -(((ptr.y - rect.top) / rect.height) * 2.0 - 1.0);

            const u = (normX * 0.5) + 0.5;
            const v = (normY * 0.5) + 0.5;

            this.mouseNorm.x = Math.max(-1.0, Math.min(1.0, normX));
            this.mouseNorm.y = Math.max(-1.0, Math.min(1.0, normY));
            this.mouseLocal.x = this.mouseNorm.x * (this.targetMeshSize.width * 0.5);
            this.mouseLocal.y = this.mouseNorm.y * (this.targetMeshSize.height * 0.5);

            this.isInsideSilhouette = (u >= 0.0 && u <= 1.0 && v >= 0.0 && v <= 1.0) && this._checkAlphaHit(u, v);
            if (this.isInsideSilhouette) {
              this.isPointerOver = true;
              this.targetHoverActive = 1.0;
              this.targetTiltY = this.mouseNorm.x * this.config.maxTilt;
              this.targetTiltX = -this.mouseNorm.y * this.config.maxTilt;
            } else {
              this.isPointerOver = false;
              this.targetHoverActive = 0.0;
              this.targetTiltX = 0.0;
              this.targetTiltY = 0.0;
            }
          } else {
            // Cloud has drifted away from the cursor!
            this.isPointerOver = false;
            this.isInsideSilhouette = false;
            this.targetHoverActive = 0.0;
            this.targetTiltX = 0.0;
            this.targetTiltY = 0.0;
          }
        }
      }

      const stiffness = this.config.springStiffness;
      const damping = this.config.springDamping;

      // 1. Spring-damper for hover activation (0.0 to 1.0)
      const forceHover = -stiffness * (this.hoverActive - this.targetHoverActive) - damping * this.velocityHoverActive;
      this.velocityHoverActive += forceHover * dt;
      this.hoverActive += this.velocityHoverActive * dt;
      if (this.targetHoverActive === 0.0 && this.hoverActive <= 0.005) {
        this.hoverActive = 0.0;
        this.velocityHoverActive = 0.0;
      } else if (Math.abs(this.hoverActive - this.targetHoverActive) < 0.0005 && Math.abs(this.velocityHoverActive) < 0.001) {
        this.hoverActive = this.targetHoverActive;
        this.velocityHoverActive = 0.0;
      }

      // 2. Spring-damper for local cursor coordinates
      const targetLocalX = this.isInsideSilhouette ? this.mouseLocal.x : this.currentMouseLocal.x;
      const targetLocalY = this.isInsideSilhouette ? this.mouseLocal.y : this.currentMouseLocal.y;

      const forceX = -stiffness * (this.currentMouseLocal.x - targetLocalX) - damping * this.velocityMouseLocal.x;
      this.velocityMouseLocal.x += forceX * dt;
      this.currentMouseLocal.x += this.velocityMouseLocal.x * dt;

      const forceY = -stiffness * (this.currentMouseLocal.y - targetLocalY) - damping * this.velocityMouseLocal.y;
      this.velocityMouseLocal.y += forceY * dt;
      this.currentMouseLocal.y += this.velocityMouseLocal.y * dt;

      // 3. Spring-damper for mesh tilts (3-5° maximum)
      const forceTiltX = -stiffness * (this.currentTiltX - this.targetTiltX) - damping * this.velocityTiltX;
      this.velocityTiltX += forceTiltX * dt;
      this.currentTiltX += this.velocityTiltX * dt;

      const forceTiltY = -stiffness * (this.currentTiltY - this.targetTiltY) - damping * this.velocityTiltY;
      this.velocityTiltY += forceTiltY * dt;
      this.currentTiltY += this.velocityTiltY * dt;

      // Apply to uniforms & mesh rotation
      if (this.uniforms) {
        this.uniforms.u_hoverActive.value = Math.max(0.0, Math.min(1.0, this.hoverActive));
        this.uniforms.u_mouseLocal.value.set(this.currentMouseLocal.x, this.currentMouseLocal.y);
      }
      if (this.mesh) {
        this.mesh.rotation.x = this.reducedMotion.matches ? 0 : this.currentTiltX;
        this.mesh.rotation.y = this.reducedMotion.matches ? 0 : this.currentTiltY;
      }

      // Update 3D Rutherford orbital swarm (flying ABOVE, BELOW, IN FRONT, and BEHIND the cloud)
      if (this.swarmDroplets && this.swarmDroplets.length > 0) {
        const isHovered = this.isInsideSilhouette;
        this.targetSwarmActive = isHovered ? 1.0 : 0.0;
        // Появление роя под курсором ~0.37 с до 90% (было 0.055 ≈ 0.7 с); сам уход на орбиту — migInFactor, он медленный
        const swarmEase = this.targetSwarmActive > 0.5 ? 0.10 : 0.20;

        // Новый заход на облако: капли, которые уже почти вернулись в «лужу» (migration < 0.5),
        // перерождаются под текущим курсором с нуля, а не долетают до старой точки входа
        if (isHovered && !this._swarmWasHovered) {
          for (let i = 0; i < this.swarmDroplets.length; i++) {
            const d = this.swarmDroplets[i];
            if (d.migration < 0.5) {
              d.migration = 0.0;
              d.currentScale = 0.0;
            }
          }
        }
        this._swarmWasHovered = isHovered;
        this.swarmActive += (this.targetSwarmActive - this.swarmActive) * (1 - Math.pow(1 - swarmEase, dt * 60));
        this.swarmActive = Math.max(0.0, Math.min(1.0, this.swarmActive));
        if (this.targetSwarmActive === 0.0 && this.swarmActive < 0.02) {
          this.swarmActive = 0.0;
        }

        // Trajectory lines hidden per user specification

        if (this.swarmActive > 0.001 || this.targetSwarmActive > 0) {
          this.swarmTime += dt;
          const t = this.swarmTime;

          const mx = this.currentMouseLocal.x;
          const my = this.currentMouseLocal.y;
          const vx = this.velocityMouseLocal.x;
          const vy = this.velocityMouseLocal.y;

          // Коэффициенты затухания зависят только от dt — считаем раз за кадр, а не на каждую каплю
          const dtF = dt * 60;
          const migInFactor = 1 - Math.pow(1 - 0.050, dtF); // плавный уход на орбиту ~0.75 с до 90%
          const migOutFactor = 1 - Math.pow(1 - 0.20, dtF);
          const deflectFactor = 1 - Math.pow(0.88, dtF);
          const scaleFactor = 1 - Math.pow(0.80, dtF); // проявление капли под курсором ~0.17 с до 90%, видна уже со 2–3 кадра

          for (let i = 0; i < this.swarmDroplets.length; i++) {
            const d = this.swarmDroplets[i];
            const ring = d.ring;
            const th = d.phase + t * ring.speed;

            // Parametric 3D Rutherford ellipse
            const u = ring.a * Math.cos(th);
            const v = ring.b * Math.sin(th);

            const xPrime = u;
            const yPrime = v * Math.cos(ring.beta);
            const zPrime = v * Math.sin(ring.beta);

            const xOrbit = xPrime * Math.cos(ring.alpha) - yPrime * Math.sin(ring.alpha);
            const yOrbit = xPrime * Math.sin(ring.alpha) + yPrime * Math.cos(ring.alpha);
            const zOrbit = zPrime;

            // Точка отрыва — под реальным курсором (mouseLocal), а не под пружинным currentMouseLocal:
            // пружина вне облака замирает в точке выхода и при новом заходе тащит «лужу» со старого места
            if (isHovered && d.migration < 0.001) {
              d.originX = this.mouseLocal.x + Math.cos(d.spawnAngle) * d.spawnRadius;
              d.originY = this.mouseLocal.y + Math.sin(d.spawnAngle) * d.spawnRadius;
              d.originZ = 0.05;
            }

            // Staggered migration: droplets detach sequentially from cursor and crawl onto orbit
            const effectiveActive = Math.max(0.0, this.swarmActive - d.spawnDelay);
            const targetMig = isHovered ? (effectiveActive > 0 ? 1.0 : 0.0) : 0.0;
            d.migration += (targetMig - d.migration) * (targetMig > 0.5 ? migInFactor : migOutFactor);
            if (!isHovered && d.migration < 0.01) {
              d.migration = 0.0;
            }

            // Silky smooth sinusoidal curve for migration progress
            const m = Math.max(0.0, Math.min(1.0, d.migration));
            const easeM = 0.5 - 0.5 * Math.cos(m * Math.PI);

            // Interpolate from cursor origin to 3D Rutherford orbital position
            const xMigrated = (1.0 - easeM) * d.originX + easeM * xOrbit;
            const yMigrated = (1.0 - easeM) * d.originY + easeM * yOrbit;
            // Arc gracefully in Z during migration so droplets lift organically off the cloud surface into space
            const zArc = Math.sin(easeM * Math.PI) * 0.22;
            const zMigrated = (1.0 - easeM) * d.originZ + easeM * zOrbit + zArc;

            // Interactive cursor reaction: nearby droplets react to cursor position and movement once in orbit
            let targetDefX = 0;
            let targetDefY = 0;
            let targetDefZ = 0;

            if (this.hoverActive > 0.05 && easeM > 0.6) {
              const ddx = xMigrated - mx;
              const ddy = yMigrated - my;
              const distCursor = Math.hypot(ddx, ddy);
              if (distCursor < 1.4) {
                const prox = 1.0 - (distCursor / 1.4);
                targetDefX = vx * 0.18 * prox;
                targetDefY = vy * 0.18 * prox;
                targetDefZ = 0.10 * prox;
              }
            }

            d.deflectX += (targetDefX - d.deflectX) * deflectFactor;
            d.deflectY += (targetDefY - d.deflectY) * deflectFactor;
            d.deflectZ += (targetDefZ - d.deflectZ) * deflectFactor;

            d.mesh.position.set(
              xMigrated + d.deflectX,
              yMigrated + d.deflectY,
              zMigrated + d.deflectZ
            );

            // Organic scale: droplet blooms as it detaches from cursor puddle
            // Под курсором капля сразу видна на 55% размера и дорастает при отрыве.
            // При наведении цель не умножается на сглаженный swarmActive: иначе три каскадных
            // сглаживания (swarmActive × bloom × scaleFactor) дают «мёртвый старт» ~150 мс,
            // когда капли меньше 7% и их не видно. На уходе swarmActive по-прежнему гасит рой.
            const bloom = Math.min(1.0, m * 2.2);
            const presence = isHovered ? 1.0 : this.swarmActive;
            const targetScale = d.baseRadius * presence * (0.55 + bloom * 0.45);
            d.currentScale += (targetScale - d.currentScale) * scaleFactor;
            d.currentScale = Math.max(0.0, d.currentScale);
            const sc = Math.max(0.0001, d.currentScale);
            d.mesh.scale.set(sc, sc, sc);
            d.mesh.visible = this.swarmActive > 0.005 && d.currentScale > 0.0002;
          }
        } else {
          for (let i = 0; i < this.swarmDroplets.length; i++) {
            this.swarmDroplets[i].mesh.visible = false;
            this.swarmDroplets[i].currentScale = 0.0;
            this.swarmDroplets[i].migration = 0.0;
          }
        }
      }

      // Render frame
      this.render();

      // Check if animation has settled to resting state
      const isSettled =
        Math.abs(this.hoverActive - this.targetHoverActive) < 0.0005 &&
        Math.abs(this.velocityHoverActive) < 0.001 &&
        Math.abs(this.currentTiltX - this.targetTiltX) < 0.0001 &&
        Math.abs(this.currentTiltY - this.targetTiltY) < 0.0001 &&
        !this.isInsideSilhouette &&
        !this.isPointerOver &&
        (!this.swarmActive || this.swarmActive < 0.001);

      if (!isSettled) {
        requestAnimationFrame(this._tick);
      } else {
        this.isRendering = false;
      }

      // Update HUD metrics if active
      if (this.debugPanel && this.debugPanel.classList.contains('is-visible')) {
        this._updateHUDMetrics();
      }
    }

    render() {
      if (this.renderer && this.scene && this.camera && !this.isDestroyed) {
        this.renderer.render(this.scene, this.camera);
      }
    }

    setConfig(newConfig) {
      Object.assign(this.config, newConfig);
      if (this.uniforms) {
        const w = this.targetMeshSize.width;
        this.uniforms.u_depthStrength.value = this.config.depthStrength * w;
        this.uniforms.u_hoverIndentStrength.value = this.config.hoverIndentStrength * w;
        this.uniforms.u_oppositeBulgeStrength.value = this.config.oppositeBulgeStrength * w;
        this.uniforms.u_hoverRadius.value = this.config.hoverRadius * w;
        this.uniforms.u_lightingStrength.value = this.config.lightingStrength;
        this.uniforms.u_enabled.value = this.config.enabled ? 1.0 : 0.0;
        this.uniforms.u_debugMode.value = this.config.debugMode;
        if (this.config.lightDirection) {
          this.uniforms.u_lightDir.value.set(...this.config.lightDirection).normalize();
        }
      }
      if (this.material) {
        this.material.wireframe = !!this.config.wireframe || this.config.debugMode === 4;
      }
      this._requestFrame();
    }

    getConfig() {
      return Object.assign({}, this.config);
    }

    setDebugMode(mode) {
      const modeMap = {
        'final': 0,
        'original': 1,
        'heightmap': 2,
        'normal': 3,
        'wireframe': 4,
        'unlit': 5
      };
      const num = typeof mode === 'string' ? (modeMap[mode.toLowerCase()] ?? 0) : mode;
      this.setConfig({
        debugMode: num,
        wireframe: num === 4
      });
      if (this.debugPanel) {
        const buttons = this.debugPanel.querySelectorAll('.debug-mode-btn');
        buttons.forEach((btn, idx) => {
          btn.classList.toggle('is-active', idx === num);
        });
      }
    }

    setOpacity(val) {
      if (this.uniforms && this.uniforms.u_opacity) {
        this.uniforms.u_opacity.value = Math.max(0.0, Math.min(1.0, val));
        this._requestFrame();
      }
    }

    _showFallback() {
      if (this.domElement && this.domElement.parentNode) {
        this.domElement.parentNode.removeChild(this.domElement);
      }
      if (!this.fallbackImg) {
        this.fallbackImg = document.createElement('img');
        this.fallbackImg.src = this.options.diffuseMap;
        this.fallbackImg.alt = 'Облако';
        this.fallbackImg.draggable = false;
        this.fallbackImg.className = 'cloud-relief-fallback';
        this.fallbackImg.style.width = '100%';
        this.fallbackImg.style.height = 'auto';
        this.fallbackImg.style.display = 'block';
        this.container.appendChild(this.fallbackImg);
      }
    }

    // ========================================================================
    // Debug HUD Panel (Section 11)
    // ========================================================================
    _createDebugHUD() {
      const panel = document.createElement('div');
      panel.className = 'cloud-relief-debug-panel';
      panel.innerHTML = /* html */ `
        <div class="debug-hud-header">
          <div class="debug-hud-title">2.5D Relief Cloud HUD</div>
          <button type="button" class="debug-hud-close" title="Закрыть (D)">×</button>
        </div>
        <div class="debug-hud-section">
          <label class="debug-hud-label">Режим отображения:</label>
          <div class="debug-modes-grid">
            <button type="button" class="debug-mode-btn is-active" data-mode="0">0. Финал</button>
            <button type="button" class="debug-mode-btn" data-mode="1">1. Исходный PNG</button>
            <button type="button" class="debug-mode-btn" data-mode="2">2. Карта высот</button>
            <button type="button" class="debug-mode-btn" data-mode="3">3. Нормали</button>
            <button type="button" class="debug-mode-btn" data-mode="4">4. Wireframe</button>
            <button type="button" class="debug-mode-btn" data-mode="5">5. Без света</button>
          </div>
        </div>

        <div class="debug-hud-section">
          <label class="debug-hud-label">Параметры рельефа:</label>
          
          <div class="debug-slider-row">
            <span>Базовая глубина (depthStrength):</span>
            <input type="range" class="debug-slider" data-param="depthStrength" min="0.0" max="0.80" step="0.01" value="${this.config.depthStrength}">
            <strong class="val-depthStrength">${this.config.depthStrength.toFixed(2)}</strong>
          </div>

          <div class="debug-slider-row">
            <span>Продавливание (hoverIndent):</span>
            <input type="range" class="debug-slider" data-param="hoverIndentStrength" min="0.0" max="0.50" step="0.01" value="${this.config.hoverIndentStrength}">
            <strong class="val-hoverIndentStrength">${this.config.hoverIndentStrength.toFixed(2)}</strong>
          </div>

          <div class="debug-slider-row">
            <span>Выступание края (oppositeBulge):</span>
            <input type="range" class="debug-slider" data-param="oppositeBulgeStrength" min="0.0" max="0.40" step="0.01" value="${this.config.oppositeBulgeStrength}">
            <strong class="val-oppositeBulgeStrength">${this.config.oppositeBulgeStrength.toFixed(2)}</strong>
          </div>

          <div class="debug-slider-row">
            <span>Радиус влияния (hoverRadius):</span>
            <input type="range" class="debug-slider" data-param="hoverRadius" min="0.10" max="0.70" step="0.02" value="${this.config.hoverRadius}">
            <strong class="val-hoverRadius">${this.config.hoverRadius.toFixed(2)}</strong>
          </div>

          <div class="debug-slider-row">
            <span>Макс. наклон (maxTilt):</span>
            <input type="range" class="debug-slider" data-param="maxTilt" min="0.01" max="0.30" step="0.005" value="${this.config.maxTilt}">
            <strong class="val-maxTilt">${(this.config.maxTilt * 180 / Math.PI).toFixed(1)}°</strong>
          </div>

          <div class="debug-slider-row">
            <span>Освещение (lightingStrength):</span>
            <input type="range" class="debug-slider" data-param="lightingStrength" min="0.0" max="1.0" step="0.02" value="${this.config.lightingStrength}">
            <strong class="val-lightingStrength">${this.config.lightingStrength.toFixed(2)}</strong>
          </div>
        </div>

        <div class="debug-hud-section debug-metrics-section">
          <div class="debug-metric">Курсор: <span id="dbg-cursor">0.00, 0.00</span></div>
          <div class="debug-metric">Силуэт: <span id="dbg-hit">нет</span></div>
          <div class="debug-metric">Продавливание: <span id="dbg-indent">0.00</span></div>
          <div class="debug-metric">Наклон: <span id="dbg-tilt">0.0°, 0.0°</span></div>
        </div>

        <div class="debug-hud-actions">
          <button type="button" class="debug-btn" id="dbg-btn-reset">Сбросить</button>
          <button type="button" class="debug-btn" id="dbg-btn-copy">Копировать JSON</button>
        </div>
      `;

      // Event listeners on HUD
      panel.querySelector('.debug-hud-close').addEventListener('click', () => this.toggleDebugHUD(false));

      panel.querySelectorAll('.debug-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const mode = parseInt(btn.getAttribute('data-mode'), 10);
          this.setDebugMode(mode);
        });
      });

      panel.querySelectorAll('.debug-slider').forEach(slider => {
        slider.addEventListener('input', () => {
          const param = slider.getAttribute('data-param');
          const val = parseFloat(slider.value);
          const update = {};
          update[param] = val;
          this.setConfig(update);

          const label = panel.querySelector(`.val-${param}`);
          if (label) {
            label.textContent = param === 'maxTilt' ? `${(val * 180 / Math.PI).toFixed(1)}°` : val.toFixed(2);
          }
        });
      });

      panel.querySelector('#dbg-btn-reset').addEventListener('click', () => {
        this.setConfig(DEFAULT_CONFIG);
        panel.querySelectorAll('.debug-slider').forEach(slider => {
          const param = slider.getAttribute('data-param');
          slider.value = this.config[param];
          const label = panel.querySelector(`.val-${param}`);
          if (label) {
            label.textContent = param === 'maxTilt' ? `${(this.config[param] * 180 / Math.PI).toFixed(1)}°` : this.config[param].toFixed(2);
          }
        });
      });

      panel.querySelector('#dbg-btn-copy').addEventListener('click', () => {
        const json = JSON.stringify(this.config, null, 2);
        if (navigator.clipboard) {
          navigator.clipboard.writeText(json).then(() => {
            alert('Конфигурация скопирована в буфер обмена!');
          });
        }
      });

      document.body.appendChild(panel);
      this.debugPanel = panel;

      // Check query param for auto-opening HUD
      if (window.location.search.includes('debug=1') || window.location.search.includes('debug=true')) {
        this.toggleDebugHUD(true);
      }
    }

    toggleDebugHUD(forceState) {
      if (!this.debugPanel) return;
      const willShow = forceState !== undefined ? forceState : !this.debugPanel.classList.contains('is-visible');
      this.debugPanel.classList.toggle('is-visible', willShow);
      if (willShow) this._requestFrame();
    }

    _updateHUDMetrics() {
      if (!this.debugPanel) return;
      const c = this.debugPanel.querySelector('#dbg-cursor');
      if (c) c.textContent = `${this.mouseNorm.x.toFixed(2)}, ${this.mouseNorm.y.toFixed(2)}`;

      const h = this.debugPanel.querySelector('#dbg-hit');
      if (h) {
        h.textContent = this.isInsideSilhouette ? 'ДА (внутри)' : 'НЕТ (прозрачно)';
        h.style.color = this.isInsideSilhouette ? '#10b981' : '#9ca3af';
      }

      const ind = this.debugPanel.querySelector('#dbg-indent');
      if (ind) ind.textContent = (this.hoverActive * this.config.hoverIndentStrength).toFixed(3);

      const t = this.debugPanel.querySelector('#dbg-tilt');
      if (t) t.textContent = `${(this.currentTiltX * 180 / Math.PI).toFixed(1)}°, ${(this.currentTiltY * 180 / Math.PI).toFixed(1)}°`;
    }

    // ========================================================================
    // Teardown & Resource Disposal
    // ========================================================================
    destroy() {
      this.isDestroyed = true;

      const el = this.domElement || this.container;
      if (el) {
        el.removeEventListener('pointerenter', this._onPointerEnter);
        el.removeEventListener('pointermove', this._onPointerMove);
        el.removeEventListener('pointerleave', this._onPointerLeave);
      }
      window.removeEventListener('resize', this._onResize);
      window.removeEventListener('keydown', this._onKeyDown);

      if (this.debugPanel && this.debugPanel.parentNode) {
        this.debugPanel.parentNode.removeChild(this.debugPanel);
      }

      if (this.sphereGeo) this.sphereGeo.dispose();
      if (this.sphereMat) this.sphereMat.dispose();
      if (this.swarmGroup) this.scene.remove(this.swarmGroup);

      if (this.mesh) {
        this.scene.remove(this.mesh);
      }
      if (this.geometry) {
        this.geometry.dispose();
      }
      if (this.material) {
        this.material.dispose();
      }
      if (this.diffuseTexture) {
        this.diffuseTexture.dispose();
      }
      if (this.heightTexture) {
        this.heightTexture.dispose();
      }
      if (this.normalTexture) {
        this.normalTexture.dispose();
      }
      if (this.renderer && !this.options.useSharedRenderer) {
        // Сразу освобождаем WebGL-контекст (облака создаются/уничтожаются многократно)
        this.renderer.forceContextLoss();
        this.renderer.dispose();
        if (this.domElement && this.domElement.parentNode) {
          this.domElement.parentNode.removeChild(this.domElement);
        }
      }

      this.scene = null;
      this.camera = null;
      this.renderer = null;
      this.mesh = null;
      this.geometry = null;
      this.material = null;
    }
  }

  // Expose defaults
  CloudRelief.DEFAULT_CONFIG = DEFAULT_CONFIG;

  return CloudRelief;
}));
