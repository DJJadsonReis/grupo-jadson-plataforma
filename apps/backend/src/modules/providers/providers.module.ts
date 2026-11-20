import { Module } from "@nestjs/common";
import { IntegrationsModule } from "../integrations/integrations.module";
import { OpenAiProvider } from "./openai.provider";
import { ProvidersService } from "./providers.service";
import { AnthropicProvider } from "./anthropic.provider";
import { ProvidersController } from "./providers.controller";

@Module({ imports: [IntegrationsModule], controllers: [ProvidersController], providers: [OpenAiProvider, AnthropicProvider, ProvidersService], exports: [ProvidersService] })
export class ProvidersModule {}
