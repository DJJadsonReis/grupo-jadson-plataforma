import { Logger } from "@nestjs/common";
import { maskSecretValues, maskSecrets } from "./secret-masking";

/** Logger do backend que mascara mensagens e metadados antes de delegar ao Nest. */
export class MaskedLogger extends Logger {
  private maskArguments(args: unknown[]): unknown[] {
    return args.map((argument) => typeof argument === "string" ? maskSecrets(argument) : maskSecretValues(argument));
  }

  log(message: any, ...optionalParams: any[]): void {
    super.log(...this.maskArguments([message, ...optionalParams]) as [any, ...any[]]);
  }

  error(message: any, ...optionalParams: any[]): void {
    super.error(...this.maskArguments([message, ...optionalParams]) as [any, ...any[]]);
  }

  warn(message: any, ...optionalParams: any[]): void {
    super.warn(...this.maskArguments([message, ...optionalParams]) as [any, ...any[]]);
  }

  debug(message: any, ...optionalParams: any[]): void {
    super.debug(...this.maskArguments([message, ...optionalParams]) as [any, ...any[]]);
  }

  verbose(message: any, ...optionalParams: any[]): void {
    super.verbose(...this.maskArguments([message, ...optionalParams]) as [any, ...any[]]);
  }

  fatal(message: any, ...optionalParams: any[]): void {
    super.fatal(...this.maskArguments([message, ...optionalParams]) as [any, ...any[]]);
  }
}
