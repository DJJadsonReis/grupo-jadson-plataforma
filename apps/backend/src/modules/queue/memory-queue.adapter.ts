import { Injectable } from "@nestjs/common";
import { QueueAdapter, QueueJob } from "./queue.types";

@Injectable()
export class MemoryQueueAdapter implements QueueAdapter {
  readonly driver = "memory" as const;
  private readonly queues = new Map<string, QueueJob[]>();

  async enqueue<TPayload>(queueName: string, job: QueueJob<TPayload>): Promise<void> {
    const queue = this.queues.get(queueName) ?? [];
    queue.push(job);
    this.queues.set(queueName, queue);
  }

  async dequeue<TPayload>(queueName: string): Promise<QueueJob<TPayload> | null> {
    const job = this.queues.get(queueName)?.shift();
    return (job as QueueJob<TPayload> | undefined) ?? null;
  }
}
