export interface GraphShape {
  nodes: string[];
  topics: string[];
  services: string[];
}

export interface GraphAssertion {
  ok: boolean;
  missing: GraphShape;
  unexpected: GraphShape;
}

function difference(expected: string[], actual: string[]): string[] {
  return expected.filter((item) => !actual.includes(item));
}

export function assertGraph(expected: GraphShape, actual: GraphShape): GraphAssertion {
  const missing = {
    nodes: difference(expected.nodes, actual.nodes),
    topics: difference(expected.topics, actual.topics),
    services: difference(expected.services, actual.services),
  };
  const unexpected = {
    nodes: difference(actual.nodes, expected.nodes),
    topics: difference(actual.topics, expected.topics),
    services: difference(actual.services, expected.services),
  };
  return {
    ok:
      Object.values(missing).every((items) => items.length === 0) &&
      Object.values(unexpected).every((items) => items.length === 0),
    missing,
    unexpected,
  };
}
