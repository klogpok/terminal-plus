import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { ServiceStatus } from '@devpanel/shared';
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
  const row = page.querySelector<HTMLElement>(`[data-repo-id="b1"] [data-service-id="${serviceId}"]`);
  if (!row) throw new Error(`No row for ${serviceId} in:\n${page.innerHTML}`);
  return row;
}

function exitBlock(serviceId: string): HTMLElement | null {
  return serviceRow(serviceId).querySelector<HTMLElement>('.service-exit');
}

function startAgain(serviceId: string): HTMLButtonElement {
  const found = [...serviceRow(serviceId).querySelectorAll('button')].find((b) =>
    b.textContent?.includes('Start again'),
  );
  if (!found) throw new Error(`No "Start again" for ${serviceId}`);
  return found;
}

const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);

describe('status dots', () => {
  it('cover all seven Statuses, each with its own color class and label', async () => {
    const all: [ServiceStatus, string][] = [
      ['stopped', 'Stopped'],
      ['starting', 'Starting'],
      ['running', 'Running'],
      ['unhealthy', 'Running, but not responding'],
      ['stopping', 'Stopping'],
      ['crashed', 'Crashed'],
      ['exited', 'Stopped by itself'],
    ];
    await transport.connectWith({
      repos: [aRepo({ id: 'b1', services: all.map(([status]) => aService({ id: status, status })) })],
    });
    await stable();

    for (const [status, label] of all) {
      const dot = serviceRow(status).querySelector<HTMLElement>('.status-dot')!;
      expect(dot.classList).toContain(`status-${status}`);
      expect(dot.getAttribute('aria-label')).toBe(label);
    }
  });

  it('an unhealthy Service can be stopped but not started', async () => {
    await transport.connectWith({ repos: [aRepo({ id: 'b1', services: [aService({ id: 'api', name: 'API', status: 'unhealthy' })] })] });
    await stable();

    const buttons = [...serviceRow('api').querySelectorAll('button')];
    expect(buttons.find((b) => b.getAttribute('aria-label') === 'Stop API')!.disabled).toBe(false);
    expect(buttons.find((b) => b.getAttribute('aria-label') === 'Start API')!.disabled).toBe(true);
  });
});

describe('Build Error', () => {
  function dot(serviceId: string): HTMLElement {
    return serviceRow(serviceId).querySelector<HTMLElement>('.status-dot')!;
  }

  it('a Snapshot with buildError shows the Build Error dot and tooltip, keeping the live buttons', async () => {
    await transport.connectWith({
      repos: [aRepo({ id: 'b1', services: [aService({ id: 'web', name: 'Web', status: 'running', buildError: true })] })],
    });
    await stable();

    expect(dot('web').classList).toContain('status-build-error');
    expect(dot('web').classList).not.toContain('status-crashed');
    expect(dot('web').title).toBe('The build has errors, see the terminal');
    expect(dot('web').getAttribute('aria-label')).toBe('The build has errors, see the terminal');
    const buttons = [...serviceRow('web').querySelectorAll('button')];
    expect(buttons.find((b) => b.getAttribute('aria-label') === 'Stop Web')!.disabled).toBe(false);
    expect(buttons.find((b) => b.getAttribute('aria-label') === 'Start Web')!.disabled).toBe(true);
  });

  it('buildErrorChanged sets and removes it', async () => {
    await transport.connectWith({ repos: [aRepo({ id: 'b1', services: [aService({ id: 'web', status: 'starting' })] })] });
    await stable();
    expect(dot('web').classList).not.toContain('status-build-error');

    transport.emit('buildErrorChanged', { repoId: 'b1', serviceId: 'web', buildError: true });
    await stable();
    expect(dot('web').classList).toContain('status-build-error');

    transport.emit('buildErrorChanged', { repoId: 'b1', serviceId: 'web', buildError: false });
    await stable();
    expect(dot('web').classList).not.toContain('status-build-error');
    expect(dot('web').classList).toContain('status-starting');
    expect(dot('web').getAttribute('aria-label')).toBe('Starting');
  });
});

describe('a Service waiting for its dependencies', () => {
  it('says which dependencies it waits for and can be stopped (cancelling the start)', async () => {
    await transport.connectWith({ repos: [aRepo({ id: 'b1', services: [aService({ id: 'api', name: 'API', status: 'stopped' })] })] });
    await stable();
    transport.emit('waitingChanged', { repoId: 'b1', serviceId: 'api', waitingFor: ['DB', 'Cache'] });
    await stable();

    expect(serviceRow('api').textContent).toContain('waiting for: DB, Cache');
    const stop = [...serviceRow('api').querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Stop API')!;
    expect(stop.disabled).toBe(false);
    stop.click();
    expect(transport.lastCommand('stopService').payload).toEqual({ repoId: 'b1', serviceId: 'api' });

    transport.emit('waitingChanged', { repoId: 'b1', serviceId: 'api' });
    await stable();
    expect(serviceRow('api').textContent).not.toContain('waiting for');
    expect(stop.disabled).toBe(true);
  });
});

describe('a Service that ended by itself', () => {
  it('crashed: shows the exit code and the last lines as an error, with "Start again"', async () => {
    await transport.connectWith({
      repos: [aRepo({ id: 'b1', services: [aService({ id: 'job', status: 'crashed', lastExit: { exitCode: 3, lastLines: lines } })] })],
    });
    await stable();

    const block = exitBlock('job')!;
    expect(block.classList).toContain('exit-crashed');
    expect(block.textContent).toContain('Crashed with code 3');
    expect(block.querySelector('pre')!.textContent).toBe(lines.join('\n'));

    startAgain('job').click();
    expect(transport.lastCommand('startService').payload).toEqual({ repoId: 'b1', serviceId: 'job' });
  });

  it('exited: shows "Stopped by itself" with the last lines, not styled as an error', async () => {
    await transport.connectWith({
      repos: [aRepo({ id: 'b1', services: [aService({ id: 'once', status: 'exited', lastExit: { exitCode: 0, lastLines: ['done'] } })] })],
    });
    await stable();

    const block = exitBlock('once')!;
    expect(block.classList).not.toContain('exit-crashed');
    expect(block.getAttribute('role')).not.toBe('alert');
    expect(block.textContent).toContain('Stopped by itself');
    expect(block.querySelector('pre')!.textContent).toBe('done');
    startAgain('once').click();
    expect(transport.lastCommand('startService').payload).toEqual({ repoId: 'b1', serviceId: 'once' });
  });

  it('Dismiss asks the Server to dismiss the exit; the block goes once the Service is stopped', async () => {
    await transport.connectWith({
      repos: [aRepo({ id: 'b1', services: [aService({ id: 'job', status: 'crashed', lastExit: { exitCode: 3, lastLines: lines } })] })],
    });
    await stable();

    const dismiss = [...exitBlock('job')!.querySelectorAll('button')].find((b) => b.textContent?.includes('Dismiss'));
    dismiss!.click();
    expect(transport.lastCommand('dismissExit').payload).toEqual({ repoId: 'b1', serviceId: 'job' });

    transport.emit('statusChanged', { repoId: 'b1', serviceId: 'job', status: 'stopped' });
    await stable();
    expect(exitBlock('job')).toBeNull();
  });

  it('an exited Service can be dismissed too', async () => {
    await transport.connectWith({
      repos: [aRepo({ id: 'b1', services: [aService({ id: 'once', status: 'exited', lastExit: { exitCode: 0, lastLines: ['done'] } })] })],
    });
    await stable();

    const dismiss = [...exitBlock('once')!.querySelectorAll('button')].find((b) => b.textContent?.includes('Dismiss'));
    dismiss!.click();
    expect(transport.lastCommand('dismissExit').payload).toEqual({ repoId: 'b1', serviceId: 'once' });
  });

  it('gets its details from the exit event, and loses them when started again', async () => {
    await transport.connectWith({ repos: [aRepo({ id: 'b1', services: [aService({ id: 'api', status: 'running' })] })] });
    await stable();
    expect(exitBlock('api')).toBeNull();

    transport.emit('statusChanged', { repoId: 'b1', serviceId: 'api', status: 'crashed' });
    transport.emit('exit', { repoId: 'b1', serviceId: 'api', exitCode: 1, stoppedByUser: false, lastLines: ['boom'] });
    await stable();
    expect(exitBlock('api')!.textContent).toContain('Crashed with code 1');
    expect(exitBlock('api')!.textContent).toContain('boom');

    transport.emit('statusChanged', { repoId: 'b1', serviceId: 'api', status: 'starting' });
    await stable();
    expect(exitBlock('api')).toBeNull();
  });

  it('shows nothing extra for a Service stopped by the user', async () => {
    await transport.connectWith({ repos: [aRepo({ id: 'b1', services: [aService({ id: 'api', status: 'stopping' })] })] });
    await stable();

    transport.emit('statusChanged', { repoId: 'b1', serviceId: 'api', status: 'stopped' });
    transport.emit('exit', { repoId: 'b1', serviceId: 'api', exitCode: 1, stoppedByUser: true, lastLines: ['bye'] });
    await stable();

    expect(exitBlock('api')).toBeNull();
  });
});
