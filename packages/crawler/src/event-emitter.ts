// packages/crawler/src/event-emitter.ts
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import type { PageCrawledEvent, JobCompletedEvent } from '@llm-crawler/shared';

const MAX_URLS_PER_EVENT = 200;

export class EventEmitter {
  private client: EventBridgeClient;
  private busName: string;

  constructor(busName: string, client?: EventBridgeClient) {
    this.busName = busName;
    this.client = client ?? new EventBridgeClient();
  }

  async emitPageCrawled(event: PageCrawledEvent): Promise<void> {
    if (event.newUrls.length <= MAX_URLS_PER_EVENT) {
      await this.putEvent('page.crawled', event);
      return;
    }
    for (let i = 0; i < event.newUrls.length; i += MAX_URLS_PER_EVENT) {
      const chunk = event.newUrls.slice(i, i + MAX_URLS_PER_EVENT);
      await this.putEvent('page.crawled', { ...event, newUrls: chunk });
    }
  }

  async emitJobCompleted(event: JobCompletedEvent): Promise<void> {
    await this.putEvent('job.completed', event);
  }

  private async putEvent(detailType: string, detail: object): Promise<void> {
    await this.client.send(
      new PutEventsCommand({
        Entries: [{
          Source: 'llm-crawler',
          DetailType: detailType,
          Detail: JSON.stringify(detail),
          EventBusName: this.busName,
        }],
      })
    );
  }
}
