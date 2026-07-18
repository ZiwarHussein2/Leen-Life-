export * from "@prisma/client";
export { PrismaClient } from "@prisma/client";

import { PrismaClient } from "@prisma/client";

let prisma: PrismaClient | undefined;

/** Shared PrismaClient singleton for app processes. */
export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}
