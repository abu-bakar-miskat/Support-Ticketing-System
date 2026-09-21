type HomeRoutingProfile = {
  role: string;
  isSuperAdmin: boolean;
};

/**
 * Resolve the default destination for the dashboard home route.
 * An active department means the user deliberately entered a workspace, so
 * admins should remain on Home instead of being sent back to the picker.
 */
export function dashboardHomeRedirect(
  profile: HomeRoutingProfile,
  activeDeptId: string | null,
): "/platform" | "/departments" | "/manager" | null {
  if (profile.isSuperAdmin && !activeDeptId) return "/platform";
  if (profile.role === "admin" && !profile.isSuperAdmin && !activeDeptId) {
    return "/departments";
  }
  if (profile.role === "manager") return "/manager";
  return null;
}
