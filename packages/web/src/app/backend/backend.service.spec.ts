import { TestBed } from '@angular/core/testing';
import { BACKEND_TRANSPORT } from './backend-transport';
import { BackendService } from './backend.service';
import { FakeTransport } from './fake-transport';
import { aRepo, aService } from './test-data';

let transport: FakeTransport;
let backend: BackendService;

beforeEach(() => {
  transport = new FakeTransport();
  TestBed.configureTestingModule({ providers: [{ provide: BACKEND_TRANSPORT, useValue: transport }] });
  backend = TestBed.inject(BackendService);
});

const billing = aRepo({ id: 'b1', name: 'Billing', services: [aService({ id: 'api', status: 'stopped' })] });

describe('BackendService', () => {
  it('requests a snapshot when connected and exposes its Repos', async () => {
    expect(backend.connection()).toBe('connecting');

    await transport.connectWith({ repos: [billing] });

    expect(backend.connection()).toBe('open');
    expect(backend.repos()).toEqual([billing]);
  });

  it('applies statusChanged events to the matching Service', async () => {
    await transport.connectWith({ repos: [billing] });

    transport.emit('statusChanged', { repoId: 'b1', serviceId: 'api', status: 'running' });

    expect(backend.repos()[0]!.services[0]!.status).toBe('running');
  });

  it('rebuilds the whole state from a fresh snapshot after a reconnect', async () => {
    await transport.connectWith({ repos: [billing] });
    transport.close();
    expect(backend.connection()).toBe('closed');

    const docs = aRepo({ id: 'd1', name: 'Docs', services: [aService({ id: 'watch', status: 'running' })] });
    await transport.connectWith({ repos: [docs] });

    expect(transport.commands('getSnapshot')).toHaveLength(2);
    expect(backend.connection()).toBe('open');
    expect(backend.repos()).toEqual([docs]);
  });

  it('sends Service commands with the Repo and Service ids', async () => {
    await transport.connectWith({ repos: [billing] });

    backend.startService('b1', 'api');
    backend.stopService('b1', 'api');
    backend.restartService('b1', 'api');

    expect(transport.sent.slice(1).map((m) => [m.type, m.payload])).toEqual([
      ['startService', { repoId: 'b1', serviceId: 'api' }],
      ['stopService', { repoId: 'b1', serviceId: 'api' }],
      ['restartService', { repoId: 'b1', serviceId: 'api' }],
    ]);
  });

  it('turns a failed command into a plain-Russian error with technical details', async () => {
    await transport.connectWith({ repos: [billing] });

    backend.startService('b1', 'api');
    await transport.fail(transport.lastCommand('startService'), {
      code: 'spawnFailed',
      params: { repoName: 'Billing', serviceName: 'API' },
      details: 'spawn cmd.exe ENOENT',
    });

    expect(backend.errors()).toEqual([
      expect.objectContaining({ message: 'Не удалось запустить сервис API из репо Billing.', details: 'spawn cmd.exe ENOENT' }),
    ]);
    backend.dismissError(backend.errors()[0]!.id);
    expect(backend.errors()).toEqual([]);
  });

  it('fails pending commands when the connection drops', async () => {
    await transport.connectWith({ repos: [billing] });

    const result = backend.command('startService', { repoId: 'b1', serviceId: 'api' });
    transport.close('socket closed (1006)');

    await expect(result).rejects.toMatchObject({ code: 'connectionLost' });
  });
});
