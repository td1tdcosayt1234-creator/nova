/* ============ Nova Engine — 3D renderer (three.js backed) ============ */

import * as THREE from 'three'
import { getComp, hashStr, type Entity, type Scene } from './core'
import { spriteCanvas } from './sprites'
import { radiusOf } from './physics3d'

export interface OrbitState { theta: number; phi: number; dist: number; target: THREE.Vector3 }
export interface PlayCamState { yaw: number; pitch: number }

const DEG = Math.PI / 180

export class Renderer3D {
  container: HTMLElement
  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  root = new THREE.Group()
  meshMap = new Map<string, THREE.Object3D>()
  private geos = new Map<string, THREE.BufferGeometry>()
  private selHelper: THREE.Box3Helper
  private selBox = new THREE.Box3()
  grid: THREE.GridHelper
  defaultSun: THREE.DirectionalLight
  defaultAmb: THREE.AmbientLight
  lastBg = ''

  constructor(container: HTMLElement) {
    this.container = container
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    this.renderer.setPixelRatio(window.devicePixelRatio || 1)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.domElement.style.position = 'absolute'
    this.renderer.domElement.style.inset = '0'
    container.appendChild(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000)
    this.scene.add(this.root)
    this.scene.add(this.camera)

    this.grid = new THREE.GridHelper(60, 60, 0x4c5670, 0x272e3d)
    ;(this.grid.material as any).transparent = true
    ;(this.grid.material as any).opacity = 0.5
    this.grid.visible = false
    this.scene.add(this.grid)

    this.defaultAmb = new THREE.AmbientLight(0xffffff, 0.55)
    this.defaultSun = new THREE.DirectionalLight(0xffffff, 1.4)
    this.defaultSun.position.set(18, 30, 12)
    this.defaultSun.castShadow = true
    this.defaultSun.shadow.mapSize.set(1024, 1024)
    this.defaultSun.shadow.camera.left = -40
    this.defaultSun.shadow.camera.right = 40
    this.defaultSun.shadow.camera.top = 40
    this.defaultSun.shadow.camera.bottom = -40
    this.scene.add(this.defaultAmb, this.defaultSun)

    const hg = new THREE.BoxGeometry(1, 1, 1)
    const hm = new THREE.LineBasicMaterial({ color: 0xf0abfc })
    this.selHelper = new THREE.Box3Helper(this.selBox, (hm as any).color)
    this.selHelper.visible = false
    this.scene.add(this.selHelper)
  }

  resize() {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    if (w <= 0 || h <= 0) return
    this.renderer.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  reset() {
    for (const [id, obj] of [...this.meshMap]) {
      this.root.remove(obj)
      disposeObject(obj)
      this.meshMap.delete(id)
    }
    this.lastBg = ''
  }

  private geo(name: string): THREE.BufferGeometry {
    let g = this.geos.get(name)
    if (g) return g
    switch (name) {
      case 'sphere': g = new THREE.SphereGeometry(0.5, 24, 18); break
      case 'capsule': g = new THREE.CapsuleGeometry(0.35, 0.55, 6, 16); break
      case 'cylinder': g = new THREE.CylinderGeometry(0.5, 0.5, 1, 22); break
      case 'cone': g = new THREE.ConeGeometry(0.5, 1, 22); break
      case 'torus': g = new THREE.TorusGeometry(0.4, 0.16, 14, 36); break
      case 'torusKnot': g = new THREE.TorusKnotGeometry(0.35, 0.12, 64, 12); break
      case 'plane': g = new THREE.PlaneGeometry(1, 1); break
      default: g = new THREE.BoxGeometry(1, 1, 1)
    }
    this.geos.set(name, g)
    return g
  }

  sync(scene: Scene, opts: { orbit: OrbitState; playing: boolean; cam: PlayCamState; selected: string | null }) {
    const m = scene.meta
    const is3d = m.mode === '3d'
    this.root.visible = is3d
    this.grid.visible = is3d && !opts.playing

    // background
    const bgc = m.useGradient ? m.bgBottom : m.bg
    if (bgc !== this.lastBg) {
      this.scene.background = new THREE.Color(bgc)
      this.scene.fog = new THREE.Fog(new THREE.Color(bgc), 60, 190)
      this.lastBg = bgc
    }

    if (!is3d) return

    const seen = new Set<string>()
    const hasLight = scene.entities.some(e => e.visible && getComp(e, 'light3d'))
    this.defaultAmb.visible = !hasLight
    this.defaultSun.visible = !hasLight

    for (const e of scene.entities) {
      const meshC = getComp(e, 'mesh3d')
      const lightC = getComp(e, 'light3d')
      if (lightC) { this.syncLight(e, lightC); seen.add(e.id); continue }
      if (!meshC) continue
      seen.add(e.id)
      this.syncMesh(e, meshC)
    }

    // remove stale
    for (const [id, obj] of [...this.meshMap]) {
      if (!seen.has(id)) {
        this.root.remove(obj)
        disposeObject(obj)
        this.meshMap.delete(id)
      }
    }
    this.gcLights(seen)

    this.updateCamera(scene, opts)

    // selection box
    const sel = opts.selected ? this.meshMap.get(opts.selected) : null
    if (sel && !opts.playing) {
      this.selBox.setFromObject(sel)
      this.selHelper.visible = true
    } else {
      this.selHelper.visible = false
    }

    this.renderer.render(this.scene, this.camera)
  }

  private syncMesh(e: Entity, meshC: any) {
    let obj = this.meshMap.get(e.id)
    if (!obj) {
      const geo = this.geo(meshC.geo)
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.12 })
      obj = new THREE.Mesh(geo, mat)
      if (meshC.geo === 'plane') {
        obj.rotation.x = -Math.PI / 2
        obj.userData.baseRotX = -Math.PI / 2
      }
      obj.castShadow = meshC.geo !== 'plane'
      obj.receiveShadow = true
      obj.userData.entityId = e.id
      this.root.add(obj)
      this.meshMap.set(e.id, obj)
    }

    const mesh = obj as THREE.Mesh
    const mat = mesh.material as THREE.MeshStandardMaterial

    if (meshC.texture && meshC.texture !== 'none') {
      const seed = (getComp(e, 'sprite2d')?.seed) || (hashStr(e.id) % 10000)
      const tex = new THREE.CanvasTexture(spriteCanvas(meshC.texture, seed))
      tex.magFilter = THREE.NearestFilter
      tex.minFilter = THREE.NearestFilter
      if (mat.map) mat.map.dispose()
      mat.map = tex
      mat.needsUpdate = true
    } else if (mat.map) {
      mat.map.dispose()
      mat.map = null
      mat.needsUpdate = true
    }

    mat.color.set(meshC.color || '#888888')
    mat.wireframe = !!meshC.wire

    const t = e.transform
    obj.position.set(t.pos.x, t.pos.y, t.pos.z)
    if (meshC.geo === 'plane') {
      obj.rotation.set(-Math.PI / 2, 0, t.rot.z * DEG)
    } else {
      obj.rotation.set(t.rot.x * DEG, t.rot.y * DEG, t.rot.z * DEG)
    }
    obj.scale.set(
      Math.max(0.001, t.scale.x),
      Math.max(0.001, t.scale.y),
      Math.max(0.001, t.scale.z)
    )
    obj.visible = e.visible
  }

  private lightMap = new Map<string, THREE.Light>()

  private syncLight(e: Entity, c: any) {
    let l = this.lightMap.get(e.id)
    if (!l || (l as any).__kind !== c.kind) {
      if (l) { this.scene.remove(l); this.lightMap.delete(e.id) }
      switch (c.kind) {
        case 'point': l = new THREE.PointLight(0xffffff, c.intensity, c.distance || 30); break
        case 'hemisphere': l = new THREE.HemisphereLight(0xbfd4ff, 0x3b2f4a, c.intensity); break
        case 'ambient': l = new THREE.AmbientLight(0xffffff, c.intensity); break
        default: l = new THREE.DirectionalLight(0xffffff, c.intensity)
      }
      ;(l as any).__kind = c.kind
      if (l instanceof THREE.DirectionalLight) {
        l.castShadow = true
        l.shadow.mapSize.set(1024, 1024)
        const sc = l.shadow.camera as THREE.OrthographicCamera
        sc.left = -50; sc.right = 50; sc.top = 50; sc.bottom = -50
      }
      this.scene.add(l)
      this.lightMap.set(e.id, l)
    }
    l.color.set(c.color)
    if (l instanceof THREE.DirectionalLight) {
      const t = e.transform
      l.position.set(t.pos.x, t.pos.y, t.pos.z)
      l.target.position.set(0, 0, 0)
      l.target.updateMatrixWorld()
    } else if (l instanceof THREE.PointLight) {
      const t = e.transform
      l.position.set(t.pos.x, t.pos.y, t.pos.z)
      l.distance = c.distance || 30
    } else if ('intensity' in l) {
      ;(l as any).intensity = c.intensity
    }
  }

  /** Remove lights whose entities no longer exist. */
  private gcLights(seenIds: Set<string>) {
    for (const [id, l] of [...this.lightMap]) {
      if (!seenIds.has(id)) {
        this.scene.remove(l)
        this.lightMap.delete(id)
      }
    }
  }

  private updateCamera(scene: Scene, opts: { orbit: OrbitState; playing: boolean; cam: PlayCamState }) {
    const c3 = scene.meta.camera3d
    const targetFov = c3.fov || 60
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov = targetFov
      this.camera.updateProjectionMatrix()
    }

    if (!opts.playing || c3.mode === 'orbit') {
      const o = opts.orbit
      const px = o.target.x + o.dist * Math.cos(o.phi) * Math.sin(o.theta)
      const py = o.target.y + o.dist * Math.sin(o.phi)
      const pz = o.target.z + o.dist * Math.cos(o.phi) * Math.cos(o.theta)
      this.camera.position.set(px, py, pz)
      this.camera.lookAt(o.target)
      return
    }

    const follow = c3.follow ? scene.byName(c3.follow) : null
    const fp = follow ? follow.transform.pos : new THREE.Vector3(0, 1, 0)

    if (c3.mode === 'first') {
      const h = c3.height || 1.6
      this.camera.position.set(fp.x, fp.y + h, fp.z)
      const dir = new THREE.Vector3(
        Math.sin(opts.cam.yaw) * Math.cos(opts.cam.pitch),
        Math.sin(opts.cam.pitch),
        Math.cos(opts.cam.yaw) * Math.cos(opts.cam.pitch)
      )
      this.camera.lookAt(this.camera.position.clone().add(dir))
      if (follow) {
        const mesh = this.meshMap.get(follow.id)
        if (mesh) mesh.visible = false
      }
    } else if (c3.mode === 'top') {
      this.camera.position.set(fp.x, 24, fp.z + 0.01)
      this.camera.lookAt(fp.x, 0, fp.z)
    } else {
      // third person
      const dist = c3.dist || 9
      const h = c3.height || 3.2
      const desired = new THREE.Vector3(
        fp.x - Math.sin(opts.cam.yaw) * dist,
        fp.y + h,
        fp.z - Math.cos(opts.cam.yaw) * dist
      )
      this.camera.position.lerp(desired, 0.12)
      this.camera.lookAt(fp.x, fp.y + 1, fp.z)
    }
  }

  /** ndc x/y in -1..1 -> entity id or null */
  pick(nx: number, ny: number): string | null {
    const rc = new THREE.Raycaster()
    rc.setFromCamera(new THREE.Vector2(nx, ny), this.camera)
    const hits = rc.intersectObjects(this.root.children, true)
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object
      while (o) {
        if (o.userData.entityId) return o.userData.entityId as string
        o = o.parent
      }
    }
    return null
  }

  /** Intersect ray with horizontal plane at y; returns world point. */
  groundPoint(nx: number, ny: number, y: number): THREE.Vector3 | null {
    const rc = new THREE.Raycaster()
    rc.setFromCamera(new THREE.Vector2(nx, ny), this.camera)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y)
    const out = new THREE.Vector3()
    return rc.ray.intersectPlane(plane, out) ? out : null
  }

  /** Entity radius helper for gizmos */
  entityRadius(e: Entity) { return radiusOf(e) }
}

function disposeObject(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.material) {
      const mat = mesh.material as THREE.MeshStandardMaterial
      if (mat.map) mat.map.dispose()
      mat.dispose()
    }
  })
}
