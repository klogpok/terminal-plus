/**
 * Every user-facing UI string lives here (Russian now; English later goes in a sibling file with the
 * same shape). Components read `STRINGS` only; never put user-facing text in templates or code.
 *
 * Error messages are keyed by `ErrorCode` (packages/shared/src/errors.ts) plus client-side codes;
 * a new code fails to compile until its message is added here.
 */
import type { ErrorParams, Orphan, PortConflict, PortOwner, PortOwnerKind, ServiceStatus, SessionKind } from '@devpanel/shared';

/** Errors raised in the browser itself (not by the Server). */
export interface ClientErrorParams {
  /** The connection to the Server dropped while a command was in flight, or was never open. */
  connectionLost: Record<string, never>;
}

export type UiErrorCode = keyof ErrorParams | keyof ClientErrorParams;
type AllErrorParams = ErrorParams & ClientErrorParams;

/** An error from the Server (`ErrorInfo`) or from the client. */
export type UiErrorInfo = {
  [C in UiErrorCode]: { code: C; params: AllErrorParams[C]; details: string };
}[UiErrorCode];

/**
 * Who holds a port, in the instrumental case: "сервисом API из репо Billing" / "процессом node.exe
 * (PID 1234)". A new `PortOwner` kind fails to compile until it gets a case here.
 */
export function describePortOwner(owner: PortOwner): string {
  switch (owner.kind) {
    case 'service':
      return `сервисом ${owner.serviceName} из репо ${owner.repoName}`;
    case 'process':
      return `процессом ${owner.processName} (PID ${owner.pid})`;
    case 'orphan': {
      const { owner: what, repoName } = owner.orphan;
      return what.kind === 'service'
        ? `сервисом ${what.serviceName} из репо ${repoName}, который остался с прошлого запуска`
        : `сессией ${sessionKindName(what.sessionKind)} из репо ${repoName}, которая осталась с прошлого запуска`;
    }
  }
}

function sessionKindName(kind: SessionKind): string {
  return kind === 'claude' ? 'Claude Code' : 'терминала';
}

/** One Orphan in plain words: "Сервис API из репо Billing остался с прошлого запуска". */
export function describeOrphan({ owner, repoName }: Orphan): string {
  if (owner.kind === 'service') return `Сервис ${owner.serviceName} из репо ${repoName} остался с прошлого запуска`;
  return owner.sessionKind === 'claude'
    ? `Сессия Claude Code из репо ${repoName} осталась с прошлого запуска`
    : `Терминал из репо ${repoName} остался с прошлого запуска`;
}

/** What happened to a dependency that did not become running (ends the `dependencyFailed` message). */
const DEPENDENCY_OUTCOME: Record<ServiceStatus, string> = {
  crashed: 'упал',
  exited: 'завершился сам',
  unhealthy: 'запустился, но не отвечает',
  stopped: 'был остановлен',
  stopping: 'был остановлен',
  starting: 'ещё не запустился',
  running: 'не запустился',
};

export const STRINGS = {
  appTitle: 'DevPanel',

  connection: {
    connecting: 'Подключаемся к DevPanel…',
    closed: 'Нет связи с DevPanel. Пробуем переподключиться…',
    closedHint: 'Если связь не появляется, запустите DevPanel заново ярлыком на рабочем столе.',
  },

  repos: {
    title: 'Репо',
    empty: 'В Workspace пока нет ни одного Репо.',
    noServices: 'Сервисов нет.',
    add: 'Добавить репо',
    addHint: 'DevPanel откроет окно выбора папки (оно может появиться за браузером).',
    nameTaken: (name: string) => `Репо с именем «${name}» уже есть. Придумайте другое имя:`,
    nameLabel: 'Имя репо',
    addConfirm: 'Добавить',
    cancel: 'Отмена',
    branch: (branch: string) => `ветка ${branch}`,
    branchTitle: 'Текущая git-ветка',
    openFolder: 'Открыть папку',
    remove: 'Удалить',
    /** Accessible name of the Repo remove button, e.g. "Удалить репо Billing". */
    removeRepo: (repoName: string) => `Удалить репо ${repoName}`,
    removeQuestion: (repoName: string) => `Удалить репо ${repoName} из списка?`,
    removeStops: (names: string[]) => `Будут остановлены: ${names.join(', ')}.`,
    removeNothingRuns: 'Ничего не запущено.',
    removeKeepsFolder: 'Папка с кодом останется на диске.',
    folderMissing: 'Папка не найдена',
    folderMissingHint: 'Возможно, её переместили, переименовали или отключили диск.',
    relocate: 'Указать новое расположение',
    /** Accessible name of the per-Service browser button, e.g. "Открыть в браузере API". */
    openInBrowser: (serviceName: string) => `Открыть в браузере ${serviceName}`,
    openInBrowserTitle: 'Открыть в браузере',
    /** Session buttons in the Repo header; accessible names include the Repo name. */
    openClaude: 'Claude Code',
    openClaudeLabel: (repoName: string) => `Открыть Claude Code в ${repoName}`,
    openTerminal: 'Терминал',
    openTerminalLabel: (repoName: string) => `Открыть терминал в ${repoName}`,
  },

  sessions: {
    /** Tab label of a Session, e.g. "Claude Code", "Терминал 2". */
    label: (kind: SessionKind, number: number) =>
      `${kind === 'claude' ? 'Claude Code' : 'Терминал'}${number > 1 ? ` ${number}` : ''}`,
    finishedMark: '(завершена)',
    finished: (exitCode: number | undefined) =>
      exitCode === undefined || exitCode === 0 ? 'Сессия завершена.' : `Сессия завершена (код ${exitCode}).`,
    confirmClose: (label: string) => `Сессия «${label}» ещё работает. Закрыть вкладку и завершить сессию?`,
    confirmYes: 'Завершить',
    confirmNo: 'Отмена',
  },

  config: {
    suggestionsIntro: 'В этом репо нет файла настроек. Отметьте, что запускать:',
    /** Checkbox label of a suggested Service. */
    suggestion: (name: string, command: string) => `${name} — ${command}`,
    save: 'Сохранить конфиг',
    nothingDetected: 'Не нашли, что запускать: в репо нет подходящих скриптов. Попросите разработчика добавить файл .devpanel.yml.',
    unusedLocalConfig: 'Разработчики добавили в репо файл настроек, и DevPanel теперь использует его. Ваш локальный конфиг больше не используется.',
    deleteLocalConfig: 'Удалить локальный конфиг',
    serviceConfigChanged: 'Конфиг изменился — перезапустите',
    serviceRemoved: 'Удалён из конфига — исчезнет после остановки',
    /** Shown instead of `errors.configInvalid` when the Repo keeps its last valid Services. */
    invalidKeepsPrevious: (repoName: string) =>
      `В файле настроек репо ${repoName} ошибка, поэтому пока работают прежние настройки. Покажите подробности разработчику.`,
  },

  /** Label shown next to each status dot (also its tooltip). */
  status: {
    stopped: 'Остановлен',
    starting: 'Запускается',
    running: 'Работает',
    unhealthy: 'Работает, но не отвечает',
    stopping: 'Останавливается',
    crashed: 'Упал',
    exited: 'Завершился сам',
  } satisfies Record<ServiceStatus, string>,

  /** Flag of a (still `stopped`) Service whose start waits for its dependencies. */
  waitingFor: (dependencyNames: string[]) => `ждёт запуска: ${dependencyNames.join(', ')}`,

  actions: {
    start: 'Запустить',
    stop: 'Остановить',
    restart: 'Перезапустить',
    /** Accessible name of a Service button, e.g. "Запустить API". */
    serviceAction: (action: string, serviceName: string) => `${action} ${serviceName}`,
    dismiss: 'Закрыть',
    startAll: 'Запустить всё',
    stopAll: 'Остановить всё',
    /** Accessible name of a Repo header button, e.g. "Запустить всё в репо Billing". */
    repoAction: (action: string, repoName: string) => `${action} в репо ${repoName}`,
    stopAllRepos: 'Остановить всё во всех репо',
  },

  /** "Exit DevPanel": stops every Service and Session, then the Server. */
  exit: {
    button: 'Выйти из DevPanel',
    question: 'Выйти из DevPanel? Все сервисы и сессии будут остановлены.',
    confirmYes: 'Да, выйти',
    confirmNo: 'Отмена',
    stopping: 'Останавливаем все сервисы и сессии…',
    done: 'DevPanel выключен. Эту вкладку можно закрыть. Чтобы начать снова, запустите DevPanel ярлыком на рабочем столе.',
  },

  /** Processes left over from a previous run (after a crash or a forced shutdown). */
  orphans: {
    title: 'После прошлого запуска DevPanel остались работающие процессы:',
    hint: 'Обычно их стоит завершить: они могут занимать порты и мешать запуску.',
    kill: 'Убить',
  },

  error: {
    details: 'Подробнее',
  },

  terminal: {
    /** Accessible name of a Service name in the left panel, e.g. "Открыть терминал API". */
    open: (serviceName: string) => `Открыть терминал ${serviceName}`,
    close: (serviceName: string) => `Закрыть вкладку ${serviceName}`,
    tabsLabel: 'Терминалы',
    empty: 'Нажмите на имя сервиса слева, чтобы открыть его терминал.',
    clear: 'Очистить',
    copyAll: 'Копировать всё',
    copied: 'Скопировано',
    copyFailed: 'Не удалось скопировать',
    search: 'Поиск',
    findNext: 'Найти дальше',
    findPrevious: 'Найти раньше',
    notFound: 'Не найдено',
  },
  /** A Service that ended by itself (`crashed` / `exited`). */
  serviceExit: {
    crashed: (exitCode: number) => `Упал с кодом ${exitCode}`,
    exited: 'Завершился сам',
    lastLines: 'Последние строки вывода:',
    noOutput: 'Сервис ничего не вывел.',
    startAgain: 'Запустить снова',
  },

  /** A Service's port held by someone else (see `PortConflict`). */
  portConflict: {
    taken: (port: number, owner: PortOwner) => `Порт ${port} занят ${describePortOwner(owner)}.`,
    stillTaken: (serviceName: string, port: number, owner: PortOwner) =>
      `Сервис ${serviceName} остановлен, но порт ${port} всё ещё занят ${describePortOwner(owner)}.`,
    /** The one button, by owner kind and by whether the Service starts afterwards. */
    resolve: {
      start: { service: 'Остановить его и запустить наш', process: 'Завершить и запустить наш', orphan: 'Завершить его и запустить наш' },
      stop: { service: 'Остановить его', process: 'Завершить', orphan: 'Завершить его' },
    } satisfies Record<PortConflict['reason'], Record<PortOwnerKind, string>>,
    confirmKill: (processName: string, pid: number) =>
      `Завершить процесс ${processName} (PID ${pid})? Если это другая программа, её несохранённые данные пропадут.`,
    confirmYes: 'Да, завершить',
    confirmNo: 'Отмена',
  },

  install: {
    button: 'Установить зависимости',
    running: 'Устанавливаем…',
    /** Title of the install output tab. */
    title: (repoName: string) => `Установка зависимостей: ${repoName}`,
    status: {
      running: 'Идёт установка, это может занять несколько минут…',
      succeeded: 'Зависимости установлены. Теперь можно запускать сервисы.',
      failed: (exitCode: number) =>
        `Не удалось установить зависимости (код ${exitCode}). Покажите вывод выше разработчику.`,
    },
  },

  /** Plain-Russian messages: what happened (and what to do), without jargon. */
  errors: {
    portTaken: (p) => `Сервис ${p.serviceName} не запущен: порт ${p.port} занят ${describePortOwner(p.owner)}.`,
    portNotFreed: (p) =>
      `Порт ${p.port} так и не освободился, поэтому сервис ${p.serviceName} не запущен. Попробуйте ещё раз.`,
    repoNotFound: () => 'Этого Репо больше нет в списке. Обновите страницу.',
    serviceNotFound: (p) => `В репо ${p.repoName} больше нет сервиса «${p.serviceId}». Обновите страницу.`,
    spawnFailed: (p) => `Не удалось запустить сервис ${p.serviceName} из репо ${p.repoName}.`,
    dependencyFailed: (p) =>
      `Сервис ${p.serviceName} из репо ${p.repoName} не запущен: сначала должен заработать сервис ` +
      `${p.dependencyName}, а он ${DEPENDENCY_OUTCOME[p.dependencyStatus]}.`,
    pnpmMissing: (p) =>
      `Репо ${p.repoName} работает через pnpm, но pnpm на этом компьютере не найден. ` +
      'Выполните в терминале «corepack enable» или установите pnpm, затем перезапустите DevPanel.',
    notPnpmRepo: (p) =>
      `Репо ${p.repoName} не использует pnpm, поэтому DevPanel не устанавливает его зависимости. Обратитесь к разработчику.`,
    configInvalid: (p) =>
      `В файле настроек репо ${p.repoName} ошибка, поэтому его сервисы не показаны. Покажите подробности разработчику.`,
    repoAlreadyAdded: (p) => `Эта папка уже добавлена как репо ${p.repoName}.`,
    repoNameTaken: (p) => `Репо с именем «${p.name}» уже есть. Выберите другое имя.`,
    folderNotFound: (p) => `Папка ${p.path} не найдена.`,
    repoFolderMissing: (p) => `Папка репо ${p.repoName} не найдена. Укажите её новое расположение или удалите репо.`,
    repoBusy: (p) =>
      `В репо ${p.repoName} сейчас работают сервисы или сессии. Остановите сервисы, закройте сессии и попробуйте снова.`,
    claudeMissing: () =>
      'Claude Code не установлен на этом компьютере (или DevPanel его не видит). ' +
      'Попросите разработчика установить Claude Code, затем перезапустите DevPanel.',
    sessionNotFound: () => 'Этой сессии больше нет. Обновите страницу.',
    sessionSpawnFailed: (p) => `Не удалось открыть сессию в репо ${p.repoName}.`,
    serviceHasNoUrl: (p) => `У сервиса ${p.serviceName} из репо ${p.repoName} не указан адрес для браузера.`,
    shellFailed: () => 'Не удалось открыть окно Windows. Попробуйте ещё раз.',
    badCommand: () => 'DevPanel не понял команду. Обновите страницу.',
    internal: () => 'Что-то пошло не так внутри DevPanel.',
    connectionLost: () => 'Нет связи с DevPanel, команда не выполнена. Попробуйте ещё раз через пару секунд.',
  } satisfies { [C in UiErrorCode]: (params: AllErrorParams[C]) => string },
};

/** The plain-Russian message for an error. */
export function describeError(error: UiErrorInfo): string {
  const message = STRINGS.errors[error.code] as (params: unknown) => string;
  return message(error.params);
}
