/**
 * Hold to commit, for people who cannot hold: VoiceOver's double-tap (an
 * accessibility tap on iOS) and TalkBack's 'activate' action each commit at
 * once, and only once.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { HoldToCommitButton } from '@/components/HoldToCommitButton';

describe('HoldToCommitButton', () => {
  it('commits on an accessibility tap (VoiceOver double-tap on iOS)', async () => {
    const onCommit = jest.fn();
    await render(<HoldToCommitButton onCommit={onCommit} />);
    await fireEvent(screen.getByRole('button', { name: 'Hold to commit' }), 'accessibilityTap');
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("commits on the 'activate' action (TalkBack) and never twice", async () => {
    const onCommit = jest.fn();
    await render(<HoldToCommitButton onCommit={onCommit} />);
    const button = screen.getByRole('button', { name: 'Hold to commit' });
    await fireEvent(button, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    await fireEvent(button, 'accessibilityTap');
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('names the action so nothing announces "activate"', async () => {
    await render(<HoldToCommitButton onCommit={() => {}} />);
    expect(screen.getByRole('button', { name: 'Hold to commit' }).props.accessibilityActions).toEqual([
      { name: 'activate', label: 'Commit' },
    ]);
  });
});
