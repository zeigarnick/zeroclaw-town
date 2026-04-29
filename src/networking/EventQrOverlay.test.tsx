import { renderToStaticMarkup } from 'react-dom/server';
import { jest } from '@jest/globals';
import { EventQrOverlay, buildQrImageUrl, resolveCurrentEventSkillUrl } from './EventQrOverlay';
import { IApiAdapter } from './api';

function createApiAdapter(
  getEventSpaceConfig: IApiAdapter['getEventSpaceConfig'],
): Pick<IApiAdapter, 'getEventSpaceConfig'> {
  return {
    getEventSpaceConfig,
  };
}

describe('EventQrOverlay', () => {
  test('renders the configured fallback skill URL before event space loads', () => {
    const apiAdapter = createApiAdapter(jest.fn<any>());

    const markup = renderToStaticMarkup(
      <EventQrOverlay
        eventId="demo-event"
        skillUrl="https://fallback.example/skill.md"
        apiAdapter={apiAdapter}
      />,
    );

    expect(markup).toContain('https://fallback.example/skill.md');
    expect(markup).toContain('data=https%3A%2F%2Ffallback.example%2Fskill.md');
  });

  test('resolves the current link and QR destination when the event skill URL rotates', async () => {
    const apiAdapter = createApiAdapter(
      jest.fn<any>().mockResolvedValue({
        success: true,
        data: {
          eventId: 'demo-event',
          title: 'Demo Event',
          registrationStatus: 'open',
          skillUrl: 'https://rotated.example/skill.md',
          skillUrlRotatedAt: 1710000000000,
          updatedAt: 1710000000000,
        },
      }),
    );

    const currentSkillUrl = await resolveCurrentEventSkillUrl(
      apiAdapter,
      'demo-event',
      'https://fallback.example/skill.md',
    );
    const currentQrImageUrl = buildQrImageUrl(currentSkillUrl);

    expect(currentSkillUrl).toBe('https://rotated.example/skill.md');
    expect(currentQrImageUrl).toContain(
      encodeURIComponent('https://rotated.example/skill.md'),
    );
  });
});
