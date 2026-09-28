/**
 * Opens an evidence video in a new tab from a tap or click. The tab opens before the signed
 * URL is fetched: Safari blocks a tab opened after an await because the tap no longer counts
 * as the reason for it. Where pop-ups are blocked outright the video opens in this tab.
 */
export async function openPlaybackTab(playbackUrl: () => Promise<string>): Promise<void> {
  const tab = window.open('', '_blank');
  if (tab) tab.opener = null;
  try {
    const url = await playbackUrl();
    if (tab) tab.location.replace(url);
    else window.location.assign(url);
  } catch (error) {
    tab?.close();
    throw error;
  }
}
