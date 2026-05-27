import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AbsencesModule } from "./absences/absences.module";
import { BudgetExpensesModule } from "./budget-expenses/budget-expenses.module";
import { BudgetsModule } from "./budgets/budgets.module";
import { NotesModule } from "./notes/notes.module";
import { NotificationBindingsModule } from "./notification-bindings/notification-bindings.module";
import { OrganizationModule } from "./organization/organization.module";
import { PrismaModule } from "@neportal/database";
import { ProjectsModule } from "./projects/projects.module";
import { TasksModule } from "./tasks/tasks.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    PrismaModule,
    OrganizationModule,
    UsersModule,
    ProjectsModule,
    TasksModule,
    BudgetsModule,
    BudgetExpensesModule,
    NotesModule,
    AbsencesModule,
    NotificationBindingsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
