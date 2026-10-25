import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { getCityColliderSnapshot } from "./city-colliders";

const FIXED_DT = 1 / 120; // finer steps keep impulse joints stiffer — less stretch/flop
const MAX_SUBSTEPS = 6; // 6 * 1/120 = 0.05s per frame, same cap as the dt clamp
const GROUND_TOP_Y = -0.15; // matches the visual ground plane in CityViewerClient
const ENV_MEMBERSHIP = 1 << 0;
const ALL_BITS = 0xffff;
// All ragdoll parts share one membership (bit 1) and filter against EVERYTHING,
// including their own ragdoll: parts must collide with each other so limbs rest on
// the body instead of flying through it. Joint-connected neighbours never collide
// anyway because their joint has contacts disabled.
const RAGDOLL_MEMBERSHIP = 1 << 1;
const RAGDOLL_GROUPS = ((RAGDOLL_MEMBERSHIP << 16) | ALL_BITS) >>> 0;

const _one = new THREE.Vector3(1, 1, 1);
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _identity = new THREE.Matrix4();

export interface BoneDef {
  name: string;
  child?: string;
}

// Quaternius humanoid rig, shared by all in-game characters (cube_guy, cube_woman, steve).
// Parents are listed before their children so the world->local bone solve can run top-down.
export const HUMANOID_BONES: BoneDef[] = [
  { name: "Hips", child: "Abdomen" },
  { name: "Abdomen", child: "Torso" },
  { name: "Torso", child: "Neck" },
  { name: "Neck", child: "Head" },
  { name: "Head", child: "Head_end" },
  { name: "UpperArm.L", child: "LowerArm.L" },
  { name: "LowerArm.L", child: "Fist.L" },
  { name: "Fist.L", child: "Fist.L_end" },
  { name: "UpperArm.R", child: "LowerArm.R" },
  { name: "LowerArm.R", child: "Fist.R" },
  { name: "Fist.R", child: "Fist.R_end" },
  { name: "UpperLeg.L", child: "LowerLeg.L" },
  { name: "LowerLeg.L", child: "Foot.L" },
  { name: "Foot.L", child: "Foot.L_end" },
  { name: "UpperLeg.R", child: "LowerLeg.R" },
  { name: "LowerLeg.R", child: "Foot.R" },
  { name: "Foot.R", child: "Foot.R_end" },
];

// Joints by kind. Elbows/knees/ankles/wrists are a strength hinge (1 DOF) so limbs fold
// the natural way instead of splaying in every direction like a pinwheel; shoulders,
// hips, spine and neck stay ball joints (3 DOF). Built from names, not the scene graph.
export const HUMANOID_BALL_JOINTS: [string, string][] = [
  ["Hips", "Abdomen"],
  ["Abdomen", "Torso"],
  ["Torso", "Neck"],
  ["Neck", "Head"],
  ["Torso", "UpperArm.L"],
  ["Torso", "UpperArm.R"],
  ["Hips", "UpperLeg.L"],
  ["Hips", "UpperLeg.R"],
];
export const HUMANOID_HINGE_JOINTS: [string, string][] = [
  ["UpperArm.L", "LowerArm.L"],
  ["LowerArm.L", "Fist.L"],
  ["UpperArm.R", "LowerArm.R"],
  ["LowerArm.R", "Fist.R"],
  ["UpperLeg.L", "LowerLeg.L"],
  ["LowerLeg.L", "Foot.L"],
  ["UpperLeg.R", "LowerLeg.R"],
  ["LowerLeg.R", "Foot.R"],
];

/**
 * Ragdoll body template as fractions of the character's total height.
 * The in-game rigs are skeleton/mesh mismatches (bones clumped near the feet while the
 * mesh spans the full height), so bodies can't be derived from bone coordinates — we
 * lay the ragdoll out on these proportions instead and let the bones follow via the
 * name mapping in the world->local solve.
 */
const ARM_X = 0.115;
const LEG_X = 0.07;
interface BodySpec { cy: number; len: number; radius: number; x: number } // cy = center height fraction, x = right offset fraction
const HUMAN_BODY: Record<string, BodySpec> = {
  Hips:           { cy: 0.50, len: 0.12, radius: 0.08, x: 0 },
  Abdomen:        { cy: 0.565, len: 0.11, radius: 0.07, x: 0 },
  Torso:          { cy: 0.645, len: 0.14, radius: 0.075, x: 0 },
  Neck:           { cy: 0.78, len: 0.05, radius: 0.025, x: 0 },
  Head:           { cy: 0.87, len: 0.09, radius: 0.06, x: 0 },
  Head_end:       { cy: 0.955, len: 0.02, radius: 0.02, x: 0 },
  "UpperArm.L":   { cy: 0.64, len: 0.15, radius: 0.025, x: -ARM_X },
  "LowerArm.L":   { cy: 0.53, len: 0.13, radius: 0.025, x: -ARM_X * 0.97 },
  "Fist.L":       { cy: 0.46, len: 0.05, radius: 0.025, x: -ARM_X * 0.94 },
  "Fist.L_end":   { cy: 0.43, len: 0.015, radius: 0.02, x: -ARM_X * 0.94 },
  "UpperArm.R":   { cy: 0.64, len: 0.15, radius: 0.025, x: ARM_X },
  "LowerArm.R":   { cy: 0.53, len: 0.13, radius: 0.025, x: ARM_X * 0.97 },
  "Fist.R":       { cy: 0.46, len: 0.05, radius: 0.025, x: ARM_X * 0.94 },
  "Fist.R_end":   { cy: 0.43, len: 0.015, radius: 0.02, x: ARM_X * 0.94 },
  "UpperLeg.L":   { cy: 0.415, len: 0.17, radius: 0.05, x: -LEG_X },
  "LowerLeg.L":   { cy: 0.28, len: 0.15, radius: 0.04, x: -LEG_X },
  "Foot.L":       { cy: 0.07, len: 0.09, radius: 0.035, x: -LEG_X },
  "Foot.L_end":   { cy: 0.045, len: 0.02, radius: 0.02, x: -LEG_X },
  "UpperLeg.R":   { cy: 0.415, len: 0.17, radius: 0.05, x: LEG_X },
  "LowerLeg.R":   { cy: 0.28, len: 0.15, radius: 0.04, x: LEG_X },
  "Foot.R":       { cy: 0.07, len: 0.09, radius: 0.035, x: LEG_X },
  "Foot.R_end":   { cy: 0.045, len: 0.02, radius: 0.02, x: LEG_X },
};

export interface RagdollPart {
  name: string;
  bone: THREE.Bone;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  joint: RAPIER.ImpulseJoint | null;
  jointTo: string | null;
  broken: boolean;
  /** Reused per-part world matrix (avoids per-frame allocation). */
  worldMat: THREE.Matrix4;
}

export interface Ragdoll {
  id: string;
  root: THREE.Object3D;
  parts: RagdollPart[];
  byName: Map<string, RagdollPart>;
  byBone: Map<THREE.Object3D, RagdollPart>;
  createdAt: number;
}

const ROAD_TOP_Y = 0.0; // road surface height so parts never sink through roads

export interface AliveBody {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  height: number;
}

export interface Impact {
  npcId: string;
  dir: { x: number; y: number; z: number };
  speed: number;
}

export interface StepResult {
  impacts: Impact[];
  broken: number;
}

interface ColliderOwner {
  npcId: string;
  kind: "bone" | "alive";
  name?: string;
}

let _initPromise: Promise<void> | null = null;

/** Loads and compiles the inlined Rapier WASM exactly once. */
export function initRapier(): Promise<void> {
  if (!_initPromise) _initPromise = RAPIER.init();
  return _initPromise;
}

const ENV_GROUPS = ((ENV_MEMBERSHIP << 16) | ALL_BITS) >>> 0;

export class RagdollSystem {
  readonly world: RAPIER.World;
  private readonly queue: RAPIER.EventQueue;
  private readonly ragdolls = new Map<string, Ragdoll>();
  private readonly alive = new Map<string, AliveBody>();
  private readonly colliderOwner = new Map<number, ColliderOwner>();
  private readonly cityColliders = new Map<string, RAPIER.Collider>();
  private cityBody: RAPIER.RigidBody;
  private accumulator = 0;

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = FIXED_DT;
    // More solver iterations per substep = stiffer impulse joints. Default 4 lets
    // spherical joints sag so far that the head/limbs visibly separate (ragdoll
    // "breaks" without breaking). 8-10 keeps the chain tight and human-shaped.
    this.world.integrationParameters.numSolverIterations = 12;
    this.queue = new RAPIER.EventQueue(true);

    const groundBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, GROUND_TOP_Y - 0.5, 0)
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(200, 0.5, 200)
        .setFriction(0.9)
        .setRestitution(0)
        .setCollisionGroups(ENV_GROUPS),
      groundBody
    );

    // One fixed body at the origin hosts every city collider cuboid.
    this.cityBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  }

  /** Creates/removes static colliders to match the city registry. Idempotent. */
  syncCityColliders(): void {
    const snapshot = getCityColliderSnapshot();
    for (const [key, collider] of this.cityColliders) {
      if (!snapshot.some((b) => b.key === key)) {
        this.world.removeCollider(collider, false);
        this.cityColliders.delete(key);
      }
    }
    for (const collider of snapshot) {
      if (this.cityColliders.has(collider.key)) continue;
      // HMR may leave half-updated entries in the registry (missing kind/geometry);
      // skip those instead of crashing the frame.
      const isBox =
        collider.kind === "box" &&
        collider.min != null && collider.max != null &&
        Number.isFinite(collider.min.x + collider.min.y + collider.min.z + collider.max.x + collider.max.y + collider.max.z);
      const isMesh =
        collider.kind === "mesh" &&
        Array.isArray(collider.positions) && collider.positions.length >= 9;
      let desc: RAPIER.ColliderDesc | null = null;
      if (isBox) {
        const cx = (collider.min.x + collider.max.x) / 2;
        const cz = (collider.min.z + collider.max.z) / 2;
        const hx = Math.max((collider.max.x - collider.min.x) / 2, 0.02);
        const hz = Math.max((collider.max.z - collider.min.z) / 2, 0.02);
        // Thicken thin road slabs downward so limbs can never tunnel through the road surface.
        const topY = collider.max.y;
        const bottomY = Math.min(collider.min.y, topY - 0.3);
        const cy = (topY + bottomY) / 2;
        const hy = Math.max((topY - bottomY) / 2, 0.15);
        desc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
          .setTranslation(cx, cy, cz)
          .setFriction(0.8)
          .setRestitution(0)
          .setCollisionGroups(ENV_GROUPS);
      } else if (isMesh) {
        const indices = new Uint32Array(collider.positions.length / 3);
        for (let i = 0; i < indices.length; i++) indices[i] = i;
        desc = RAPIER.ColliderDesc.trimesh(new Float32Array(collider.positions), indices)
          .setFriction(0.7)
          .setCollisionGroups(ENV_GROUPS);
      }
      if (!desc) continue;
      this.cityColliders.set(collider.key, this.world.createCollider(desc, this.cityBody));
    }
  }

  get ragdollCount(): number {
    return this.ragdolls.size;
  }

  get brokenCount(): number {
    let n = 0;
    for (const rag of this.ragdolls.values()) for (const p of rag.parts) if (p.broken) n++;
    return n;
  }

  hasRagdoll(npcId: string): boolean {
    return this.ragdolls.has(npcId);
  }

  createAlive(npcId: string, x: number, y: number, z: number, height: number): AliveBody | null {
    const cached = this.alive.get(npcId);
    if (cached) {
      this.updateAlive(npcId, x, y, z);
      return cached;
    }
    const radius = Math.max(0.03, height * 0.16);
    const halfHeight = Math.max(0.02, height / 2 - radius);
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y + height / 2, z)
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(halfHeight, radius)
        .setFriction(0.8)
        .setRestitution(0)
        .setCollisionGroups(ENV_GROUPS)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(0.0005),
      body
    );
    const alive: AliveBody = { body, collider, height };
    this.alive.set(npcId, alive);
    this.colliderOwner.set(collider.handle, { npcId, kind: "alive" });
    return alive;
  }

  updateAlive(npcId: string, x: number, y: number, z: number): void {
    const alive = this.alive.get(npcId);
    if (!alive) return;
    alive.body.setNextKinematicTranslation({ x, y: y + alive.height / 2, z });
  }

  removeAlive(npcId: string): void {
    const alive = this.alive.get(npcId);
    if (!alive) return;
    this.alive.delete(npcId);
    this.colliderOwner.delete(alive.collider.handle);
    this.world.removeCollider(alive.collider, false);
    this.world.removeRigidBody(alive.body);
  }

  /**
   * Builds a rigid body per humanoid bone.
   *
   * The game rigs are extreme skeleton/mesh mismatches (all bones sit within ~2cm of
   * the feet while the mesh is 1.75m tall), so bodies placed at bone coordinates
   * simulate a 2cm lump and the skinned mesh goes wild. We therefore lay the ragdoll
   * out on a human-proportion template scaled to the character's real height and keep
   * the NAME mapping: the world->local bone solve makes the mesh follow the bodies.
   * Returns null when the model has no humanoid rig.
   */
  createRagdoll(npcId: string, root: THREE.Object3D, height: number): Ragdoll | null {
    const existing = this.ragdolls.get(npcId);
    if (existing) return existing;

    root.updateMatrixWorld(true);
    const feet = root.getWorldPosition(new THREE.Vector3());
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()));

    const parts: RagdollPart[] = [];
    const byName = new Map<string, RagdollPart>();

    for (const def of HUMANOID_BONES) {
      const bone = root.getObjectByName(def.name) as THREE.Bone | undefined;
      const spec = HUMAN_BODY[def.name];
      if (!bone || !spec) continue;

      // Body origin at the segment center: feet + (right * x + up * cy) * height.
      const px = feet.x + right.x * spec.x * height;
      const py = feet.y + spec.cy * height;
      const pz = feet.z + right.z * spec.x * height;

      const radius = Math.max(spec.radius * height, 0.01);
      const halfLen = spec.len * height / 2;
      const halfHeight = Math.max(halfLen - radius, 0.004);

      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(px, py, pz)
          .setLinearDamping(0.2)
          .setAngularDamping(0.8)
          .setCcdEnabled(true) // stop thin parts tunnelling through roads/ground
          .setCanSleep(false) // legs must keep following the body — sleeping freezes them mid-fall
      );
const isFoot = def.name.startsWith("Foot");
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.capsule(halfHeight, radius)
          .setTranslation(0, halfLen, 0)
          .setDensity(isFoot ? 300 : 700)
          .setFriction(isFoot ? 0.2 : 0.6)
          .setRestitution(0.02)
          .setCollisionGroups(RAGDOLL_GROUPS)
          .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
          .setContactForceEventThreshold(0.0005),
        body
      );


      const part: RagdollPart = {
        name: def.name,
        bone,
        body,
        collider,
        joint: null,
        jointTo: null,
        broken: false,
        worldMat: new THREE.Matrix4(),
      };
      parts.push(part);
      byName.set(def.name, part);
      this.colliderOwner.set(collider.handle, { npcId, kind: "bone", name: def.name });
    }

    if (parts.length < 4) {
      // Not a humanoid rig — roll back cleanly.
      for (const p of parts) {
        this.colliderOwner.delete(p.collider.handle);
        this.world.removeCollider(p.collider, false);
        this.world.removeRigidBody(p.body);
      }
      return null;
    }

    for (const [parentName, childName] of HUMANOID_BALL_JOINTS) {
      const parent = byName.get(parentName);
      const child = byName.get(childName);
      if (!parent || !child) continue;
      // Pivot at the midpoint between the two bodies ≈ the articulation point.
      const pp = parent.body.translation();
      const cp = child.body.translation();
      const pivot = new THREE.Vector3((pp.x + cp.x) / 2, (pp.y + cp.y) / 2, (pp.z + cp.z) / 2);
      const pr = parent.body.rotation();
      const cr = child.body.rotation();
      const pq = new THREE.Quaternion(pr.x, pr.y, pr.z, pr.w).invert();
      const cq = new THREE.Quaternion(cr.x, cr.y, cr.z, cr.w).invert();
      const a1 = pivot.clone().sub(new THREE.Vector3(pp.x, pp.y, pp.z)).applyQuaternion(pq);
      const a2 = pivot.clone().sub(new THREE.Vector3(cp.x, cp.y, cp.z)).applyQuaternion(cq);
      const joint = this.world.createImpulseJoint(
        RAPIER.JointData.spherical(
          { x: a1.x, y: a1.y, z: a1.z },
          { x: a2.x, y: a2.y, z: a2.z }
        ),
        parent.body,
        child.body,
        true
      );

      joint.setContactsEnabled(false);
      child.joint = joint;
      child.jointTo = parentName;
    }

    // Hinges (1 DOF) for elbows/knees/ankles/wrists: the free axis is the character's
    // local right, so limbs fold forward/back instead of fanning out sideways.
    for (const [parentName, childName] of HUMANOID_HINGE_JOINTS) {
      const parent = byName.get(parentName);
      const child = byName.get(childName);
      if (!parent || !child) continue;
      const pp = parent.body.translation();
      const cp = child.body.translation();
      const pivot = new THREE.Vector3((pp.x + cp.x) / 2, (pp.y + cp.y) / 2, (pp.z + cp.z) / 2);
      const pr = parent.body.rotation();
      const cr = child.body.rotation();
      const pq = new THREE.Quaternion(pr.x, pr.y, pr.z, pr.w).invert();
      const cq = new THREE.Quaternion(cr.x, cr.y, cr.z, cr.w).invert();
      const a1 = pivot.clone().sub(new THREE.Vector3(pp.x, pp.y, pp.z)).applyQuaternion(pq);
      const a2 = pivot.clone().sub(new THREE.Vector3(cp.x, cp.y, cp.z)).applyQuaternion(cq);
      const joint = this.world.createImpulseJoint(
        RAPIER.JointData.revolute(
          { x: a1.x, y: a1.y, z: a1.z },
          { x: a2.x, y: a2.y, z: a2.z },
          { x: right.x, y: right.y, z: right.z }
        ),
        parent.body,
        child.body,
        true
      ) as any;
      joint.setLimits(-Math.PI * 0.75, Math.PI * 0.75);
      joint.setContactsEnabled(false);
      child.joint = joint;
      child.jointTo = parentName;
    }

    const byBone = new Map<THREE.Object3D, RagdollPart>();
    for (const p of parts) byBone.set(p.bone, p);

    const ragdoll: Ragdoll = {
      id: npcId,
      root,
      parts,
      byName,
      byBone,
      createdAt: performance.now(),
    };
    this.ragdolls.set(npcId, ragdoll);
    return ragdoll;
  }

  removeRagdoll(npcId: string): void {
    const rag = this.ragdolls.get(npcId);
    if (!rag) return;
    this.ragdolls.delete(npcId);
    for (const p of rag.parts) {
      if (p.joint) {
        this.world.removeImpulseJoint(p.joint, false);
        p.joint = null;
      }
      this.colliderOwner.delete(p.collider.handle);
      this.world.removeCollider(p.collider, false);
      this.world.removeRigidBody(p.body);
    }
  }

  clearAll(): void {
    for (const id of [...this.ragdolls.keys()]) this.removeRagdoll(id);
    for (const id of [...this.alive.keys()]) this.removeAlive(id);
    this.accumulator = 0;
  }

  /** Pushes every body of a ragdoll by mass * strength along dir (a consistent velocity kick). */
  applyImpulse(npcId: string, dir: { x: number; y: number; z: number }, strength: number): void {
    const rag = this.ragdolls.get(npcId);
    if (!rag) return;
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const ux = dir.x / len;
    const uy = dir.y / len;
    const uz = dir.z / len;
    for (const p of rag.parts) {
      const m = p.body.mass();
      p.body.applyImpulse({ x: ux * m * strength, y: uy * m * strength, z: uz * m * strength }, true);
    }
  }

  private debugFrameCount = 0;

  /** Copies simulated body transforms back onto the skeleton bones. */
  private applyToBones(rag: Ragdoll): void {

    const hipsBody = rag.byName.get("Hips")?.body;
    if (hipsBody) {
      const ht = hipsBody.translation();
      rag.root.position.set(ht.x, ht.y, ht.z);
    }
    rag.root.updateMatrixWorld(true);

    const _q2 = new THREE.Quaternion();

    for (const part of rag.parts) {
      const r = part.body.rotation();
      _q.set(r.x, r.y, r.z, r.w);
      
      const parentObj = part.bone.parent;
      if (parentObj) {
        parentObj.matrixWorld.decompose(_v, _q2, _s);
        _q2.invert();
        _q.premultiply(_q2);
      }
      
      part.bone.quaternion.copy(_q);
      part.bone.updateMatrixWorld();
    }
  }

  /**
   * Advances the simulation and applies bone transforms.
   * `breakAccel` is an impact acceleration (m/s²) above which a joint snaps.
   */
  step(dt: number, breakAccel: number): StepResult {
    const impacts: Impact[] = [];
    let broken = 0;

    if (this.ragdolls.size === 0) {
      this.accumulator = 0;
      return { impacts, broken };
    }

    this.accumulator = Math.min(this.accumulator + dt, 0.25);
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
      this.world.timestep = FIXED_DT;
      this.world.step(this.queue);
      this.queue.drainContactForceEvents((event) => {
        const h1 = event.collider1();
        const h2 = event.collider2();
        const force = event.maxForceMagnitude();
        const o1 = this.colliderOwner.get(h1);
        const o2 = this.colliderOwner.get(h2);

        for (const owner of [o1, o2]) {
          if (!owner || owner.kind !== "bone" || !owner.name) continue;
          const rag = this.ragdolls.get(owner.npcId);
          const part = rag?.byName.get(owner.name);
          if (!rag || !part || !part.joint) continue;
          const mass = Math.max(part.body.mass(), 1e-6);
          if (force / mass > breakAccel) {
            this.world.removeImpulseJoint(part.joint, true);
            part.joint = null;
            part.broken = true;
            broken++;
          }
        }

        const boneOwner = o1?.kind === "bone" ? o1 : o2?.kind === "bone" ? o2 : null;
        const aliveOwner = o1?.kind === "alive" ? o1 : o2?.kind === "alive" ? o2 : null;
        if (boneOwner?.name && aliveOwner) {
          const rag = this.ragdolls.get(boneOwner.npcId);
          const part = rag?.byName.get(boneOwner.name);
          const vel = part?.body.linvel();
          const speed = vel ? Math.hypot(vel.x, vel.y, vel.z) : 0;
          if (speed > 1.2) {
            const dir = event.maxForceDirection();
            impacts.push({ npcId: aliveOwner.npcId, dir: { x: dir.x, y: dir.y, z: dir.z }, speed });
          }
        }
      });
      this.accumulator -= FIXED_DT;
      steps++;
    }

    for (const rag of this.ragdolls.values()) this.applyToBones(rag);
    return { impacts, broken };
  }

  dispose(): void {
    this.clearAll();
    for (const collider of this.cityColliders.values()) this.world.removeCollider(collider, false);
    this.cityColliders.clear();
    this.world.free();
  }
}
