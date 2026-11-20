import { Module } from "@nestjs/common";
import { IntegrationsModule } from "../integrations/integrations.module";
import { OpenAiProvider } from "./openai.provider";
import { ProvidersService } from "./providers.service";
import { AnthropicProvider } from "./anthropic.provider";
import { ProvidersController } from "./providers.controller";
import { ModelProvidersController } from "./model-providers.controller";
import { ModelProvidersService } from "./model-providers.service";
import { DatabaseModule } from "../database/database.module";

@Module({ imports: [IntegrationsModule, DatabaseModule], controllers: [ProvidersController, ModelProvidersController], providers: [OpenAiProvider, AnthropicProvider, ProvidersService, ModelProvidersService], exports: [ProvidersService, ModelProvidersService] })
export class ProvidersModule {}
