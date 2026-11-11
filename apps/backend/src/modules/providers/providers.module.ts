import { Module } from "@nestjs/common";
import { IntegrationsModule } from "../integrations/integrations.module";
import { OpenAiProvider } from "./openai.provider";
import { ProvidersService } from "./providers.service";

@Module({ imports: [IntegrationsModule], providers: [OpenAiProvider, ProvidersService], exports: [ProvidersService] })
export class ProvidersModule {}
