import test from "node:test";
import assert from "node:assert/strict";
import { WeatherSystem } from "../src/weather.js";

test("rebuilds active weather when its intensity changes", () => {
  const weather = new WeatherSystem({ intensity: 0.01, mode: "none" });
  weather.setMode("rain");

  const firstGeometry = weather._rain.geometry;
  let disposed = false;
  firstGeometry.addEventListener("dispose", () => {
    disposed = true;
  });

  assert.equal(firstGeometry.getAttribute("position").count, 60);
  weather.setIntensity(0.02);

  assert.equal(disposed, true);
  assert.equal(weather._rain.geometry.getAttribute("position").count, 120);
});
