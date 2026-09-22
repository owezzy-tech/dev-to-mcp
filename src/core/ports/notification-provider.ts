/**
 * Provider-neutral notification interface (FR-044, Should). Notifications are
 * informational only: they never authorize an action, and the DEV.to API key
 * never flows through them.
 */

export type NotificationEvent =
  | {
      readonly type: "draft_ready";
      readonly draftId: string;
      readonly title: string;
    }
  | {
      readonly type: "publish_success";
      readonly draftId: string;
      readonly url: string;
    }
  | {
      readonly type: "publish_failure";
      readonly draftId: string;
      readonly reason: string;
    };

export interface NotificationProvider {
  /** Human-readable channel name for logs and the dashboard. */
  readonly channel: string;
  notify(authorId: string, event: NotificationEvent): Promise<void>;
}

/** No-op provider used when no notification channel is configured. */
export const NULL_NOTIFICATION_PROVIDER: NotificationProvider = {
  channel: "none",
  async notify(): Promise<void> {},
};
