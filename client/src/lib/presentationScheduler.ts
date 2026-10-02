import type { ServerEvent } from "./api";

export type DemoModeSpeed = "live" | "1x" | "2x";

/**
 * Deliberate, human-paced delays for demonstration mode (milliseconds at 1x).
 * Gives presenters and judges ample time to read the probe, agent response,
 * intercepted tool arguments, and safety invariant check.
 */
export const EVENT_DELAYS_MS: Record<string, number> = {
  session_started: 900,
  test_started: 1400,
  attack_generated: 2400,
  request_sent: 900,
  agent_response_received: 3200,
  tool_call: 2500,
  response_analyzed: 1800,
  policy_check: 2000,
  failure_detected: 2600,
  failure_recorded: 1800,
  test_passed: 2200,
  test_failed: 2500,
  session_completed: 2500,
  session_stopped: 800,
};

/**
 * Calm, human-readable activity status shown during presentation.
 */
export const EVENT_ACTIVITY_LABELS: Record<string, string> = {
  session_started: "Preparing test session...",
  test_started: "Dispatching adversarial probe...",
  attack_generated: "Generating adversarial probe...",
  request_sent: "Probing target agent...",
  agent_response_received: "Reading target agent response...",
  tool_call: "Intercepted agent tool invocation",
  response_analyzed: "Analyzing agent reasoning trace...",
  policy_check: "Verifying safety policy boundaries...",
  failure_detected: "Security boundary violation identified",
  failure_recorded: "Recording breach evidence...",
  test_passed: "Attack resisted — agent remained compliant",
  test_failed: "Vulnerability confirmed",
  session_completed: "Evaluation complete",
  session_stopped: "Evaluation paused",
};

export class PresentationScheduler {
  private queue: ServerEvent[] = [];
  private isProcessing = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private currentActivity: string | null = null;
  private speed: DemoModeSpeed = "1x";
  private onDispatch: (event: ServerEvent) => void;
  private onActivityChange: (activity: string | null, queueLength: number) => void;

  constructor(
    onDispatch: (event: ServerEvent) => void,
    onActivityChange: (activity: string | null, queueLength: number) => void,
    speed: DemoModeSpeed = "1x",
  ) {
    this.onDispatch = onDispatch;
    this.onActivityChange = onActivityChange;
    this.speed = speed;
  }

  public setSpeed(speed: DemoModeSpeed) {
    this.speed = speed;
    if (speed === "live" && this.queue.length > 0) {
      this.flushQueue();
    }
  }

  public getSpeed(): DemoModeSpeed {
    return this.speed;
  }

  public enqueue(event: ServerEvent) {
    if (this.speed === "live") {
      this.onDispatch(event);
      return;
    }

    this.queue.push(event);
    this.onActivityChange(this.currentActivity, this.queue.length);

    if (!this.isProcessing) {
      this.processNext();
    }
  }

  private getDelayForEvent(event: ServerEvent): number {
    const baseDelay = EVENT_DELAYS_MS[event.type] ?? 1200;
    if (this.speed === "2x") {
      return Math.round(baseDelay * 0.5);
    }
    return baseDelay;
  }

  private processNext() {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      this.currentActivity = null;
      this.onActivityChange(null, 0);
      return;
    }

    this.isProcessing = true;
    const nextEvent = this.queue.shift()!;
    const delay = this.getDelayForEvent(nextEvent);

    this.currentActivity = EVENT_ACTIVITY_LABELS[nextEvent.type] ?? "Evaluating agent behavior...";
    this.onActivityChange(this.currentActivity, this.queue.length);

    this.timer = setTimeout(() => {
      this.onDispatch(nextEvent);
      this.processNext();
    }, delay);
  }

  public flushQueue() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    while (this.queue.length > 0) {
      const event = this.queue.shift()!;
      this.onDispatch(event);
    }
    this.isProcessing = false;
    this.currentActivity = null;
    this.onActivityChange(null, 0);
  }

  public clear() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.queue = [];
    this.isProcessing = false;
    this.currentActivity = null;
    this.onActivityChange(null, 0);
  }

  public destroy() {
    this.clear();
  }
}
