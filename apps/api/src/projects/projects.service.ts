import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@neportal/database";
import { OrganizationContextService } from "../organization/organization-context.service";
import { CreateProjectDto } from "./dto/create-project.dto";

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organization: OrganizationContextService,
  ) {}

  private orgId() {
    return this.organization.getOrganizationId();
  }

  findAll() {
    return this.prisma.project.findMany({
      where: { organizationId: this.orgId() },
      orderBy: { updatedAt: "desc" },
      include: { createdBy: { select: { id: true, fullName: true, email: true } } },
    });
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, organizationId: this.orgId() },
      include: {
        createdBy: { select: { id: true, fullName: true, email: true, role: true } },
        members: { include: { user: { select: { id: true, fullName: true, email: true } } } },
      },
    });
    if (!project) {
      throw new NotFoundException(`Project with id "${id}" not found`);
    }
    return project;
  }

  async create(dto: CreateProjectDto) {
    const creator = await this.prisma.user.findFirst({
      where: { id: dto.createdById, organizationId: this.orgId() },
    });
    if (!creator) {
      throw new NotFoundException(`User with id "${dto.createdById}" not found in this organization`);
    }

    return this.prisma.project.create({
      data: {
        organizationId: this.orgId(),
        name: dto.name,
        description: dto.description,
        createdById: dto.createdById,
        status: dto.status ?? undefined,
      },
      include: { createdBy: { select: { id: true, fullName: true, email: true } } },
    });
  }
}
