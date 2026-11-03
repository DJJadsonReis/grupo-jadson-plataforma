import { RedisClientType } from "redis";
import { QueueAdapter, QueueJob } from "./queue.types";

export class RedisQueueAdapter implements QueueAdapter {
  readonly driver = "redis" as const;

  constructor(private readonly client: RedisClientType) {}

  async enqueue<TPayload>(queueName: string, job: QueueJob<TPayload>): Promise<void> {
    await this.client.rPush(this.key(queueName), JSON.stringify(job));
  }

  async dequeue<TPayload>(queueName: string): Promise<QueueJob<TPayload> | null> {
    const value = await this.client.lPop(this.key(queueName));
    return value ? JSON.parse(value) as QueueJob<TPayload> : null;
  }

  private key(queueName: string): string {
    if (!/^[a-zA-Z0-9:_-]{1,100}$/.test(queueName)) throw new Error("Nome de fila inválido.");
    return `grupo-jadson:queue:${queueName}`;
  }
}
