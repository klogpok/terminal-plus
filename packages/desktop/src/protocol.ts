/**
 * The shell–sidecar protocol (ADR-0003): one JSON object per line. The shell writes shell messages
 * to the sidecar's stdin; the sidecar writes sidecar messages to its stdout and nothing else there.
 * This file is the one definition of the messages; the Rust shell mirrors them with serde, and
 * `test/fixtures/protocol.jsonl` (one sample line per message) keeps both sides in step.
 */
import { z } from 'zod';
import { UI_LANGUAGES } from '@devpanel/shared';

const message = <T extends string, S extends z.ZodRawShape = Record<never, never>>(type: T, shape?: S) =>
  z.object({ type: z.literal(type), ...(shape ?? ({} as S)) });

/** shell → sidecar */
const shellMessage = z.discriminatedUnion('type', [
  /** The first message: how the shell was launched and what it knows about Start with Windows. */
  message('start', { startHidden: z.boolean(), autostartEnabled: z.boolean() }),
  /** Left click on the tray icon. */
  message('trayClicked'),
  /** A tray menu item, by the `id` the last `setTray` gave it. */
  message('trayItemClicked', { itemId: z.string() }),
  /** The user closes the window; the shell keeps it until the sidecar answers `hideWindow`. */
  message('windowCloseRequested'),
  /** The shell itself was asked to quit; it ends after the sidecar's `exit`. */
  message('quitRequested'),
  /** Start with Windows is now `enabled` (after `setAutostart`, or changed outside DevPanel). */
  message('autostartChanged', { enabled: z.boolean() }),
  /** The user dismissed the `showError` dialog with this id. */
  message('errorDismissed', { dialogId: z.number().int() }),
]);

const trayItem = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(['normal', 'checkbox', 'separator']),
  checked: z.boolean().optional(),
});

/** sidecar → shell */
const sidecarMessage = z.discriminatedUnion('type', [
  /** Create the window on the Server's open URL (Access Key in the fragment); `show` reveals it at once. */
  message('openWindow', { url: z.string(), show: z.boolean() }),
  /** Show (restoring if minimized) and focus the window. */
  message('showWindow'),
  message('hideWindow'),
  /** Replace the tray tooltip and menu. */
  message('setTray', { tooltip: z.string(), items: z.array(trayItem) }),
  /** A native error box; answered with `errorDismissed` once the user closed it (and its details). */
  message('showError', {
    dialogId: z.number().int(),
    title: z.string(),
    message: z.string(),
    /** Technical details behind the "Details" button; no button without them. */
    details: z.string().optional(),
    language: z.enum(UI_LANGUAGES),
    buttons: z.object({ ok: z.string(), details: z.string(), detailsTitle: z.string() }),
  }),
  /** Turn Start with Windows on or off; the shell answers `autostartChanged`. */
  message('setAutostart', { enabled: z.boolean() }),
  /** What the shell shows if the sidecar ends without `exit`; replaces the previous texts. */
  message('setCrashTexts', { title: z.string(), message: z.string() }),
  /**
   * Open an http(s) URL in the default browser. The shell does it, not the sidecar: anything the
   * sidecar spawns lives in its Job Object and would die with DevPanel.
   */
  message('openUrl', { url: z.string() }),
  /** Open a folder in Explorer (outside the Job Object, as `openUrl`). */
  message('openFolder', { path: z.string() }),
  /** Everything is stopped: the shell ends with this exit code. */
  message('exit', { code: z.number().int() }),
]);

export type ShellMessage = z.infer<typeof shellMessage>;
export type SidecarMessage = z.infer<typeof sidecarMessage>;
export type TrayItem = z.infer<typeof trayItem>;

export type Parsed<M> = { ok: true; message: M } | { ok: false; error: string };

function parse<M>(schema: z.ZodType<M>, line: string): Parsed<M> {
  let json: unknown;
  try {
    json = JSON.parse(line);
  } catch (error) {
    return { ok: false, error: `not JSON: ${(error as Error).message}` };
  }
  const result = schema.safeParse(json);
  return result.success ? { ok: true, message: result.data } : { ok: false, error: z.prettifyError(result.error) };
}

export const parseShellMessage = (line: string): Parsed<ShellMessage> => parse(shellMessage, line);
export const parseSidecarMessage = (line: string): Parsed<SidecarMessage> => parse(sidecarMessage, line);

/** One protocol line, newline included. */
export const formatLine = (message: ShellMessage | SidecarMessage): string => `${JSON.stringify(message)}\n`;
