/**
 * The English UI string set: the default UI Language. It defines `UiStrings`, which the Russian set
 * in `strings.ts` must match, so a key missing from either fails to compile. Components never read a
 * set directly; they read `STRINGS` from `ui-strings.ts`. Plain language for a non-programmer,
 * with the glossary's English terms (Repo, Service, Session, Workspace, Orphan, Repo Config).
 */
import type {
  Orphan,
  PortConflict,
  PortOwner,
  PortOwnerKind,
  ServiceSetStartReportEntry,
  ServiceStatus,
  SessionKind,
} from '@devpanel/shared';
import type { AllErrorParams, UiErrorCode } from './ui-errors';

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

/** "API in Repo Billing, Web in Repo Shop" (a Service Set start report). */
function serviceList(entries: ServiceSetStartReportEntry[]): string {
  return entries.map((e) => EN_STRINGS.serviceSets.serviceLabel(e.repoName, e.serviceName)).join(', ');
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
    /** The ⋮⋮ handle that drags a Repo card to another place in the list. */
    dragHandle: 'Drag to reorder',
    dragHandleLabel: (repoName: string) => `Move Repo ${repoName}`,
    /** The ▾/▸ button before the Repo name. */
    collapse: (repoName: string) => `Collapse ${repoName}`,
    expand: (repoName: string) => `Expand ${repoName}`,
    collapseAll: 'Collapse all',
    expandAll: 'Expand all',
    /** Tooltip of a status dot of a collapsed Repo, e.g. "api: Running". */
    dotTitle: (serviceName: string, status: string) => `${serviceName}: ${status}`,
    /** Tooltip of the status dot of a Service with a Build Error, in place of its Status. */
    buildError: 'The build has errors, see the terminal',
    /** Lines of the ❗ tooltip of a collapsed Repo that needs attention. */
    attention: {
      folderMissing: 'The folder was not found',
      configError: 'The config has an error',
      crashed: (serviceName: string) => `${serviceName} crashed`,
      unhealthy: (serviceName: string) => `${serviceName} is not responding`,
      portConflict: (serviceName: string, port: number) => `${serviceName}: port ${port} is busy`,
      buildError: (serviceName: string) => `${serviceName}: the build has errors`,
    },
  },

  sessions: {
    /** Tab label of a Session, e.g. "Claude Code", "Terminal 2". */
    label: (kind: SessionKind, number: number) =>
      `${kind === 'claude' ? 'Claude Code' : 'Terminal'}${number > 1 ? ` ${number}` : ''}`,
    finishedMark: '(ended)',
    finished: (exitCode: number | undefined) =>
      exitCode === undefined || exitCode === 0 ? 'The Session has ended.' : `The Session has ended (code ${exitCode}).`,
    confirmClose: (label: string) => `The "${label}" Session is still running. Close the tab and end the Session?`,
    /** The same question shown inside the tab, where space is short. */
    confirmCloseShort: (label: string) => `End ${label}?`,
    confirmYes: 'End Session',
    confirmNo: 'Cancel',
  },

  config: {
    suggestionsIntro: 'This Repo has no Repo Config (the .devpanel.yml file the developers write). Tick what to run:',
    /** Checkbox label of a suggested Service. */
    suggestion: (name: string, command: string) => `${name} — ${command}`,
    save: 'Save as Local Config',
    nothingDetected:
      'Found nothing to run: this Repo has no suitable scripts. Ask a developer to add a Repo Config (.devpanel.yml).',
    unusedLocalConfig:
      'The developers added a Repo Config to this Repo, and DevPanel now uses it. Your Local Config is no longer used.',
    deleteLocalConfig: 'Delete Local Config',
    serviceConfigChanged: 'Its config changed — restart it',
    serviceRemoved: 'Removed from the config — will disappear once stopped',
    /** Shown instead of `errors.configInvalid` when the Repo keeps its last valid Services. */
    invalidKeepsPrevious: (repoName: string) =>
      `The Repo Config of the ${repoName} Repo has a mistake, so its previous version stays in use for now. Show the details to a developer.`,
  },

  /** "+ Add Service" and "Remove" for Repos without a Repo Config (they edit the Local Config). */
  editConfig: {
    add: 'Add Service',
    formTitle: 'New Service (saved only on this computer)',
    pickLabel: 'Detected script',
    pickOwn: 'My own command',
    nameLabel: 'Name',
    commandLabel: 'Command',
    more: 'More',
    portLabel: 'Port',
    urlLabel: 'Address for the browser',
    readyPatternLabel: 'Ready when the output contains',
    dependsOnLabel: 'Start these first:',
    submit: 'Add',
    cancel: 'Cancel',
    remove: 'Remove',
    /** Accessible name of the Service remove button, e.g. "Remove API". */
    removeService: (serviceName: string) => `Remove ${serviceName}`,
    removeQuestion: (serviceName: string) => `Remove the ${serviceName} Service?`,
    removeRunning: 'The Service is running — stop and remove it?',
    removeDependents: (names: string[]) => `These Services will no longer wait for it: ${names.join(', ')}.`,
    removeConfirm: 'Remove',
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
    stopAllRepos: 'Stop everything in all Repos',
  },

  /** Service Sets: the header menu and the Service Set dialog. */
  serviceSets: {
    menu: 'Service Sets',
    none: 'No Service Sets yet.',
    create: 'New Service Set…',
    newTitle: 'New Service Set',
    nameLabel: 'Name',
    servicesLabel: 'Services',
    noServices: 'No Repo has Services yet.',
    /** Accessible name of a Service checkbox, e.g. "API in Repo Billing". */
    serviceLabel: (repoName: string, serviceName: string) => `${serviceName} in Repo ${repoName}`,
    /** Entries of the Set whose Service is gone from its config, or whose Repo is gone. */
    notFoundTitle: 'Not found',
    notFoundHint:
      "These Services were removed from their Repo's config, or their Repo from DevPanel. Starting the Set skips them. Uncheck them to remove them from the Set.",
    /** Accessible name of a not-found entry's checkbox, e.g. "DB in Repo Old, not found". */
    notFoundLabel: (repoName: string, serviceName: string) => `${serviceName} in Repo ${repoName}, not found`,
    save: 'Save',
    cancel: 'Cancel',
    /** Accessible name of the edit action next to a Set in the menu. */
    edit: (name: string) => `Edit ${name}`,
    editTitle: 'Edit Service Set',
    delete: 'Delete',
    deleteConfirm: (name: string) => `Delete the Service Set "${name}"? This cannot be undone.`,
    deleteYes: 'Yes, delete',
    deleteNo: 'Keep it',
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

  /** The gear button in the header and the Settings panel it opens. */
  settings: {
    label: 'Settings',
  },

  /** The UI Language switch in Settings; each language is named in its own language. */
  uiLanguage: {
    label: 'Language',
    // eslint-disable-next-line no-restricted-syntax -- each language is named in its own language
    names: { en: 'English', ru: 'Русский' },
  },

  /** The Theme switch in Settings (per browser). */
  theme: {
    label: 'Theme',
    names: { system: 'System theme', light: 'Light theme', dark: 'Dark theme' },
  },

  /** The Settings checkbox that opens a Service's terminal tab when it starts (per browser). */
  openTabOnStart: {
    label: 'Open the terminal tab when a Service starts',
    hint: 'However the Service is started. The tab you are looking at stays on screen.',
  },

  closeWithoutAsking: {
    label: "Close a running Session's tab without asking",
    hint: 'The Session ends at once, without a confirmation.',
  },

  /** Processes left over from a previous run (after a crash or a forced shutdown). */
  orphans: {
    title: 'Some processes from the previous DevPanel run are still running:',
    hint: 'It is usually best to end them: they may hold ports and stop Services from starting.',
    kill: 'End these processes',
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
    dismiss: 'Dismiss',
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
      `The Repo Config of the ${p.repoName} Repo has a mistake, so its Services are not shown. Show the details to a developer.`,
    localConfigInvalid: (p) =>
      `The Local Config of the ${p.repoName} Repo has a mistake, so its Services cannot be changed. Show the details to a developer.`,
    repoConfigInUse: (p) =>
      `The Services of the ${p.repoName} Repo come from its Repo Config, which the developers write. Ask a developer to change them.`,
    serviceInvalid: (p) => {
      switch (p.problem) {
        case 'required':
          return p.field === 'name' ? 'Enter a name.' : 'Enter a command.';
        case 'nameTaken':
          return 'A Service with this name already exists. Choose another name.';
        case 'portUsed':
          return `Port ${p.port} is already used by the ${p.serviceName} Service. Choose another port.`;
        case 'invalid':
          switch (p.field) {
            case 'port':
              return 'Enter a port number from 1 to 65535.';
            case 'url':
              return 'Enter a full address, for example http://localhost:3000.';
            case 'readyPattern':
              return 'DevPanel cannot use this text as a pattern. Leave it empty or ask a developer.';
            case 'dependsOn':
              return 'One of the chosen Services no longer exists. Reload the page.';
            case undefined:
              return 'The Service was not added. Show the details to a developer.';
            default:
              return 'DevPanel does not accept this value. Change it and try again.';
          }
      }
    },
    repoAlreadyAdded: (p) => `This folder is already added as the ${p.repoName} Repo.`,
    repoNameTaken: (p) => `A Repo named "${p.name}" already exists. Choose another name.`,
    folderNotFound: (p) =>
      `Folder ${p.path} not found. Check that it exists and its drive is connected, then try again.`,
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
    shellFailed: () => 'Could not open the window. Try again.',
    uiLanguageNotSaved: () => 'Could not save the language choice, so DevPanel stays in the current language. Try again.',
    serviceSetNameEmpty: () => 'Enter a name for the Service Set.',
    serviceSetNameTaken: (p) => `A Service Set named "${p.name}" already exists. Choose another name.`,
    serviceSetEmpty: () => 'Check at least one Service.',
    serviceSetNotFound: () => 'This Service Set no longer exists. It may have been deleted in another window.',
    badCommand: () => 'DevPanel did not understand the command. Reload the page.',
    internal: () =>
      'Something went wrong inside DevPanel. Try again; if it happens again, open "Details" and show the text to a developer.',
    connectionLost: () => 'Lost connection to DevPanel, so the command was not carried out. Try again in a few seconds.',
    serviceSetStartIncomplete: (p) =>
      `The Service Set "${p.name}" did not start completely.` +
      (p.notRunning.length
        ? ` Not running: ${serviceList(p.notRunning)}. The list of Services shows why; a taken port offers its choice there.`
        : '') +
      (p.notFound.length
        ? ` Not found: ${serviceList(p.notFound)}. They were removed from their Repo's config, or their Repo from DevPanel.`
        : ''),
    uiLanguageNotFollowed: () =>
      "DevPanel's language was changed, but this tab cannot switch to it: the browser does not let websites save data. " +
      'Allow websites to save data in the browser settings, then reload the page.',
  } satisfies { [C in UiErrorCode]: (params: AllErrorParams[C]) => string },
};

/** The shape of a UI string set; the English set defines it. */
export type UiStrings = typeof EN_STRINGS;
