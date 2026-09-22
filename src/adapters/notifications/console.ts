import type {
  NotificationEvent,
  NotificationProvider,
} from "../../core/ports/notification-provider.ts";
import type { AppLogger } from "../../core/ports/logger.ts";

/**
 * Console notification adapter for local development and demonstration. It
 * logs the event through the structured logger rather than sending email, so
 * it never requires credentials and never authorizes an action.
 */
export class ConsoleNotificationProvider implements NotificationProvider {
  readonly channel = "console";

  private readonly logger: AppLogger;

  constructor(logger: AppLogger) {
    this.logger = logger;
  }

  async notify(authorId: string, event: NotificationEvent): Promise<void> {
    this.logger.info(
      {
        authorId,
        event: event.type,
        summary: summarize(event),
      },
      "notification.sent",
    );
  }
}

function summarize(event: NotificationEvent): string {
  switch (event.type) {
    case "draft_ready":
      return `draft ${event.draftId} ready for review`;
    case "publish_success":
      return `draft ${event.draftId} published at ${event.url}`;
    case "publish_failure":
      return `draft ${event.draftId} failed: ${event.reason}`;
  }
}
