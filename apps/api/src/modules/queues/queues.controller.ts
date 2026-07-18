import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsInt, IsString, MaxLength, Min, MinLength } from "class-validator";
import { RequirePermissions } from "../../auth/permissions.guard";
import { CurrentUser } from "../../auth/current-user.decorator";
import type { AuthenticatedUser } from "@leen-life/shared-types";
import { QueuesService } from "./queues.service";
import { requestMeta, type AuthedRequest } from "../../auth/auth.types";

class ReorderDto {
  @IsInt() @Min(1) newPosition!: number;
  @IsString() @MinLength(3) @MaxLength(300) reason!: string;
}

@ApiTags("queues")
@Controller("queues")
export class QueuesController {
  constructor(private readonly queues: QueuesService) {}

  /**
   * Department queue for a given day. Department-scoped users are locked
   * to their own department regardless of the departmentId parameter.
   */
  @Get()
  @RequirePermissions("queues.read.all", "queues.read.own-department")
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query("departmentId") departmentId?: string,
    @Query("date") date?: string,
  ) {
    return this.queues.list(user, departmentId, date);
  }

  @Post(":id/reorder")
  @RequirePermissions("queues.reorder")
  reorder(
    @Param("id") id: string,
    @Body() dto: ReorderDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthedRequest,
  ) {
    return this.queues.reorder(id, dto.newPosition, dto.reason, user, requestMeta(req));
  }
}
