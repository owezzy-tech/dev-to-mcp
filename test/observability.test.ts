import { describe, expect, it } from "vitest";
import { createMetricsRegistry } from "../src/lib/metrics.ts";

describe("metrics registry", () => {
  it("counts requests by correlation id in Prometheus text format", () => {
    const registry = createMetricsRegistry();
    registry.incrementRequest("corr-a");
    registry.incrementRequest("corr-a");
    registry.incrementRequest("corr-b");

    const rendered = registry.render();
    expect(rendered).toContain("dev_to_mcp_http_requests_total");
    expect(rendered).toContain('correlation_id="corr-a"} 2');
    expect(rendered).toContain('correlation_id="corr-b"} 1');
    expect(rendered).toContain("dev_to_mcp_uptime_seconds");
  });
});
