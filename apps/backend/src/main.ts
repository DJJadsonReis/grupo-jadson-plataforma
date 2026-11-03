import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api/v1");
  app.enableCors({ origin: process.env.DESKTOP_ORIGIN ?? ["http://localhost:1420", "tauri://localhost", "http://tauri.localhost"] });
  const port = Number(process.env.API_PORT ?? 3333);
  const host = process.env.API_HOST ?? "127.0.0.1";
  await app.listen(port, host);
  console.log(`Grupo Jadson API disponível em http://${host}:${port}/api/v1`);
}
bootstrap();
