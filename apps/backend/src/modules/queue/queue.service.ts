import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { RedisService } from "../redis/redis.service";
import { MemoryQueueAdapter } from "./memory-queue.adapter";
import { RedisQueueAdapter } from "./redis-queue.adapter";
import { QueueAdapter, QueueJob } from "./queue.types";

@Injectable()
export class QueueService implements OnModuleInit {
  private readonly logger = new Logger(QueueService.name);
  private readonly memory = new MemoryQueueAdapter();
  private adapter: QueueAdapter = this.memory;

  constructor(private readonly redis: RedisService) {}

  async onModuleInit(): Promise<void> {
    const requested = process.env.QUEUE_DRIVER?.trim().toLowerCase();
    const production = process.env.NODE_ENV === "production";
    if (!([undefined, "local", "redis"].includes(requested))) {
      throw new Error(`QUEUE_DRIVER inválido: ${requested}. Use local ou redis.`);
    }
    if (production && requested === "local") {
      throw new Error("QUEUE_DRIVER=local não é permitido em produção.");
    }

    const requireRedis = production || requested === "redis";
    const redisConnected = this.redis.isReady() || await this.redis.checkConnection();
    if (requireRedis && !redisConnected) {
      throw new ServiceUnavailableException("QUEUE_DRIVER=redis exige uma conexão Redis válida.");
    }
    if (redisConnected && requested !== "local") {
      this.adapter = new RedisQueueAdapter(this.redis.getClient());
      this.logger.log("Fila usando Redis conectado.");
    } else {
      this.adapter = this.memory;
      this.logger.warn("Fila usando memória local; trabalhos não sobrevivem à reinicialização.");
    }
  }

  getDriver(): QueueAdapter["driver"] { return this.adapter.driver; }

  async enqueue<TPayload>(queueName: string, payload: TPayload): Promise<QueueJob<TPayload>> {
    const job: QueueJob<TPayload> = { id: randomUUID(), payload, enqueuedAt: new Date().toISOString() };
    try { await this.adapter.enqueue(queueName, job); }
    catch (error) {
      this.logger.error(`Falha ao adicionar trabalho à fila ${queueName}.`);
      throw new ServiceUnavailableException("Não foi possível adicionar o trabalho à fila.", { cause: error });
    }
    return job;
  }

  async dequeue<TPayload>(queueName: string): Promise<QueueJob<TPayload> | null> {
    try { return await this.adapter.dequeue<TPayload>(queueName); }
    catch (error) {
      this.logger.error(`Falha ao obter trabalho da fila ${queueName}.`);
      throw new ServiceUnavailableException("Não foi possível obter trabalho da fila.", { cause: error });
    }
  }
}
