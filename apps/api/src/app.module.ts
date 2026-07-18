import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { Controller, Get } from "@nestjs/common";

import { PrismaService } from "./prisma.service";
import { AuditService } from "./audit/audit.service";
import { JwtAuthGuard, Public } from "./auth/jwt.guard";
import { PermissionsGuard } from "./auth/permissions.guard";
import { AuthController } from "./auth/auth.controller";

import { PatientsController } from "./modules/patients/patients.controller";
import { PatientsService } from "./modules/patients/patients.service";
import { TestsController } from "./modules/tests/tests.controller";
import { TestsService } from "./modules/tests/tests.service";
import { InvoicesController } from "./modules/invoices/invoices.controller";
import { InvoicesService } from "./modules/invoices/invoices.service";
import { DiscountsController } from "./modules/discounts/discounts.controller";
import { DiscountsService } from "./modules/discounts/discounts.service";
import { QueuesController } from "./modules/queues/queues.controller";
import { QueuesService } from "./modules/queues/queues.service";
import { ScansController } from "./modules/scans/scans.controller";
import { ScansService } from "./modules/scans/scans.service";
import { FilesController } from "./modules/files/files.controller";
import { FilesService } from "./modules/files/files.service";
import { StorageService } from "./modules/files/storage.service";
import { ReportsController } from "./modules/reports/reports.controller";
import { ReportsService } from "./modules/reports/reports.service";
import { InventoryController } from "./modules/inventory/inventory.controller";
import { InventoryService } from "./modules/inventory/inventory.service";
import { ReferralsController } from "./modules/referrals/referrals.controller";
import { ReferralsService } from "./modules/referrals/referrals.service";
import { EmployeesController } from "./modules/employees/employees.controller";
import { EmployeesService } from "./modules/employees/employees.service";
import { AccountingController } from "./modules/accounting/accounting.controller";
import { AccountingService } from "./modules/accounting/accounting.service";
import { AdminController } from "./modules/admin/admin.controller";
import { AdminService } from "./modules/admin/admin.service";
import { MernaController } from "./modules/merna/merna.controller";
import { MernaService } from "./modules/merna/merna.service";

@Controller()
class HealthController {
  @Public()
  @Get("health")
  health() {
    return { status: "ok", service: "leen-life-api", time: new Date().toISOString() };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.RATE_LIMIT_WINDOW_SECONDS ?? 60) * 1000,
        limit: Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 120),
      },
    ]),
  ],
  controllers: [
    HealthController,
    AuthController,
    PatientsController,
    TestsController,
    InvoicesController,
    DiscountsController,
    QueuesController,
    ScansController,
    FilesController,
    ReportsController,
    InventoryController,
    ReferralsController,
    EmployeesController,
    AccountingController,
    AdminController,
    MernaController,
  ],
  providers: [
    PrismaService,
    AuditService,
    StorageService,
    PatientsService,
    TestsService,
    InvoicesService,
    DiscountsService,
    QueuesService,
    ScansService,
    FilesService,
    ReportsService,
    InventoryService,
    ReferralsService,
    EmployeesService,
    AccountingService,
    AdminService,
    MernaService,
    // Order matters: throttle → authenticate → authorize.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
