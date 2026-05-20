import { Injectable, NotFoundException } from "@nestjs/common";
import { NoteSource, PrismaService } from "@neportal/database";
import { OrganizationContextService } from "../organization/organization-context.service";
import { CreateNoteDto } from "./dto/note.dto";

const noteInclude = {
  creator: { select: { id: true, fullName: true } },
  project: { select: { id: true, name: true } },
} as const;

@Injectable()
export class NotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organization: OrganizationContextService,
  ) {}

  private orgId() {
    return this.organization.getOrganizationId();
  }

  private async assertProjectInOrg(projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: this.orgId() },
    });
    if (!project) {
      throw new NotFoundException(`Project with id "${projectId}" not found`);
    }
    return project;
  }

  async findAll(projectId?: string) {
    if (projectId) {
      await this.assertProjectInOrg(projectId);
    }

    return this.prisma.note.findMany({
      where: {
        organizationId: this.orgId(),
        ...(projectId ? { projectId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: noteInclude,
    });
  }

  async findOne(id: string) {
    const note = await this.prisma.note.findFirst({
      where: { id, organizationId: this.orgId() },
      include: noteInclude,
    });
    if (!note) {
      throw new NotFoundException(`Note with id "${id}" not found`);
    }
    return note;
  }

  async create(dto: CreateNoteDto) {
    const org = this.orgId();

    const creator = await this.prisma.user.findFirst({
      where: { id: dto.creatorId, organizationId: org },
    });
    if (!creator) {
      throw new NotFoundException(`User with id "${dto.creatorId}" not found in this organization`);
    }

    if (dto.projectId) {
      await this.assertProjectInOrg(dto.projectId);
    }

    return this.prisma.note.create({
      data: {
        organizationId: org,
        projectId: dto.projectId,
        creatorId: dto.creatorId,
        text: dto.text,
        source: dto.source ?? NoteSource.WEB,
      },
      include: noteInclude,
    });
  }
}
