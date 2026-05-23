import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { loadRootEnv } from "@neportal/shared";
import { AppModule } from "./app.module";

const envPath = loadRootEnv();
if (envPath) {
  console.log(`Loaded env from: ${envPath}`);
} else {
  console.log("Root .env file not found. Environment variables should be provided by the system.");
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const corsOrigins = [
    process.env.APP_URL?.trim(),
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ].filter((v): v is string => Boolean(v));

  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Neportal API")
    .setDescription("MVP REST API (без авторизации, одна тестовая организация)")
    .setVersion("0.1.0")
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("docs", app, document);

  const port = process.env.API_PORT ? Number(process.env.API_PORT) : 4000;
  await app.listen(port);
}

bootstrap();
