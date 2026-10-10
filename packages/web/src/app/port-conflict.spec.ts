import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { PortConflict } from '@devpanel/shared';
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

async function stable(): Promise<void> {
  await fixture.whenStable();
}

function serviceRow(serviceId: string): HTMLElement {
  const row = page.querySelector<HTMLElement>(`[data-repo-id="shop"] [data-service-id="${serviceId}"]`);
  if (!row) throw new Error(`No row for ${serviceId} in:\n${page.innerHTML}`);
  return row;
}

function conflictBlock(): HTMLElement | null {
  return serviceRow('web').querySelector<HTMLElement>('.port-conflict');
}

function button(root: HTMLElement, text: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
  if (!found) throw new Error(`No "${text}" button in:\n${root.innerHTML}`);
  return found;
}

function globalErrors(): string[] {
  return [...page.querySelectorAll('.errors .error-message')].map((e) => e.textContent!.trim());
}

const byService: PortConflict = {
  port: 3000,
  reason: 'start',
  owner: { kind: 'service', pid: 4321, repoId: 'billing', repoName: 'Billing', serviceId: 'api', serviceName: 'API' },
};
const byProcess: PortConflict = {
  port: 3000,
  reason: 'start',
  owner: { kind: 'process', pid: 1234, processName: 'node.exe' },
};

async function connectWithConflict(portConflict?: PortConflict): Promise<void> {
  await transport.connectWith({
    repos: [aRepo({ id: 'shop', name: 'Shop', services: [aService({ id: 'web', name: 'Web', port: 3000, ...(portConflict && { portConflict }) })] })],
  });
  await stable();
}

describe('a port conflict on start', () => {
  it('held by our Service: names it and its Repo; one click stops it and starts ours', async () => {
    await connectWithConflict(byService);

    const block = conflictBlock()!;
    expect(block.textContent).toContain('Порт 3000 занят сервисом API из репо Billing');
    button(block, 'Остановить его и запустить наш').click();

    expect(transport.lastCommand('resolvePortConflict').payload).toEqual({ repoId: 'shop', serviceId: 'web' });
  });

  it('held by a foreign process: names it by name and PID; killing it needs a confirmation', async () => {
    await connectWithConflict(byProcess);

    const block = conflictBlock()!;
    expect(block.textContent).toContain('Порт 3000 занят процессом node.exe (PID 1234)');
    button(block, 'Завершить и запустить наш').click();
    await stable();

    expect(transport.commands('resolvePortConflict')).toEqual([]);
    expect(conflictBlock()!.textContent).toContain('Завершить процесс node.exe (PID 1234)?');
    button(conflictBlock()!, 'Да, завершить').click();

    expect(transport.lastCommand('resolvePortConflict').payload).toEqual({ repoId: 'shop', serviceId: 'web' });
  });

  it('cancelling the confirmation sends nothing', async () => {
    await connectWithConflict(byProcess);

    button(conflictBlock()!, 'Завершить и запустить наш').click();
    await stable();
    button(conflictBlock()!, 'Отмена').click();
    await stable();

    expect(transport.commands('resolvePortConflict')).toEqual([]);
    expect(button(conflictBlock()!, 'Завершить и запустить наш')).toBeTruthy();
  });

  it('appears from the event, is shown inline instead of in the error list, and disappears when cleared', async () => {
    await connectWithConflict();
    expect(conflictBlock()).toBeNull();

    serviceRow('web').querySelector<HTMLButtonElement>('button[aria-label="Запустить Web"]')!.click();
    transport.emit('portConflictChanged', { repoId: 'shop', serviceId: 'web', portConflict: byService });
    await transport.fail(transport.lastCommand('startService'), {
      code: 'portTaken',
      params: { repoName: 'Shop', serviceName: 'Web', port: 3000, owner: byService.owner },
      details: 'Port 3000 is listened on by PID 4321',
    });
    await stable();

    expect(conflictBlock()!.textContent).toContain('Порт 3000 занят сервисом API из репо Billing');
    expect(globalErrors()).toEqual([]);

    transport.emit('portConflictChanged', { repoId: 'shop', serviceId: 'web' });
    await stable();
    expect(conflictBlock()).toBeNull();
  });

  it('a port that would not free up is reported in plain Russian', async () => {
    await connectWithConflict(byService);

    button(conflictBlock()!, 'Остановить его и запустить наш').click();
    await transport.fail(transport.lastCommand('resolvePortConflict'), {
      code: 'portNotFreed',
      params: { repoName: 'Shop', serviceName: 'Web', port: 3000 },
      details: 'Port 3000 was still listened on',
    });
    await stable();

    expect(globalErrors()).toEqual(['Порт 3000 так и не освободился, поэтому сервис Web не запущен. Попробуйте ещё раз.']);
  });
});

describe('a port still held after a Stop', () => {
  it('reports the owner and offers to kill it (with confirmation)', async () => {
    await connectWithConflict({ ...byProcess, reason: 'stop' });

    const block = conflictBlock()!;
    expect(block.textContent).toContain('Сервис Web остановлен, но порт 3000 всё ещё занят процессом node.exe (PID 1234)');
    button(block, 'Завершить').click();
    await stable();
    button(conflictBlock()!, 'Да, завершить').click();

    expect(transport.lastCommand('resolvePortConflict').payload).toEqual({ repoId: 'shop', serviceId: 'web' });
  });
});
