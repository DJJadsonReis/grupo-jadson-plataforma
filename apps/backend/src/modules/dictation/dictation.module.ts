import { Module } from "@nestjs/common";
import { DictationController } from "./dictation.controller";
import { DictationService } from "./dictation.service";
import { TransformersTranscriber } from "./transcriber";

@Module({ controllers: [DictationController], providers: [TransformersTranscriber, { provide: DictationService, useFactory: (transcriber: TransformersTranscriber) => new DictationService(transcriber), inject: [TransformersTranscriber] }] })
export class DictationModule {}
