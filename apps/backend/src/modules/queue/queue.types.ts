export interface QueueJob<TPayload = unknown> {
  id: string;
  payload: TPayload;
  enqueuedAt: string;
}

export interface QueueAdapter {
  readonly driver: "memory" | "redis";
  enqueue<TPayload>(queueName: string, job: QueueJob<TPayload>): Promise<void>;
  dequeue<TPayload>(queueName: string): Promise<QueueJob<TPayload> | null>;
}
