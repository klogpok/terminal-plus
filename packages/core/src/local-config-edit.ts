/**
 * Adding and removing Services of a Local Config ("+ Add Service" and "Remove" in the UI). Pure: it
 * works on the config object; `DevPanelCore` reads, writes and applies the file.
 */
import { DevPanelError, type ErrorParams, type NewService, type NewServiceField } from '@devpanel/shared';
import { validateConfig, type ConfigIssue, type RepoConfig, type ServiceDefinition } from './config.js';
import { slug } from './detect.js';

type ServiceInvalid = ErrorParams['serviceInvalid'];
type WithoutRepoName<T> = T extends unknown ? Omit<T, 'repoName'> : never;
type Problem = WithoutRepoName<ServiceInvalid>;

const FORM_FIELDS: ReadonlySet<PropertyKey> = new Set<NewServiceField>([
  'name',
  'command',
  'port',
  'url',
  'readyPattern',
  'dependsOn',
]);

function serviceName(service: ServiceDefinition): string {
  return service.name ?? service.id;
}

/** An id from the name, unique among `services`. */
function uniqueId(name: string, services: ServiceDefinition[]): string {
  const base = slug(name) || 'service';
  const ids = new Set(services.map((s) => s.id));
  let id = base;
  for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** The form field a validation issue of the Service at `index` points at, if any. */
function fieldOf(issue: ConfigIssue | undefined, index: number): NewServiceField | undefined {
  const [list, at, field] = issue?.path ?? [];
  return list === 'services' && at === index && FORM_FIELDS.has(field) ? (field as NewServiceField) : undefined;
}

/**
 * The config with `input` appended as a new Service (id generated from its name). Throws
 * `serviceInvalid` naming the form field at fault; the config is never half-changed.
 */
export function withService(config: RepoConfig, input: NewService, repoName: string): RepoConfig {
  const invalid = (problem: Problem, details: string) =>
    new DevPanelError('serviceInvalid', { repoName, ...problem } as ServiceInvalid, details);

  const name = input.name.trim();
  const command = input.command.trim();
  if (!name) throw invalid({ field: 'name', problem: 'required' }, 'The Service name is empty');
  if (!command) throw invalid({ field: 'command', problem: 'required' }, 'The Service command is empty');
  if (config.services.some((s) => serviceName(s).toLowerCase() === name.toLowerCase())) {
    throw invalid({ field: 'name', problem: 'nameTaken', name }, `A Service named "${name}" already exists`);
  }
  const holder = input.port === undefined ? undefined : config.services.find((s) => s.port === input.port);
  if (holder && input.port !== undefined) {
    throw invalid(
      { field: 'port', problem: 'portUsed', port: input.port, serviceName: serviceName(holder) },
      `Port ${input.port} is already used by "${holder.id}"`,
    );
  }

  const url = input.url?.trim();
  const definition: ServiceDefinition = {
    id: uniqueId(name, config.services),
    name,
    command,
    ...(input.port !== undefined && { port: input.port }),
    ...(url && { url }),
    ...(input.readyPattern && { readyPattern: input.readyPattern }),
    ...(input.dependsOn?.length && { dependsOn: input.dependsOn }),
  };
  const index = config.services.length;
  const result = validateConfig({ services: [...config.services, definition] }, 'Local Config');
  if (!result.ok) {
    const field = fieldOf(result.issues?.[0], index);
    throw invalid({ ...(field && { field }), problem: 'invalid' }, result.error);
  }
  return result.config!;
}

/** The config without the Service `id`, which is also dropped from the `dependsOn` of the others. */
export function withoutService(config: RepoConfig, id: string): RepoConfig {
  return {
    services: config.services
      .filter((s) => s.id !== id)
      .map(({ dependsOn, ...service }) => {
        const rest = dependsOn?.filter((dep) => dep !== id);
        return rest?.length ? { ...service, dependsOn: rest } : service;
      }),
  };
}
