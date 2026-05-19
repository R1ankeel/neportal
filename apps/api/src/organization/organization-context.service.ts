import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "@neportal/database";

/**
 * MVP: все запросы привязаны к одной организации (seed Neportal Demo или NEPORTAL_ORGANIZATION_ID).
 */
@Injectable()
export class OrganizationContextService implements OnModuleInit {
  private readonly logger = new Logger(OrganizationContextService.name);
  private organizationId!: string;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const envId = process.env.NEPORTAL_ORGANIZATION_ID?.trim();
    if (envId) {
      const org = await this.prisma.organization.findUnique({ where: { id: envId } });
      if (!org) {
        throw new Error(
          `NEPORTAL_ORGANIZATION_ID=${envId} not found in database. Check .env or run migrations and seed.`,
        );
      }
      this.organizationId = org.id;
      this.logger.log(`Using organization from NEPORTAL_ORGANIZATION_ID (${org.slug})`);
      return;
    }

    const slug = process.env.NEPORTAL_ORG_SLUG?.trim() || "neportal-demo";
    const org = await this.prisma.organization.findUnique({ where: { slug } });
    if (!org) {
      throw new Error(
        `Organization slug "${slug}" not found. Run \`pnpm db:seed\` or set NEPORTAL_ORGANIZATION_ID.`,
      );
    }
    this.organizationId = org.id;
    this.logger.log(`Using organization slug=${slug} (id=${this.organizationId})`);
  }

  getOrganizationId(): string {
    return this.organizationId;
  }
}
