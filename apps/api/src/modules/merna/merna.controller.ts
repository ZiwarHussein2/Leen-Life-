import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Query,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { timingSafeEqual } from "node:crypto";
import { Public } from "../../auth/jwt.guard";
import { MernaService } from "./merna.service";

/**
 * Future Merna central-platform connector (spec §21).
 *
 * - Disabled by default (MERNA_CONNECTOR_ENABLED=false)
 * - Service-to-service authentication via a dedicated service key
 * - Read-only: only aggregated, privacy-filtered summaries
 * - No patient-level, employee-ID, raw-location, or report-body data
 * - Every request creates an audit event
 * - The Merna AI product lives in the separate Merna Control Center;
 *   this branch build integrates no AI model.
 */
@ApiTags("merna-connector")
@Controller("merna-connector")
export class MernaController {
  constructor(private readonly merna: MernaService) {}

  private assertServiceAuth(serviceKey?: string) {
    if (process.env.MERNA_CONNECTOR_ENABLED !== "true") {
      throw new ServiceUnavailableException("Merna connector is not enabled");
    }
    const expected = process.env.MERNA_CONNECTOR_SERVICE_KEY;
    if (!expected || !serviceKey) throw new ForbiddenException("Service authentication required");
    const a = Buffer.from(serviceKey);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException("Invalid service key");
    }
  }

  @Public()
  @Get("v1/branch-kpis")
  async branchKpis(
    @Headers("x-merna-service-key") serviceKey?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    this.assertServiceAuth(serviceKey);
    return this.merna.branchKpis(from, to);
  }

  @Public()
  @Get("v1/department-performance")
  async departmentPerformance(
    @Headers("x-merna-service-key") serviceKey?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    this.assertServiceAuth(serviceKey);
    return this.merna.departmentPerformance(from, to);
  }

  @Public()
  @Get("v1/attendance-summary")
  async attendanceSummary(
    @Headers("x-merna-service-key") serviceKey?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    this.assertServiceAuth(serviceKey);
    return this.merna.attendanceSummary(from, to);
  }
}
