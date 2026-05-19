import { Injectable } from "@nestjs/common";
import { EntityStatus } from "@neportal/shared";
import { Role, roleHasPermission } from "@neportal/permissions";

@Injectable()
export class AppService {
  getHealth() {
    return {
      ok: true,
      service: "neportal-api",
      sample: {
        entityStatus: EntityStatus.Active,
        memberCanReadOrg: roleHasPermission(Role.Member, "org.read"),
      },
    };
  }
}
