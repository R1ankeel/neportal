import { Global, Module } from "@nestjs/common";
import { OrganizationContextService } from "./organization-context.service";

@Global()
@Module({
  providers: [OrganizationContextService],
  exports: [OrganizationContextService],
})
export class OrganizationModule {}
