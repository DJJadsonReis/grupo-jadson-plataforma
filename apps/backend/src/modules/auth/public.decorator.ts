import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_ROUTE = "grupo-jadson:public-route";

/** Marca uma rota como acessível sem token (ex.: health check). */
export const Public = () => SetMetadata(IS_PUBLIC_ROUTE, true);
