import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { LampOutlineSelection, withOutlineHelpersHidden } from "./LampOutlineSelection";

test("leaving an old lamp does not clear a newer outline selection", () => {
  const selection = new LampOutlineSelection();
  const first = new THREE.Group();
  const second = new THREE.Group();
  selection.select(first);
  selection.select(second);
  selection.clear(first);
  assert.equal(selection.current, second);
  selection.clear(second);
  assert.equal(selection.current, null);
});

test("invisible click target cannot occlude the lamp outline and is restored afterward", () => {
  const lamp = new THREE.Group();
  const model = new THREE.Group();
  const helper = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  helper.userData.outlineIgnore = true;
  lamp.add(model, helper);
  withOutlineHelpersHidden(model, () => {
    assert.equal(helper.visible, false);
    assert.equal(model.visible, true);
  });
  assert.equal(helper.visible, true);
  assert.throws(() => withOutlineHelpersHidden(model, () => { throw new Error("render failed"); }));
  assert.equal(helper.visible, true);
  helper.geometry.dispose();
});
