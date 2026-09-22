/**
 * Minimal Prometheus-compatible metrics registry. Correlation IDs are shared
 * across logs, the response header, audit events, and these request counters
 * so an operator can join a request across every signal.
 */

export interface MetricsRegistry {
  incrementRequest(correlationId: string): void;
  render(): string;
}

export function createMetricsRegistry(): MetricsRegistry {
  const requestsByCorrelation = new Map<string, number>();

  return {
    incrementRequest(correlationId: string): void {
      requestsByCorrelation.set(
        correlationId,
        (requestsByCorrelation.get(correlationId) ?? 0) + 1,
      );
    },
    render(): string {
      const lines = [
        "# HELP dev_to_mcp_uptime_seconds Process uptime in seconds.",
        "# TYPE dev_to_mcp_uptime_seconds gauge",
        `dev_to_mcp_uptime_seconds ${process.uptime().toFixed(3)}`,
        "# HELP dev_to_mcp_http_requests_total HTTP requests by correlation id.",
        "# TYPE dev_to_mcp_http_requests_total counter",
      ];
      for (const [correlationId, count] of requestsByCorrelation) {
        lines.push(
          `dev_to_mcp_http_requests_total{correlation_id="${correlationId}"} ${count}`,
        );
      }
      return `${lines.join("\n")}\n`;
    },
  };
}
