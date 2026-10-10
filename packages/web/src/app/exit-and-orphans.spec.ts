import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { Orphan, PortConflict } from '@devpanel/shared';
import { App } from './app';
import { BACKEND_TRANSPORT } from './backend/backend-transport';
import { FakeTransport } from './backend/fake-transport';
import { aRepo, aService } from './backend/test-data';

let transport: FakeTransport;
let fixture: ComponentFixture<App>;
let page: HTMLElement;

beforeEach(async () => {
  transport = new FakeTransport();
  TestBed.configureTestingModule({
    imports: [App],
    providers: [{ provide: BACKEND_TRANSPORT, useValue: transport }],
  });
  fixture = TestBed.createComponent(App);
  page = fixture.nativeElement as HTMLElement;
  await fixture.whenStable();
});

function button(root: ParentNode, text: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === text || b.getAttribute('aria-label') === text,
  );
  if (!found) throw new Error(`No "${text}" button in:\n${(root as HTMLElement).innerHTML}`);
  return found;
}

const apiOrphan: Orphan = {
  id: 'run-1',
  repoId: 'b1',
  repoName: 'Billing',
  owner: { kind: 'service', serviceId: 'api', serviceName: 'API' },
  pids: [111, 112],
};
const claudeOrphan: Orphan = {
  id: 'run-2',
  repoId: 'b1',
  repoName: 'Billing',
  owner: { kind: 'session', sessionKind: 'claude' },
  pids: [222],
};

describe('Exit DevPanel', () => {
  beforeEach(async () => {
    await transport.connectWith({ repos: [aRepo({ id: 'b1', name: 'Billing' })], sessions: [] });
    await fixture.whenStable();
  });

  it('asks for confirmation; cancelling sends nothing', async () => {
    button(page, 'Выйти из DevPanel').click();
    await fixture.whenStable();
    const dialog = page.querySelector<HTMLElement>('.exit-confirm')!;
    expect(dialog.textContent).toContain('Все сервисы и сессии будут остановлены');

    button(dialog, 'Отмена').click();
    await fixture.whenStable();
    expect(transport.commands('shutdown')).toEqual([]);
    expect(page.querySelector('.exit-confirm')).toBeNull();
  });

  it('confirmed: sends shutdown and, once done, says DevPanel is off', async () => {
    button(page, 'Выйти из DevPanel').click();
    await fixture.whenStable();
    button(page.querySelector('.exit-confirm')!, 'Да, выйти').click();
    await fixture.whenStable();

    const shutdown = transport.lastCommand('shutdown');
    expect(page.textContent).toContain('Останавливаем все сервисы и сессии');
    await transport.reply(shutdown, null);
    transport.close('server closed');
    await fixture.whenStable();

    expect(page.querySelector('.exited')?.textContent).toContain('DevPanel выключен');
    // No "no connection, retrying" banner once the user exited on purpose.
    expect(page.textContent).not.toContain('Нет связи с DevPanel');
  });
});

describe('Orphans', () => {
  it('lists Orphans from the snapshot in plain Russian; "Убить" kills them all', async () => {
    await transport.connectWith({ repos: [], sessions: [], orphans: [apiOrphan, claudeOrphan] });
    await fixture.whenStable();

    const block = page.querySelector<HTMLElement>('.orphans')!;
    expect(block.textContent).toContain('Сервис API из репо Billing остался с прошлого запуска');
    expect(block.textContent).toContain('Сессия Claude Code из репо Billing осталась с прошлого запуска');

    button(block, 'Убить').click();
    expect(transport.lastCommand('killOrphans').payload).toEqual({});

    transport.emit('orphansFound', { orphans: [] });
    await fixture.whenStable();
    expect(page.querySelector('.orphans')).toBeNull();
  });

  it('shows Orphans announced by an event', async () => {
    await transport.connectWith({ repos: [], sessions: [] });
    transport.emit('orphansFound', { orphans: [{ ...claudeOrphan, owner: { kind: 'session', sessionKind: 'shell' } }] });
    await fixture.whenStable();
    expect(page.querySelector('.orphans')!.textContent).toContain('Терминал из репо Billing остался с прошлого запуска');
  });

  it('an Orphan holding a port: named in the conflict, freed with one click (no confirmation)', async () => {
    const conflict: PortConflict = { port: 3000, reason: 'start', owner: { kind: 'orphan', pid: 112, orphan: apiOrphan } };
    await transport.connectWith({
      repos: [aRepo({ id: 'b1', name: 'Billing', services: [aService({ id: 'api', name: 'API', port: 3000, portConflict: conflict })] })],
      sessions: [],
      orphans: [apiOrphan],
    });
    await fixture.whenStable();

    const block = page.querySelector<HTMLElement>('[data-service-id="api"] .port-conflict')!;
    expect(block.textContent).toContain('Порт 3000 занят сервисом API из репо Billing, который остался с прошлого запуска');
    button(block, 'Завершить его и запустить наш').click();
    expect(transport.lastCommand('resolvePortConflict').payload).toEqual({ repoId: 'b1', serviceId: 'api' });
  });
});
