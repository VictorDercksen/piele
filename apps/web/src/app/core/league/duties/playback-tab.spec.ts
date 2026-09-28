import { openPlaybackTab } from './playback-tab';

function fakeTab() {
  return { opener: {}, location: { replace: vi.fn() }, close: vi.fn() };
}

describe('openPlaybackTab', () => {
  afterEach(() => vi.restoreAllMocks());

  it('opens the tab before the URL arrives, then sends it to the video', async () => {
    const tab = fakeTab();
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    let resolve!: (url: string) => void;
    const opened = openPlaybackTab(() => new Promise((r) => (resolve = r)));
    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(tab.opener).toBeNull();
    resolve('https://storage.example/video.mov');
    await opened;
    expect(tab.location.replace).toHaveBeenCalledWith('https://storage.example/video.mov');
  });

  it('closes the tab and rethrows when the URL fails', async () => {
    const tab = fakeTab();
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    await expect(
      openPlaybackTab(() => Promise.reject(new Error('The video is unavailable.'))),
    ).rejects.toThrow('The video is unavailable.');
    expect(tab.close).toHaveBeenCalledOnce();
    expect(tab.location.replace).not.toHaveBeenCalled();
  });
});
