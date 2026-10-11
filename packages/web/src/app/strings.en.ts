/**
 * The English UI string set: the default UI Language. Its shape is `UiStrings`, which the Russian set
 * in `strings.ts` must match, so a key missing from either fails to compile. Plain language for a
 * non-programmer, with the glossary's English terms (Repo, Service, Session, Workspace, Orphan).
 */
import type { Orphan, PortConflict, PortOwner, PortOwnerKind, ServiceStatus, SessionKind } from '@devpanel/shared';
import type { AllErrorParams, UiErrorCode } from './strings';

/**
 * Who holds a port: "the API Service in the Billing Repo" / "the process node.exe (PID 1234)".
 * A new `PortOwner` kind fails to compile until it gets a case here.
 */
function describePortOwner(owner: PortOwner): string {
  switch (owner.kind) {
    case 'service':
      return `the ${owner.serviceName} Service in the ${owner.repoName} Repo`;
    case 'process':
      return `the process ${owner.processName} (PID ${owner.pid})`;
    case 'orphan': {
      const { owner: what, repoName } = owner.orphan;
      return what.kind === 'service'
        ? `the ${what.serviceName} Service in the ${repoName} Repo, left over from the previous run`
        : `a ${sessionKindName(what.sessionKind)} Session in the ${repoName} Repo, left over from the previous run`;
    }
  }
}

function sessionKindName(kind: SessionKind): string {
  return kind === 'claude' ? 'Claude Code' : 'terminal';
}

/** What happened to a dependency that did not become running (ends the `dependencyFailed` message). */
const DEPENDENCY_OUTCOME: Record<ServiceStatus, string> = {
  crashed: 'it crashed',
  exited: 'it stopped by itself',
  unhealthy: 'it started but does not respond',
  stopped: 'it was stopped',
  stopping: 'it was stopped',
  starting: 'it has not started yet',
  running: 'it did not start',
};

export const EN_STRINGS = {
  appTitle: 'DevPanel',
  /** Accessible name of the drag handle between the Repo list and the terminals. */
  resizeLeft: 'Width of the Repo list',

  connection: {
    connecting: 'Connecting to DevPanel…',
    closed: 'Lost connection to DevPanel. Trying to reconnect…',
    closedHint: 'If the connection does not come back, start DevPanel again with the desktop shortcut.',
  },

  repos: {
    title: 'Repos',
    empty: 'There are no Repos in the Workspace yet.',
    noServices: 'No Services.',
    add: 'Add Repo',
    addHint: 'DevPanel will open a folder picker (it may appear behind the browser).',
    nameTaken: (name: string) => `A Repo named "${name}" already exists. Choose another name:`,
    nameLabel: 'Repo name',
    addConfirm: 'Add',
    cancel: 'Cancel',
    branch: (branch: string) => `branch ${branch}`,
    branchTitle: 'Current git branch',
    openFolder: 'Open folder',
    remove: 'Remove',
    /** Accessible name of the Repo remove button, e.g. "Remove Repo Billing". */
    removeRepo: (repoName: string) => `Remove Repo ${repoName}`,
    removeQuestion: (repoName: string) => `Remove the ${repoName} Repo from the list?`,
    removeStops: (names: string[]) => `These will be stopped: ${names.join(', ')}.`,
    removeNothingRuns: 'Nothing is running.',
    removeKeepsFolder: 'The code folder stays on the disk.',
    folderMissing: 'Folder not found',
    folderMissingHint: 'It may have been moved or renamed, or its drive is disconnected.',
    relocate: 'Choose the new location',
    /** Accessible name of the per-Service browser button, e.g. "Open API in the browser". */
    openInBrowser: (serviceName: string) => `Open ${serviceName} in the browser`,
    openInBrowserTitle: 'Open in the browser',
    /** Session buttons in the Repo header; accessible names include the Repo name. */
    openClaude: 'Claude Code',
    openClaudeLabel: (repoName: string) => `Open Claude Code in ${repoName}`,
    openTerminal: 'Terminal',
    openTerminalLabel: (repoName: string) => `Open a terminal in ${repoName}`,
  },

  sessions: {
    /** Tab label of a Session, e.g. "Claude Code", "Terminal 2". */
    label: (kind: SessionKind, number: number) =>
      `${kind === 'claude' ? 'Claude Code' : 'Terminal'}${number > 1 ? ` ${number}` : ''}`,
    finishedMark: '(ended)',
    finished: (exitCode: number | undefined) =>
      exitCode === undefined || exitCode === 0 ? 'The Session has ended.' : `The Session has ended (code ${exitCode}).`,
    confirmClose: (label: string) => `The "${label}" Session is still running. Close the tab and end the Session?`,
    confirmYes: 'End Session',
    confirmNo: 'Cancel',
  },

  config: {
    suggestionsIntro: 'This Repo has no settings file. Tick what to run:',
    /** Checkbox label of a suggested Service. */
    suggestion: (name: string, command: string) => `${name} — ${command}`,
    save: 'Save settings',
    nothingDetected:
      'Found nothing to run: this Repo has no suitable scripts. Ask a developer to add a .devpanel.yml file.',
    unusedLocalConfig:
      'The developers added a settings file to this Repo, and DevPanel now uses it. Your Local Config is no longer used.',
    deleteLocalConfig: 'Delete Local Config',
    serviceConfigChanged: 'Settings changed — restart it',
    serviceRemoved: 'Removed from the settings — will disappear once stopped',
    /** Shown instead of `errors.configInvalid` when the Repo keeps its last valid Services. */
    invalidKeepsPrevious: (repoName: string) =>
      `The settings file of the ${repoName} Repo has a mistake, so the previous settings stay in use for now. Show the details to a developer.`,
  },

  /** Label shown next to each status dot (also its tooltip). */
  status: {
    stopped: 'Stopped',
    starting: 'Starting',
    running: 'Running',
    unhealthy: 'Running, but not responding',
    stopping: 'Stopping',
    crashed: 'Crashed',
    exited: 'Stopped by itself',
  } satisfies Record<ServiceStatus, string>,

  /** Flag of a (still `stopped`) Service whose start waits for its dependencies. */
  waitingFor: (dependencyNames: string[]) => `waiting for: ${dependencyNames.join(', ')}`,

  actions: {
    start: 'Start',
    stop: 'Stop',
    restart: 'Restart',
    /** Accessible name of a Service button, e.g. "Start API". */
    serviceAction: (action: string, serviceName: string) => `${action} ${serviceName}`,
    dismiss: 'Close',
    startAll: 'Start all',
    stopAll: 'Stop all',
    /** Accessible name of a Repo header button, e.g. "Start all in Repo Billing". */
    repoAction: (action: string, repoName: string) => `${action} in Repo ${repoName}`,
    stopAllRepos: 'Stop all in all Repos',
  },

  /** "Exit DevPanel": stops every Service and Session, then the Server. */
  exit: {
    button: 'Exit DevPanel',
    question: 'Exit DevPanel? All Services and Sessions will be stopped.',
    confirmYes: 'Yes, exit',
    confirmNo: 'Cancel',
    stopping: 'Stopping all Services and Sessions…',
    done: 'DevPanel is off. You can close this tab. To start again, use the DevPanel desktop shortcut.',
  },

  /** Processes left over from a previous run (after a crash or a forced shutdown). */
  orphans: {
    title: 'Some processes from the previous DevPanel run are still running:',
    hint: 'It is usually best to end them: they may hold ports and stop Services from starting.',
    kill: 'End',
    /** One Orphan in plain words: "The API Service in the Billing Repo is left over from the previous run". */
    describe: ({ owner, repoName }: Orphan) => {
      if (owner.kind === 'service') {
        return `The ${owner.serviceName} Service in the ${repoName} Repo is left over from the previous run`;
      }
      return owner.sessionKind === 'claude'
        ? `A Claude Code Session in the ${repoName} Repo is left over from the previous run`
        : `A terminal in the ${repoName} Repo is left over from the previous run`;
    },
  },

  error: {
    details: 'Details',
  },

  terminal: {
    /** Accessible name of a Service name in the left panel, e.g. "Open the API terminal". */
    open: (serviceName: string) => `Open the ${serviceName} terminal`,
    close: (serviceName: string) => `Close the ${serviceName} tab`,
    tabsLabel: 'Terminals',
    empty: 'Click a Service name on the left to open its terminal.',
    clear: 'Clear',
    copyAll: 'Copy all',
    copied: 'Copied',
    copyFailed: 'Could not copy',
    search: 'Search',
    findNext: 'Find next',
    findPrevious: 'Find previous',
    notFound: 'Not found',
  },
  /** A Service that ended by itself (`crashed` / `exited`). */
  serviceExit: {
    crashed: (exitCode: number) => `Crashed with code ${exitCode}`,
    exited: 'Stopped by itself',
    lastLines: 'Last lines of output:',
    noOutput: 'The Service printed nothing.',
    startAgain: 'Start again',
  },

  /** A Service's port held by someone else (see `PortConflict`). */
  portConflict: {
    taken: (port: number, owner: PortOwner) => `Port ${port} is taken by ${describePortOwner(owner)}.`,
    stillTaken: (serviceName: string, port: number, owner: PortOwner) =>
      `The ${serviceName} Service is stopped, but port ${port} is still taken by ${describePortOwner(owner)}.`,
    /** The one button, by owner kind and by whether the Service starts afterwards. */
    resolve: {
      start: { service: 'Stop it and start ours', process: 'End it and start ours', orphan: 'End it and start ours' },
      stop: { service: 'Stop it', process: 'End it', orphan: 'End it' },
    } satisfies Record<PortConflict['reason'], Record<PortOwnerKind, string>>,
    confirmKill: (processName: string, pid: number) =>
      `End the process ${processName} (PID ${pid})? If it is another program, its unsaved data will be lost.`,
    confirmYes: 'Yes, end it',
    confirmNo: 'Cancel',
  },

  install: {
    button: 'Install dependencies',
    running: 'Installing…',
    /** Title of the install output tab. */
    title: (repoName: string) => `Installing dependencies: ${repoName}`,
    status: {
      running: 'Installing, this may take a few minutes…',
      succeeded: 'Dependencies are installed. You can start the Services now.',
      failed: (exitCode: number) =>
        `Could not install dependencies (code ${exitCode}). Show the output above to a developer.`,
    },
  },

  /** Plain-language messages: what happened (and what to do), without jargon. */
  errors: {
    portTaken: (p) =>
      `The ${p.serviceName} Service did not start: port ${p.port} is taken by ${describePortOwner(p.owner)}.`,
    portNotFreed: (p) =>
      `Port ${p.port} never became free, so the ${p.serviceName} Service did not start. Try again.`,
    repoNotFound: () => 'This Repo is no longer in the list. Reload the page.',
    serviceNotFound: (p) => `The ${p.repoName} Repo no longer has a Service "${p.serviceId}". Reload the page.`,
    spawnFailed: (p) => `Could not start the ${p.serviceName} Service in the ${p.repoName} Repo.`,
    dependencyFailed: (p) =>
      `The ${p.serviceName} Service in the ${p.repoName} Repo did not start: the ${p.dependencyName} Service ` +
      `has to run first, but ${DEPENDENCY_OUTCOME[p.dependencyStatus]}.`,
    pnpmMissing: (p) =>
      `The ${p.repoName} Repo uses pnpm, but pnpm was not found on this computer. ` +
      'Run "corepack enable" in a terminal or install pnpm, then restart DevPanel.',
    notPnpmRepo: (p) =>
      `The ${p.repoName} Repo does not use pnpm, so DevPanel does not install its dependencies. Ask a developer.`,
    configInvalid: (p) =>
      `The settings file of the ${p.repoName} Repo has a mistake, so its Services are not shown. Show the details to a developer.`,
    repoAlreadyAdded: (p) => `This folder is already added as the ${p.repoName} Repo.`,
    repoNameTaken: (p) => `A Repo named "${p.name}" already exists. Choose another name.`,
    folderNotFound: (p) => `Folder ${p.path} not found.`,
    repoFolderMissing: (p) =>
      `The folder of the ${p.repoName} Repo was not found. Choose its new location or remove the Repo.`,
    repoBusy: (p) =>
      `Services or Sessions are running in the ${p.repoName} Repo. Stop the Services, close the Sessions and try again.`,
    claudeMissing: () =>
      'Claude Code is not installed on this computer (or DevPanel cannot see it). ' +
      'Ask a developer to install Claude Code, then restart DevPanel.',
    sessionNotFound: () => 'This Session no longer exists. Reload the page.',
    sessionSpawnFailed: (p) => `Could not open a Session in the ${p.repoName} Repo.`,
    serviceHasNoUrl: (p) => `The ${p.serviceName} Service in the ${p.repoName} Repo has no address for the browser.`,
    shellFailed: () => 'Could not open a Windows window. Try again.',
    badCommand: () => 'DevPanel did not understand the command. Reload the page.',
    internal: () => 'Something went wrong inside DevPanel.',
    connectionLost: () => 'Lost connection to DevPanel, so the command was not carried out. Try again in a few seconds.',
  } satisfies { [C in UiErrorCode]: (params: AllErrorParams[C]) => string },
};
