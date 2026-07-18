import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

// Prisma BigInt columns (file sizes) must serialize in JSON responses.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ["log", "warn", "error"] });

  app.setGlobalPrefix("api/v1", { exclude: ["health", "api/docs"] });

  // Correlation ID + security headers on every response.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const correlationId = (req.headers["x-correlation-id"] as string) || randomUUID();
    (req as Request & { correlationId: string }).correlationId = correlationId;
    res.setHeader("x-correlation-id", correlationId);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=(), microphone=()");
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
    }
    next();
  });

  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(","),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const config = new DocumentBuilder()
    .setTitle("Leen Life Operations API")
    .setDescription(
      "Versioned API for the Leen Life Operations Platform. All endpoints require authentication and enforce role, branch, department, and object-level authorization.",
    )
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, config));

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
  console.log(`Leen Life API listening on :${port} (docs at /api/docs)`);
}

bootstrap();
