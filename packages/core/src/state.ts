/** In-memory state of Repos and their Services, shared by `core` and its helper modules. */
import type { FSWatcher } from 'node:fs';
import type {
  ConfigSource,
  ExitDetails,
  InstallResult,
  PortConflict,
  ServiceStatus,
  SuggestedService,
} from '@devpanel/shared';
import type { ServiceDefinition } from './config.js';
import type { ServiceProcess } from './process.js';
import type { ReadinessWatch } from './readiness.js';
import { Terminal } from './terminal.js';

/** One `startService` call until the Service is spawned; stopping the Service aborts it. */
export interface Launch {
  abort: AbortController;
  done: Promise<void>;
}

/** A running or finished `pnpm install` of one Repo. */
export interface InstallRun {
  /** Set while the install runs. */
  process?: ServiceProcess;
  /** Resolves when the install has finished. */
  done: Promise<InstallResult>;
  /** Exit code of the finished install. */
  exitCode?: number;
}

/** A Service; its output survives restarts (a separator is appended instead of clearing). */
export class ServiceState extends Terminal {
  status: ServiceStatus = 'stopped';
  stopping?: Promise<void>;
  /** Readiness checks of the current run; present only while `starting` or `unhealthy`. */
  readiness?: ReadinessWatch;
  /** How the Service ended by itself; present only while `crashed` or `exited`. */
  lastExit?: ExitDetails;
  /** A start in progress that is still waiting for dependencies (or the pnpm check) before spawning. */
  launch?: Launch;
  /** Ids of the dependencies a start in progress still waits for. */
  waitingFor?: string[];
  /** New definition from a config change while running; applied once the Service exits. */
  pending?: ServiceDefinition;
  /** Gone from the config while running; dropped once the Service exits. */
  removed?: boolean;
  /** Its port is held by someone else (a blocked start, or still taken after a Stop). */
  portConflict?: PortConflict;
  /** PID file run id of the current process (see `ProcessRecorder`). */
  runId?: string;

  constructor(public definition: ServiceDefinition) {
    super();
  }

  get name(): string {
    return this.definition.name ?? this.definition.id;
  }
}

export interface RepoState {
  id: string;
  name: string;
  path: string;
  color?: string;
  configError?: string;
  /** The last `installDependencies` run, if any. */
  install?: InstallRun;
  configSource: ConfigSource;
  suggestions?: SuggestedService[];
  unusedLocalConfig: boolean;
  folderMissing: boolean;
  branch?: string;
  services: Map<string, ServiceState>;
  /** Watches the Repo folder for config file changes. */
  watcher?: FSWatcher;
  reloadTimer?: NodeJS.Timeout;
  /** Serializes config reloads of this Repo. */
  reloading: Promise<void>;
}
