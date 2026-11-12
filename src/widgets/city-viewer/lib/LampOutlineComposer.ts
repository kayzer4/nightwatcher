import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutlinePass } from "three/addons/postprocessing/OutlinePass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { withOutlineHelpersHidden } from "./LampOutlineSelection";

/** Uses the official Three.js outline pipeline only while a lamp is hovered. */
export class LampOutlineComposer {
  private readonly composer: EffectComposer;
  private readonly outline: OutlinePass;
  private readonly output: OutputPass;
  private readonly selectedPosition = new THREE.Vector3();

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    width: number,
    height: number,
  ) {
    this.composer = new EffectComposer(renderer);
    this.composer.setPixelRatio(Math.min(renderer.getPixelRatio(), 1.5));
    this.composer.addPass(new RenderPass(scene, camera));
    this.outline = new OutlinePass(new THREE.Vector2(width, height), scene, camera);
    this.outline.downSampleRatio = 1;
    this.outline.edgeStrength = 3.5;
    this.outline.edgeGlow = 0.25;
    this.outline.edgeThickness = 1.1;
    this.outline.visibleEdgeColor.set("#54cfff");
    this.outline.hiddenEdgeColor.set("#000000");
    this.composer.addPass(this.outline);
    this.output = new OutputPass();
    this.composer.addPass(this.output);
    this.composer.setSize(width, height);
  }

  render(delta: number, selected: THREE.Object3D | null): void {
    this.outline.enabled = selected !== null;
    this.outline.selectedObjects = selected ? [selected] : [];
    if (selected) {
      const distance = this.camera.position.distanceTo(selected.getWorldPosition(this.selectedPosition));
      this.outline.edgeThickness = THREE.MathUtils.clamp(1.1 + Math.max(0, distance - 12) * 0.035, 1.1, 1.8);
      withOutlineHelpersHidden(selected, () => this.composer.render(delta));
    }
    else this.composer.render(delta);
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  dispose(): void {
    this.outline.dispose();
    this.output.dispose();
    this.composer.dispose();
  }
}
