import assert from "node:assert/strict";
import test from "node:test";
import configs from "@/shared/config/model-configs.json";
import { INITIAL_DISSATISFACTION, createCityPlan, updateDissatisfaction } from "./index";
import { activeWindowState, buildingLightSeed, createWindowLightEvents } from "./building-lights";
import { WindowLightTimeline } from "./building-lights";
import { NightClock } from "./NightClock";
import { energyUsePerSecond, evaluateGameOutcome, INITIAL_ENERGY, lampEnergyRate, NightSession } from "./session";

test("light lowers dissatisfaction gradually", () => {
  const afterOneSecond = updateDissatisfaction(INITIAL_DISSATISFACTION, 1, 1);
  assert.ok(afterOneSecond > 0 && afterOneSecond < INITIAL_DISSATISFACTION);
  assert.ok(Math.abs(updateDissatisfaction(afterOneSecond, 1, 1) - 0.34) < 1e-9);
});

test("darkness raises dissatisfaction and values stay bounded", () => {
  assert.equal(updateDissatisfaction(0.5, 0, 1), 0.525);
  assert.equal(updateDissatisfaction(0.99, 0, 10), 1);
  assert.equal(updateDissatisfaction(0.01, 1, 10), 0);
});

test("city plan contains routes and every required asset only once", () => {
  const plan = createCityPlan(42, configs.configs as unknown as Parameters<typeof createCityPlan>[1]);
  assert.ok(plan.objects.length > 0);
  assert.ok(plan.attractors.length > 0);
  assert.ok(plan.assetUrls.some((url) => url.includes("/characters/")));
  assert.equal(plan.assetUrls.length, new Set(plan.assetUrls).size);
});

test("route nodes stay inside the playable city instead of ending at its boundary", () => {
  const plan = createCityPlan(42, configs.configs as unknown as Parameters<typeof createCityPlan>[1]);
  const byId = new Set(plan.attractors.map((node) => node.id));
  assert.ok(plan.attractors.every((node) => Math.abs(node.position[0]) <= 5.5 && Math.abs(node.position[2]) <= 5.5));
  assert.ok(plan.attractors.every((node) => node.next.every((id) => byId.has(id))));
});

test("window light events are sparse, deterministic and vary in intensity", () => {
  const seed = buildingLightSeed("building-1");
  const events = createWindowLightEvents(seed, 20);
  assert.deepEqual(events, createWindowLightEvents(seed, 20));
  assert.ok(events.length < 15);
  assert.ok(events.every((event) => event.kind === "window-light" && event.intensity >= 0.25 && event.intensity <= 1));
  for (const event of events) {
    assert.ok(Math.abs(event.endsAt - event.startsAt - 1 / 6) < 1e-9);
    const startHour = (23 + event.startsAt) % 24;
    const middleHour = (23 + (event.startsAt + event.endsAt) / 2) % 24;
    assert.ok(activeWindowState(events, startHour).level < 1e-9);
    assert.ok(Math.abs(activeWindowState(events, middleHour).level - event.intensity) < 1e-9);
  }
});

test("energy rate follows lamp model and session ends on dawn or resource limits", () => {
  assert.equal(lampEnergyRate("light-curved"), 0.08);
  assert.equal(lampEnergyRate("light-curved-cross"), 0.16);
  assert.equal(energyUsePerSecond([{ lampModel: "light-curved" }, { lampModel: "light-curved-cross" }]), 0.24);
  assert.equal(evaluateGameOutcome(23, INITIAL_ENERGY, 0.5), "playing");
  assert.equal(evaluateGameOutcome(6, 1, 0.9), "won");
  assert.equal(evaluateGameOutcome(6, 0, 1), "won");
  assert.equal(evaluateGameOutcome(3, 0, 0.3), "lost-energy");
  assert.equal(evaluateGameOutcome(3, 10, 1), "lost-dissatisfaction");
});

test("night clock reaches dawn and stops instead of looping", () => {
  const clock = new NightClock(23);
  assert.ok(Math.abs(clock.advance(40) - 0) < 1e-9);
  clock.setHour(5.99);
  assert.equal(clock.advance(1), 6);
  assert.equal(clock.advance(20), 6);
});

test("session stops spending energy after an outcome", () => {
  const session = new NightSession();
  assert.equal(session.advance(1, [{ lampModel: "light-curved" }], 23, 0.5), "playing");
  assert.ok(Math.abs(session.energy - 99.92) < 1e-9);
  assert.equal(session.advance(1, [], 6, 0.5), "won");
  assert.equal(session.advance(100, [{ lampModel: "construction-light" }], 6, 0.5), "won");
  assert.ok(Math.abs(session.energy - 99.92) < 1e-9);
});

test("window timeline exposes the same seeded events at a given hour", () => {
  const seed = buildingLightSeed("building-2");
  const timeline = new WindowLightTimeline(seed, 12);
  assert.deepEqual(timeline.events, createWindowLightEvents(seed, 12));
  assert.deepEqual(timeline.at(3), activeWindowState(timeline.events, 3));
});
