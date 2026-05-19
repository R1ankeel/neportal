import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@neportal/database";
import { OrganizationContextService } from "../organization/organization-context.service";

@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organization: OrganizationContextService,
  ) {}

  private orgId() {
    return this.organization.getOrganizationId();
  }

  async findAll(projectId?: string) {
    if (projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: projectId, organizationId: this.orgId() },
      });
      if (!project) {
        throw new NotFoundException(`Project with id "${projectId}" not found`);
      }
    }

    return this.prisma.note.findMany({
      where: {
        organizationId: this.orgId(),
        ...(projectId ? { projectId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        creator: { select: { id: true, fullName: true } },
        project: { select: { id: true, name: true } },
      },
    });
  }
}
