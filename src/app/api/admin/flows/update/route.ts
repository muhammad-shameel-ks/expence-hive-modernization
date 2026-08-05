import { handleUpdateFlowRequest } from "@/server/admin/http";
import { adminRoute } from "@/server/admin/route-guard";

export const POST = adminRoute((request, commands, employee) =>
  handleUpdateFlowRequest(request, commands, employee.id),
);
