import { accessKeyFromHash, webSocketUrl } from './ws-transport';

describe('WsTransport addressing', () => {
  it('reads the Access Key from the URL fragment', () => {
    expect(accessKeyFromHash('#key=abc-DEF_123')).toBe('abc-DEF_123');
    expect(accessKeyFromHash('#foo=1&key=k%2B1')).toBe('k+1');
    expect(accessKeyFromHash('')).toBeNull();
    expect(accessKeyFromHash('#other=1')).toBeNull();
  });

  it('connects to /ws on the page host with the key as a query parameter', () => {
    expect(webSocketUrl({ protocol: 'http:', host: '127.0.0.1:7777' }, 'k+1')).toBe('ws://127.0.0.1:7777/ws?key=k%2B1');
    expect(webSocketUrl({ protocol: 'https:', host: 'localhost:4200' }, 'k')).toBe('wss://localhost:4200/ws?key=k');
  });
});
