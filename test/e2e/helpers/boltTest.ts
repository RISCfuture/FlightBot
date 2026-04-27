import { App, type Receiver, type ReceiverEvent } from '@slack/bolt';
import { vi, type Mock } from 'vitest';

export class NoOpReceiver implements Receiver {
  init(): void {
    /* no-op */
  }
  start(): Promise<unknown> {
    return Promise.resolve();
  }
  stop(): Promise<unknown> {
    return Promise.resolve();
  }
}

export interface TestBoltApp {
  app: App;
  chatPostMessage: Mock;
}

export function createTestBoltApp(): TestBoltApp {
  const chatPostMessage = vi.fn().mockResolvedValue({ ok: true, ts: '1.0' });
  const app = new App({
    signingSecret: 'test-signing-secret',
    socketMode: false,
    receiver: new NoOpReceiver(),
    authorize: () =>
      Promise.resolve({
        botToken: 'xoxb-test',
        botUserId: 'U_BOT',
        botId: 'B_BOT',
      }),
  });
  (app as unknown as { client: unknown }).client = {
    chat: { postMessage: chatPostMessage },
  };
  return { app, chatPostMessage };
}

export interface SlashCommandOptions {
  command: string;
  text: string;
  channelId?: string;
  userId?: string;
  responseUrl?: string;
}

export interface FabricatedEvent extends ReceiverEvent {
  ack: Mock;
}

export function makeSlashCommandEvent(opts: SlashCommandOptions): FabricatedEvent {
  const ack = vi.fn().mockResolvedValue(undefined);
  return {
    ack,
    body: {
      token: 'verify-token',
      command: opts.command,
      text: opts.text,
      response_url: opts.responseUrl ?? 'https://hooks.slack.com/commands/T_TEST/123/abc',
      trigger_id: 'trig-1',
      user_id: opts.userId ?? 'U_USER',
      user_name: 'tester',
      team_id: 'T_TEST',
      team_domain: 'test',
      channel_id: opts.channelId ?? 'C_CHAN',
      channel_name: 'general',
      api_app_id: 'A_APP',
    },
  };
}
