import type { QueryClient } from "@tanstack/react-query";
import { taskKeys, ticketKeys } from "./keys";

/** Refetch task lists, ticket lists, project boards, and dashboard counts after ticket changes. */
export function invalidateTaskCaches(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ticketKeys.all });
  void queryClient.invalidateQueries({ queryKey: taskKeys.my() });
  void queryClient.invalidateQueries({ queryKey: taskKeys.all() });
  // Invalidate all allInfinite variants regardless of their filter params
  void queryClient.invalidateQueries({ queryKey: ["tasks", "all", "infinite"] });
  void queryClient.invalidateQueries({ queryKey: ["tasks", "meta"] });
  void queryClient.invalidateQueries({ queryKey: ["projects", "details"] });
  void queryClient.invalidateQueries({ queryKey: ["modules"] });
  void queryClient.invalidateQueries({ queryKey: ["dashboard", "home"] });
  void queryClient.invalidateQueries({ queryKey: ["dashboard", "layout"] });
}
