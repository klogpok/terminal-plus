/**
 * The Russian UI string set. Its shape is `UiStrings` (defined by the English set in
 * `strings.en.ts`), so a key missing from either fails to compile. Components never read a set
 * directly; they read `STRINGS` from `ui-strings.ts`.
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
import type { UiStrings } from './strings.en';
import type { AllErrorParams, UiErrorCode } from './ui-errors';

/**
 * Who holds a port, in the instrumental case: "сервисом API из репо Billing" / "процессом node.exe
 * (PID 1234)". A new `PortOwner` kind fails to compile until it gets a case here.
 */
function describePortOwner(owner: PortOwner): string {
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

/** "API в репо Billing, Web в репо Shop" (a Service Set start report). */
function serviceList(entries: ServiceSetStartReportEntry[]): string {
  return entries.map((e) => RU_STRINGS.serviceSets.serviceLabel(e.repoName, e.serviceName)).join(', ');
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

export const RU_STRINGS: UiStrings = {
  appTitle: 'DevPanel',
  /** Accessible name of the drag handle between the Repo list and the terminals. */
  resizeLeft: 'Ширина списка репо',

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
    /** The ▾/▸ button before the Repo name. */
    collapse: (repoName: string) => `Свернуть ${repoName}`,
    expand: (repoName: string) => `Развернуть ${repoName}`,
    collapseAll: 'Свернуть все',
    expandAll: 'Развернуть все',
    /** Tooltip of a status dot of a collapsed Repo, e.g. "api: Работает". */
    dotTitle: (serviceName: string, status: string) => `${serviceName}: ${status}`,
    /** Lines of the ❗ tooltip of a collapsed Repo that needs attention. */
    attention: {
      folderMissing: 'Папка не найдена',
      configError: 'В конфиге ошибка',
      crashed: (serviceName: string) => `${serviceName} упал`,
      unhealthy: (serviceName: string) => `${serviceName} не отвечает`,
      portConflict: (serviceName: string, port: number) => `${serviceName}: порт ${port} занят`,
    },
    dragHandle: 'Перетащите, чтобы изменить порядок',
    dragHandleLabel: (repoName: string) => `Переместить репо ${repoName}`,
  },

  sessions: {
    /** Tab label of a Session, e.g. "Claude Code", "Терминал 2". */
    label: (kind: SessionKind, number: number) =>
      `${kind === 'claude' ? 'Claude Code' : 'Терминал'}${number > 1 ? ` ${number}` : ''}`,
    finishedMark: '(завершена)',
    finished: (exitCode: number | undefined) =>
      exitCode === undefined || exitCode === 0 ? 'Сессия завершена.' : `Сессия завершена (код ${exitCode}).`,
    confirmClose: (label: string) => `Сессия «${label}» ещё работает. Закрыть вкладку и завершить сессию?`,
    /** The same question shown inside the tab, where space is short. */
    confirmCloseShort: (label: string) => `Завершить «${label}»?`,
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

  /** "+ Add Service" and "Remove" for Repos without a Repo Config (they edit the Local Config). */
  editConfig: {
    add: 'Добавить сервис',
    formTitle: 'Новый сервис (сохраняется только на этом компьютере)',
    pickLabel: 'Найденный скрипт',
    pickOwn: 'Своя команда',
    nameLabel: 'Имя',
    commandLabel: 'Команда',
    more: 'Дополнительно',
    portLabel: 'Порт',
    urlLabel: 'Адрес для браузера',
    readyPatternLabel: 'Готов, когда в выводе появится',
    dependsOnLabel: 'Сначала запустить:',
    submit: 'Добавить',
    cancel: 'Отмена',
    remove: 'Убрать',
    /** Accessible name of the Service remove button, e.g. "Remove API". */
    removeService: (serviceName: string) => `Убрать ${serviceName}`,
    removeQuestion: (serviceName: string) => `Убрать сервис ${serviceName}?`,
    removeRunning: 'Сервис работает — остановить и убрать?',
    removeDependents: (names: string[]) => `Эти сервисы больше не будут его ждать: ${names.join(', ')}.`,
    removeConfirm: 'Убрать',
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

  /** Service Sets: the header menu and the Service Set dialog. */
  serviceSets: {
    menu: 'Наборы',
    none: 'Наборов пока нет.',
    create: 'Новый набор…',
    newTitle: 'Новый набор',
    nameLabel: 'Имя',
    servicesLabel: 'Сервисы',
    noServices: 'Ни в одном репо пока нет сервисов.',
    /** Accessible name of a Service checkbox, e.g. "API в репо Billing". */
    serviceLabel: (repoName: string, serviceName: string) => `${serviceName} в репо ${repoName}`,
    /** Entries of the Set whose Service is gone from its config, or whose Repo is gone. */
    notFoundTitle: 'Не найдены',
    notFoundHint:
      'Эти сервисы убрали из конфига их репо или убрали сам репо из DevPanel. При запуске набора они пропускаются. Снимите галочку, чтобы убрать их из набора.',
    /** Accessible name of a not-found entry's checkbox, e.g. "DB в репо Old, не найден". */
    notFoundLabel: (repoName: string, serviceName: string) => `${serviceName} в репо ${repoName}, не найден`,
    save: 'Сохранить',
    cancel: 'Отмена',
    /** Accessible name of the edit action next to a Set in the menu. */
    edit: (name: string) => `Изменить «${name}»`,
    editTitle: 'Изменить набор',
    delete: 'Удалить',
    deleteConfirm: (name: string) => `Удалить набор «${name}»? Это нельзя отменить.`,
    deleteYes: 'Да, удалить',
    deleteNo: 'Оставить',
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

  /** The gear button in the header and the Settings panel it opens. */
  settings: {
    label: 'Настройки',
  },

  /** The UI Language switch in Settings; each language is named in its own language. */
  uiLanguage: {
    label: 'Язык',
    names: { en: 'English', ru: 'Русский' },
  },

  /** The Theme switch in Settings (per browser). */
  theme: {
    label: 'Тема',
    names: { system: 'Как в системе', light: 'Светлая тема', dark: 'Тёмная тема' },
  },

  /** The Settings checkbox that opens a Service's terminal tab when it starts (per browser). */
  openTabOnStart: {
    label: 'Открывать вкладку терминала при запуске Сервиса',
    hint: 'Как бы Сервис ни запустили. Вкладка, на которую вы смотрите, остаётся на экране.',
  },

  /** Processes left over from a previous run (after a crash or a forced shutdown). */
  orphans: {
    title: 'После прошлого запуска DevPanel остались работающие процессы:',
    hint: 'Обычно их стоит завершить: они могут занимать порты и мешать запуску.',
    kill: 'Убить',
    /** One Orphan in plain words: "Сервис API из репо Billing остался с прошлого запуска". */
    describe: ({ owner, repoName }: Orphan) => {
      if (owner.kind === 'service') return `Сервис ${owner.serviceName} из репо ${repoName} остался с прошлого запуска`;
      return owner.sessionKind === 'claude'
        ? `Сессия Claude Code из репо ${repoName} осталась с прошлого запуска`
        : `Терминал из репо ${repoName} остался с прошлого запуска`;
    },
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
    dismiss: 'Скрыть',
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
    localConfigInvalid: (p) =>
      `В локальном конфиге репо ${p.repoName} ошибка, поэтому его сервисы нельзя изменить. Покажите подробности разработчику.`,
    repoConfigInUse: (p) =>
      `Сервисы репо ${p.repoName} описаны в его файле настроек, который пишут разработчики. Попросите разработчика их изменить.`,
    serviceInvalid: (p) => {
      switch (p.problem) {
        case 'required':
          return p.field === 'name' ? 'Введите имя.' : 'Введите команду.';
        case 'nameTaken':
          return 'Сервис с таким именем уже есть. Выберите другое имя.';
        case 'portUsed':
          return `Порт ${p.port} уже занят сервисом ${p.serviceName}. Выберите другой порт.`;
        case 'invalid':
          switch (p.field) {
            case 'port':
              return 'Введите номер порта от 1 до 65535.';
            case 'url':
              return 'Введите полный адрес, например http://localhost:3000.';
            case 'readyPattern':
              return 'DevPanel не может использовать этот текст как шаблон. Оставьте поле пустым или спросите разработчика.';
            case 'dependsOn':
              return 'Одного из выбранных сервисов уже нет. Обновите страницу.';
            case undefined:
              return 'Сервис не добавлен. Покажите подробности разработчику.';
            default:
              return 'DevPanel не принимает это значение. Измените его и попробуйте снова.';
          }
      }
    },
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
    uiLanguageNotSaved: () => 'Не удалось сохранить выбор языка, поэтому DevPanel остаётся на текущем языке. Попробуйте ещё раз.',
    serviceSetNameEmpty: () => 'Введите имя набора.',
    serviceSetNameTaken: (p) => `Набор с именем «${p.name}» уже есть. Выберите другое имя.`,
    serviceSetEmpty: () => 'Отметьте хотя бы один сервис.',
    serviceSetNotFound: () => 'Этого набора больше нет. Возможно, его удалили в другом окне.',
    badCommand: () => 'DevPanel не понял команду. Обновите страницу.',
    internal: () => 'Что-то пошло не так внутри DevPanel.',
    connectionLost: () => 'Нет связи с DevPanel, команда не выполнена. Попробуйте ещё раз через пару секунд.',
    serviceSetStartIncomplete: (p) =>
      `Набор «${p.name}» запустился не полностью.` +
      (p.notRunning.length
        ? ` Не работают: ${serviceList(p.notRunning)}. Причина видна в списке сервисов; там же выбор, если порт занят.`
        : '') +
      (p.notFound.length
        ? ` Не найдены: ${serviceList(p.notFound)}. Их убрали из конфига репо или убрали сам репо из DevPanel.`
        : ''),
    uiLanguageNotFollowed: () =>
      'Язык DevPanel изменился, но эта вкладка не может на него переключиться: браузер не даёт сайтам сохранять данные. ' +
      'Разрешите сохранение данных сайтов в настройках браузера и обновите страницу.',
  } satisfies { [C in UiErrorCode]: (params: AllErrorParams[C]) => string },
};
