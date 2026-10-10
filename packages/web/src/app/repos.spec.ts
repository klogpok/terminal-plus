import { TestBed, type ComponentFixture } from '@angular/core/testing';
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

function repoCard(repoId: string): HTMLElement {
  const card = page.querySelector<HTMLElement>(`[data-repo-id="${repoId}"]`);
  if (!card) throw new Error(`No Repo ${repoId} in:\n${page.innerHTML}`);
  return card;
}

function buttonIn(root: HTMLElement, label: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label,
  );
  if (!found) throw new Error(`No "${label}" button in:\n${root.innerHTML}`);
  return found;
}

function repoNames(): string[] {
  return [...page.querySelectorAll('[data-repo-id] .repo-name')].map((e) => e.textContent!.trim());
}

const billing = aRepo({
  id: 'b1',
  name: 'Billing',
  branch: 'main',
  services: [
    aService({ id: 'api', name: 'API', status: 'running', url: 'http://localhost:3000' }),
    aService({ id: 'web', name: 'Web', status: 'starting' }),
    aService({ id: 'job', name: 'Job', status: 'stopped' }),
  ],
});
const docs = aRepo({ id: 'd1', name: 'Docs' });

describe('adding a Repo', () => {
  it('asks the Server to show the folder picker and lists the added Repo', async () => {
    await transport.connectWith({ repos: [billing] });
    await stable();

    buttonIn(page, 'Добавить репо').click();
    const command = transport.lastCommand('addRepo');
    expect(command.payload).toEqual({});
    const added = aRepo({ id: 'n1', name: 'New', color: '#22c55e' });
    transport.emit('repoChanged', { repoId: 'n1', repo: added });
    await transport.reply(command, added);
    await stable();

    expect(repoNames()).toEqual(['Billing', 'New']);
  });

  it('does nothing when the picker is cancelled', async () => {
    await transport.connectWith({ repos: [] });
    await stable();

    buttonIn(page, 'Добавить репо').click();
    await transport.reply(transport.lastCommand('addRepo'), null);
    await stable();

    expect(repoNames()).toEqual([]);
    expect(page.querySelector('.error')).toBeNull();
  });

  it('asks for another name when the name is taken, and retries with the same folder', async () => {
    await transport.connectWith({ repos: [billing] });
    await stable();

    buttonIn(page, 'Добавить репо').click();
    await transport.fail(transport.lastCommand('addRepo'), {
      code: 'repoNameTaken',
      params: { name: 'Billing', path: 'D:\\work\\Billing' },
      details: 'A Repo named "Billing" already exists',
    });
    await stable();

    const form = page.querySelector<HTMLFormElement>('form.repo-name-form')!;
    expect(form.textContent).toContain('Репо с именем «Billing» уже есть');
    const input = form.querySelector('input')!;
    input.value = 'Billing 2';
    input.dispatchEvent(new Event('input'));
    buttonIn(form, 'Добавить').click();
    await stable();

    const retry = transport.lastCommand('addRepo');
    expect(retry.payload).toEqual({ path: 'D:\\work\\Billing', name: 'Billing 2' });
    await transport.reply(retry, aRepo({ id: 'b2', name: 'Billing 2' }));
    await stable();
    expect(page.querySelector('form.repo-name-form')).toBeNull();
  });

  it('shows other refusals as errors (same folder added twice)', async () => {
    await transport.connectWith({ repos: [billing] });
    await stable();

    buttonIn(page, 'Добавить репо').click();
    await transport.fail(transport.lastCommand('addRepo'), {
      code: 'repoAlreadyAdded',
      params: { path: 'D:\\work\\billing', repoName: 'Billing' },
      details: 'already in the Workspace',
    });
    await stable();

    expect(page.querySelector('.error-message')!.textContent).toContain('Эта папка уже добавлена как репо Billing.');
  });
});

describe('removing a Repo', () => {
  it('lists what runs in it, and removes it only after confirmation', async () => {
    await transport.connectWith({ repos: [billing, docs] });
    await stable();

    buttonIn(repoCard('b1'), 'Удалить репо Billing').click();
    await stable();
    const confirm = repoCard('b1').querySelector<HTMLElement>('.remove-confirm')!;
    expect(confirm.textContent).toContain('Будут остановлены: API, Web.');
    expect(confirm.textContent).toContain('Папка с кодом останется на диске.');
    expect(transport.commands('removeRepo')).toEqual([]);

    buttonIn(confirm, 'Удалить').click();
    const command = transport.lastCommand('removeRepo');
    expect(command.payload).toEqual({ repoId: 'b1' });
    transport.emit('repoChanged', { repoId: 'b1', repo: null });
    await transport.reply(command, null);
    await stable();

    expect(repoNames()).toEqual(['Docs']);
  });

  it('can be cancelled', async () => {
    await transport.connectWith({ repos: [docs] });
    await stable();

    buttonIn(repoCard('d1'), 'Удалить репо Docs').click();
    await stable();
    expect(repoCard('d1').querySelector('.remove-confirm')!.textContent).toContain('Ничего не запущено.');
    buttonIn(repoCard('d1'), 'Отмена').click();
    await stable();

    expect(repoCard('d1').querySelector('.remove-confirm')).toBeNull();
    expect(transport.commands('removeRepo')).toEqual([]);
  });
});

describe('a Repo whose folder is missing', () => {
  const missing = aRepo({
    id: 'm1',
    name: 'Moved',
    color: '#a855f7',
    folderMissing: true,
    services: [aService({ id: 'api', name: 'API' })],
  });

  it('is greyed out with "Папка не найдена" and cannot start Services', async () => {
    await transport.connectWith({ repos: [missing] });
    await stable();

    const card = repoCard('m1');
    expect(card.classList).toContain('repo-missing');
    expect(card.textContent).toContain('Папка не найдена');
    expect(buttonIn(card, 'Запустить API').disabled).toBe(true);
  });

  it('turns grey when the Server reports the folder gone', async () => {
    await transport.connectWith({ repos: [docs] });
    await stable();

    transport.emit('repoChanged', { repoId: 'd1', repo: { ...docs, folderMissing: true } });
    await stable();

    expect(repoCard('d1').classList).toContain('repo-missing');
  });

  it('"Указать новое расположение" relocates it in place, keeping name and color', async () => {
    await transport.connectWith({ repos: [missing, docs] });
    await stable();

    buttonIn(repoCard('m1'), 'Указать новое расположение').click();
    const command = transport.lastCommand('relocateRepo');
    expect(command.payload).toEqual({ repoId: 'm1' });
    const relocated = { ...missing, id: 'm2', path: 'E:\\Moved', folderMissing: undefined };
    transport.emit('repoChanged', { repoId: 'm1', repo: relocated });
    await transport.reply(command, relocated);
    await stable();

    expect(repoNames()).toEqual(['Moved', 'Docs']);
    expect(repoCard('m2').classList).not.toContain('repo-missing');
    expect(buttonIn(repoCard('m2'), 'Запустить API').disabled).toBe(false);
  });

  it('offers "Удалить" too', async () => {
    await transport.connectWith({ repos: [missing] });
    await stable();

    buttonIn(repoCard('m1'), 'Удалить репо Moved').click();
    await stable();
    buttonIn(repoCard('m1'), 'Удалить').click();

    expect(transport.lastCommand('removeRepo').payload).toEqual({ repoId: 'm1' });
  });
});

describe('git branch', () => {
  it('is shown per Repo and follows repoChanged; non-git Repos show none', async () => {
    await transport.connectWith({ repos: [billing, docs] });
    await stable();

    expect(repoCard('b1').querySelector('.repo-branch')!.textContent).toContain('main');
    expect(repoCard('d1').querySelector('.repo-branch')).toBeNull();

    transport.emit('repoChanged', { repoId: 'b1', repo: { ...billing, branch: 'feature/login' } });
    await stable();

    expect(repoCard('b1').querySelector('.repo-branch')!.textContent).toContain('feature/login');
  });
});

describe('opening folders and URLs', () => {
  it('goes through the Server, never through browser APIs', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    await transport.connectWith({ repos: [billing] });
    await stable();

    buttonIn(repoCard('b1'), 'Открыть папку').click();
    buttonIn(repoCard('b1'), 'Открыть в браузере API').click();

    expect(transport.lastCommand('openFolder').payload).toEqual({ repoId: 'b1' });
    expect(transport.lastCommand('openUrl').payload).toEqual({ repoId: 'b1', serviceId: 'api' });
    expect(open).not.toHaveBeenCalled();
    expect(repoCard('b1').querySelector('[aria-label="Открыть в браузере Web"]')).toBeNull();
    open.mockRestore();
  });
});
