import { SetMetadata } from "@nestjs/common";

export const ADMIN_ONLY_ROUTE = "grupo-jadson:admin-only";

/** Só administradores chegam a esta rota (controller ou método). */
export const AdminOnly = () => SetMetadata(ADMIN_ONLY_ROUTE, true);
