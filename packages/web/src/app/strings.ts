/**
 * Every user-facing UI string lives here (Russian now; English later goes in a sibling file with the
 * same shape). Components read `STRINGS` only; never put user-facing text in templates or code.
 *
 * Error messages are keyed by `ErrorCode` (packages/shared/src/errors.ts) plus client-side codes;
 * a new code fails to compile until its message is added here.
 */
import type { ErrorParams, ServiceStatus } from '@devpanel/shared';

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

  actions: {
    start: 'Запустить',
    stop: 'Остановить',
    restart: 'Перезапустить',
    /** Accessible name of a Service button, e.g. "Запустить API". */
    serviceAction: (action: string, serviceName: string) => `${action} ${serviceName}`,
    dismiss: 'Закрыть',
  },

  error: {
    details: 'Подробнее',
  },

  /** A Service that ended by itself (`crashed` / `exited`). */
  serviceExit: {
    crashed: (exitCode: number) => `Упал с кодом ${exitCode}`,
    exited: 'Завершился сам',
    lastLines: 'Последние строки вывода:',
    noOutput: 'Сервис ничего не вывел.',
    startAgain: 'Запустить снова',
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
    repoNotFound: () => 'Этого Репо больше нет в списке. Обновите страницу.',
    serviceNotFound: (p) => `В репо ${p.repoName} больше нет сервиса «${p.serviceId}». Обновите страницу.`,
    spawnFailed: (p) => `Не удалось запустить сервис ${p.serviceName} из репо ${p.repoName}.`,
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
    repoBusy: (p) => `В репо ${p.repoName} сейчас работают сервисы. Остановите их и попробуйте снова.`,
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
