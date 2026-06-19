// FILE: tests/unit/entity-graph.test.ts (unit)
// PURPOSE: F-1327 — lock the node-type mappings + the node/edge vocabularies.
// CONNECTS TO: apps/api/src/services/foundation/entity-graph.service.ts

import { describe, expect, it } from "vitest";
import {
  GRAPH_EDGE_TYPES,
  GRAPH_NODE_TYPES,
  nodeTypeForEntity,
  nodeTypeForListing,
} from "../../apps/api/src/services/foundation/entity-graph.service.js";

describe("F-1327 entity graph mappings", () => {
  it("maps entity types to node types", () => {
    expect(nodeTypeForEntity("PERSON")).toBe("USER");
    expect(nodeTypeForEntity("COMPANY")).toBe("ORG");
    expect(nodeTypeForEntity("GOVERNMENT")).toBe("ORG");
    expect(nodeTypeForEntity("REGULATOR")).toBe("ORG");
    expect(nodeTypeForEntity("AI_AGENT")).toBe("AGENT");
    expect(nodeTypeForEntity("DEVICE")).toBe("DEVICE");
    expect(nodeTypeForEntity("APPLICATION")).toBe("APP");
  });

  it("maps listing types to node types", () => {
    expect(nodeTypeForListing("AGENT")).toBe("AGENT");
    expect(nodeTypeForListing("TOOL")).toBe("TOOL");
    expect(nodeTypeForListing("SKILL")).toBe("TOOL");
    expect(nodeTypeForListing("APP")).toBe("APP");
    expect(nodeTypeForListing("WORLD")).toBe("WORLD");
    expect(nodeTypeForListing("DEVICE")).toBe("DEVICE");
    expect(nodeTypeForListing("SERVICE")).toBe("SERVICE");
    expect(nodeTypeForListing("CONNECTOR")).toBe("SERVICE");
    expect(nodeTypeForListing("DATA_PACKAGE")).toBe("PRODUCT"); // default
  });

  it("declares the canonical node + edge vocabularies", () => {
    expect(GRAPH_NODE_TYPES).toEqual(["USER", "ORG", "APP", "TOOL", "AGENT", "SERVICE", "DEVICE", "WORLD", "COHORT", "PRODUCT"]);
    expect(GRAPH_EDGE_TYPES).toEqual(["OWNS", "USES", "CALLS", "PROVIDES", "CONTRIBUTES_TO", "PURCHASES", "GOVERNS", "DELEGATES", "DERIVES_FROM"]);
  });
});
