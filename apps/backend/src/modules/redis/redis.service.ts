import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { createClient, RedisClientType } from "redis";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: RedisClientType | null;
  private ready = false;

  constructor() {
    const url = process.env.REDIS_URL?.trim();
    this.client = url ? createClient({ url, socket: { connectTimeout: 1500, reconnectStrategy: false } }) : null;
    this.client?.on("error", (error) => this.logger.warn(`Redis indisponível: ${error.message}`));
  }

  async onModuleInit(): Promise<void> {
    if (!this.client) {
      this.logger.warn("REDIS_URL ausente; recursos que dependem do Redis permanecem desativados.");
      return;
    }
    try {
      await this.client.connect();
      await this.client.ping();
      this.ready = true;
      this.logger.log("Redis respondeu ao PING.");
    } catch (error) {
      this.ready = false;
      this.logger.warn(`Redis não conectado: ${error instanceof Error ? error.message : "erro desconhecido"}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client?.isOpen) await this.client.quit().catch(() => undefined);
  }

  isReady(): boolean { return this.ready; }

  getClient(): RedisClientType {
    if (!this.client || !this.ready) throw new Error("Redis não está conectado.");
    return this.client;
  }

  async checkConnection(): Promise<boolean> {
    if (!this.client) return false;
    try {
      if (!this.client.isOpen) await this.client.connect();
      await this.client.ping();
      this.ready = true;
      return true;
    } catch {
      this.ready = false;
      return false;
    }
  }
}
