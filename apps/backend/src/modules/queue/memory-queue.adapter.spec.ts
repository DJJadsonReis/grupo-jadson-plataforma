import { MemoryQueueAdapter } from "./memory-queue.adapter";

describe("MemoryQueueAdapter", () => {
  it("preserves FIFO order without reporting Redis availability", async () => {
    const queue = new MemoryQueueAdapter();
    await queue.enqueue("jobs", { id: "1", payload: "first", enqueuedAt: "now" });
    await queue.enqueue("jobs", { id: "2", payload: "second", enqueuedAt: "now" });

    expect(queue.driver).toBe("memory");
    await expect(queue.dequeue("jobs")).resolves.toMatchObject({ id: "1", payload: "first" });
    await expect(queue.dequeue("jobs")).resolves.toMatchObject({ id: "2", payload: "second" });
    await expect(queue.dequeue("jobs")).resolves.toBeNull();
  });
});
