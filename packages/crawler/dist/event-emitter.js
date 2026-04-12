// packages/crawler/src/event-emitter.ts
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
const MAX_URLS_PER_EVENT = 200;
export class EventEmitter {
    client;
    busName;
    constructor(busName, client) {
        this.busName = busName;
        this.client = client ?? new EventBridgeClient();
    }
    async emitPageCrawled(event) {
        if (event.newUrls.length <= MAX_URLS_PER_EVENT) {
            await this.putEvent('page.crawled', event);
            return;
        }
        for (let i = 0; i < event.newUrls.length; i += MAX_URLS_PER_EVENT) {
            const chunk = event.newUrls.slice(i, i + MAX_URLS_PER_EVENT);
            await this.putEvent('page.crawled', { ...event, newUrls: chunk });
        }
    }
    async emitJobCompleted(event) {
        await this.putEvent('job.completed', event);
    }
    async putEvent(detailType, detail) {
        await this.client.send(new PutEventsCommand({
            Entries: [{
                    Source: 'llm-crawler',
                    DetailType: detailType,
                    Detail: JSON.stringify(detail),
                    EventBusName: this.busName,
                }],
        }));
    }
}
//# sourceMappingURL=event-emitter.js.map