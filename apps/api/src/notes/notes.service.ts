import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { NoteSource, PrismaService } from "@neportal/database";
import { OrganizationContextService } from "../organization/organization-context.service";
import { CreateNoteDto, UpdateNoteDto } from "./dto/note.dto";

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

  private assertActor(actorUserId: string | undefined): string {
    const trimmed = actorUserId?.trim();
    if (!trimmed) {
      throw new BadRequestException("actorUserId is required");
    }
    return trimmed;
  }

  async findAll(actorUserId?: string) {
    const actor = this.assertActor(actorUserId);
    return this.prisma.note.findMany({
      where: {
        organizationId: this.orgId(),
        creatorId: actor,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: noteInclude,
    });
  }

  async findOne(id: string, actorUserId?: string) {
    const actor = this.assertActor(actorUserId);
    const note = await this.prisma.note.findFirst({
      where: { id, organizationId: this.orgId(), creatorId: actor },
      include: noteInclude,
    });
    if (!note) {
      // 404 both for missing and чужая заметка
      throw new NotFoundException(`Note with id "${id}" not found`);
    }
    return note;
  }

  async create(dto: CreateNoteDto) {
    const org = this.orgId();
    const actorUserId = this.assertActor(dto.actorUserId);

    const legacyCreatorId = dto.creatorId?.trim();
    if (legacyCreatorId && legacyCreatorId !== actorUserId) {
      throw new BadRequestException("creatorId must match actorUserId");
    }

    const creator = await this.prisma.user.findFirst({
      where: { id: actorUserId, organizationId: org },
    });
    if (!creator) {
      throw new NotFoundException(
        `User with id "${actorUserId}" not found in this organization`,
      );
    }

    const text = dto.text.trim();
    if (!text) {
      throw new BadRequestException("Note text must not be empty");
    }

    return this.prisma.note.create({
      data: {
        organizationId: org,
        projectId: null,
        creatorId: actorUserId,
        text,
        source: dto.source ?? NoteSource.WEB,
      },
      include: noteInclude,
    });
  }

  async update(id: string, dto: UpdateNoteDto) {
    const actorUserId = this.assertActor(dto.actorUserId);
    const existing = await this.prisma.note.findFirst({
      where: { id, organizationId: this.orgId(), creatorId: actorUserId },
    });
    if (!existing) {
      // 404 both for missing and чужая заметка
      throw new NotFoundException(`Note with id "${id}" not found`);
    }

    const text = dto.text.trim();
    if (!text) {
      throw new BadRequestException("Note text must not be empty");
    }

    if (text === existing.text.trim()) {
      return this.findOne(id, actorUserId);
    }

    return this.prisma.note.update({
      where: { id },
      data: { text },
      include: noteInclude,
    });
  }
}
