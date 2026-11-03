import { Module } from "@nestjs/common";
import { OpenAiProvider } from "./openai.provider";
import { ProvidersService } from "./providers.service";

@Module({ providers: [OpenAiProvider, ProvidersService], exports: [ProvidersService] })
export class ProvidersModule {}
