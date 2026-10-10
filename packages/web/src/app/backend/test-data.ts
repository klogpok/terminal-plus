import type { RepoView, ServiceView } from '@devpanel/shared';

/** Builders for test snapshots. */
export function aService(overrides: Partial<ServiceView> & { id: string }): ServiceView {
  return { name: overrides.id, command: 'pnpm dev', dependsOn: [], status: 'stopped', ...overrides };
}

export function aRepo(overrides: Partial<RepoView> & { id: string }): RepoView {
  return { name: overrides.id, path: `C:\\code\\${overrides.id}`, services: [], ...overrides };
}
