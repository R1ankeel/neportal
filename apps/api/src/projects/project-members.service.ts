import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService, ProjectRole, UserRole } from "@neportal/database";
import { OrganizationContextService } from "../organization/organization-context.service";
import { ProjectAccessService } from "./project-access.service";
import { AddProjectMemberDto } from "./dto/add-project-member.dto";

export type ProjectMemberDto = {
  id: string;
  userId: string;
  role: ProjectRole;
  createdAt: Date;
  user: { id: string; fullName: string; email: string | null; role: UserRole };
  alreadyMember?: boolean;
};

const memberInclude = {
  user: { select: { id: true, fullName: true, email: true, role: true } },
} as const;

@Injectable()
export class ProjectMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organization: OrganizationContextService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  private orgId() {
    return this.organization.getOrganizationId();
  }

  async list(projectId: string, actorUserId?: string) {
    await this.projectAccess.assertActorCanAccessActiveProject(
      this.projectAccess.requireActorId(actorUserId),
      projectId,
    );

    const members = await this.prisma.projectMember.findMany({
      where: { projectId },
      orderBy: { user: { fullName: "asc" } },
      include: memberInclude,
    });

    return members.map((m) => this.toDto(m));
  }

  async add(projectId: string, actorUserId: string, dto: AddProjectMemberDto): Promise<ProjectMemberDto> {
    await this.projectAccess.assertActorCanManageProjectMembers(actorUserId, projectId);

    const targetUserId = dto.userId?.trim();
    if (!targetUserId) {
      throw new NotFoundException(`User with id "${dto.userId}" not found in this organization`);
    }

    const user = await this.prisma.user.findFirst({
      where: { id: targetUserId, organizationId: this.orgId() },
    });
    if (!user) {
      throw new NotFoundException(`User with id "${targetUserId}" not found in this organization`);
    }

    const existing = await this.prisma.projectMember.findFirst({
      where: { projectId, userId: targetUserId },
      include: memberInclude,
    });
    if (existing) {
      return { ...this.toDto(existing), alreadyMember: true };
    }

    const created = await this.prisma.projectMember.create({
      data: {
        projectId,
        userId: targetUserId,
        role: ProjectRole.MEMBER,
      },
      include: memberInclude,
    });

    return this.toDto(created);
  }

  async remove(projectId: string, actorUserId: string, targetUserId: string): Promise<void> {
    const { actor } = await this.projectAccess.assertActorCanManageProjectMembers(
      actorUserId,
      projectId,
    );

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: this.orgId() },
      select: { id: true, createdById: true },
    });
    if (!project) {
      throw new NotFoundException(`Project with id "${projectId}" not found`);
    }

    const tid = targetUserId?.trim();
    if (!tid) {
      throw new NotFoundException(`User with id "${targetUserId}" not found in this organization`);
    }

    const membership = await this.prisma.projectMember.findFirst({
      where: { projectId, userId: tid },
      include: { user: { select: { id: true, role: true } } },
    });
    if (!membership) {
      throw new NotFoundException(`User with id "${tid}" is not a member of this project`);
    }

    const memberCount = await this.prisma.projectMember.count({ where: { projectId } });
    if (memberCount <= 1) {
      throw new ConflictException("Cannot remove the last project member");
    }

    if (actor.role !== UserRole.OWNER) {
      if (tid === actor.id) {
        throw new ForbiddenException("MANAGER cannot remove themselves from the project");
      }
      if (membership.user.role === UserRole.OWNER) {
        throw new ForbiddenException("MANAGER cannot remove organization OWNER from the project");
      }
      if (tid === project.createdById) {
        throw new ForbiddenException("MANAGER cannot remove the project creator");
      }
    }

    await this.prisma.projectMember.delete({ where: { id: membership.id } });
  }

  private toDto(m: {
    id: string;
    userId: string;
    role: ProjectRole;
    createdAt: Date;
    user: { id: string; fullName: string; email: string | null; role: UserRole };
  }): ProjectMemberDto {
    return {
      id: m.id,
      userId: m.userId,
      role: m.role,
      createdAt: m.createdAt,
      user: m.user,
    };
  }
}
