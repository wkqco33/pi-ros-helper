import test from "node:test";
import assert from "node:assert/strict";
import { diffParameters } from "../src/runtime/params.ts";
import { diffGraphs } from "../src/runtime/graph.ts";
import { classifyColconOutput } from "../src/build/colcon.ts";
import { packageScaffold } from "../src/generate/package.ts";
import { isHighRiskTopic } from "../src/core/safety.ts";

test("parameter diff reports changes, additions, and removals", () => {
  assert.deepEqual(diffParameters({ a: "1", old: "x" }, { a: "2", added: "y" }), [
    { name: "a", left: "1", right: "2", change: "changed" },
    { name: "added", left: undefined, right: "y", change: "added" },
    { name: "old", left: "x", right: undefined, change: "removed" },
  ]);
});

test("graph diff is order independent", () => {
  const previous = { nodes: ["/a"], topics: [{ name: "/old", types: ["x"] }], services: [], capturedAt: "a", source: "ros2-cli" as const };
  const current = { nodes: ["/a", "/b"], topics: [{ name: "/new", types: ["x"] }], services: ["/service"], capturedAt: "b", source: "ros2-cli" as const };
  assert.deepEqual(diffGraphs(previous, current), { nodes: { added: ["/b"], removed: [] }, topics: { added: ["/new"], removed: ["/old"] }, services: { added: ["/service"], removed: [] } });
});

test("colcon parser prioritizes actionable compiler failures", () => {
  const failures = classifyColconOutput("downstream failed\nfatal error: missing.hpp file not found\nundefined reference to foo");
  assert.equal(failures[0]?.kind, "compiler");
  assert.equal(failures[1]?.kind, "linker");
});

test("package scaffold validates names and creates required files", () => {
  const generated = packageScaffold({ packageName: "demo_pkg", nodeName: "demo_node", language: "python" });
  assert.ok(generated.files["demo_pkg/package.xml"]);
  assert.ok(generated.files["demo_pkg/setup.py"]);
  assert.throws(() => packageScaffold({ packageName: "Bad-Package", nodeName: "demo", language: "cpp" }));
});

test("actuator topics are marked high risk", () => {
  assert.equal(isHighRiskTopic("/cmd_vel"), true);
  assert.equal(isHighRiskTopic("/scan"), false);
});
