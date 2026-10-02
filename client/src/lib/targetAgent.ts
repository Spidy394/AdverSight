import type { TargetAgent, TargetAgentKind } from "@/types/testing";

export type TargetAgentErrors = Partial<
  Record<"name" | "endpoint" | "timeout", string>
>;

export function getTargetAgentErrors(agent: TargetAgent): TargetAgentErrors {
  if (agent.kind !== "http") return {};

  const errors: TargetAgentErrors = {};
  if (!agent.name.trim()) errors.name = "Enter a name for this agent.";
  if (!agent.endpoint.trim()) {
    errors.endpoint = "Enter an HTTP endpoint.";
  } else {
    try {
      const endpoint = new URL(agent.endpoint);
      if (
        (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") ||
        !endpoint.hostname
      ) {
        errors.endpoint = "Use a valid HTTP or HTTPS URL.";
      } else if (endpoint.username || endpoint.password) {
        errors.endpoint = "Do not include credentials in the endpoint URL.";
      }
    } catch {
      errors.endpoint = "Use a valid HTTP or HTTPS URL.";
    }
  }
  if (
    !Number.isFinite(agent.requestTimeoutSeconds) ||
    (agent.requestTimeoutSeconds ?? 0) <= 0
  ) {
    errors.timeout = "Timeout must be a positive number of seconds.";
  }
  return errors;
}

export function targetAgentLabel(kind: TargetAgentKind | undefined): string {
  switch (kind) {
    case "demo_vulnerable":
      return "Vulnerable Demo";
    case "demo_secure":
      return "Secure Demo";
    case "http":
      return "Custom HTTP Agent";
    default:
      return "Vulnerable Demo";
  }
}