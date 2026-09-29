import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getPersistedWalletId,
  setPersistedWalletId,
  clearPersistedWalletId,
} from './storage';

describe('wallet storage persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('returns null when no wallet id has been persisted', () => {
    expect(getPersistedWalletId()).toBeNull();
  });

  it('persists and reads back a selected wallet id', () => {
    setPersistedWalletId('freighter');
    expect(getPersistedWalletId()).toBe('freighter');
  });

  it('clears a persisted wallet id', () => {
    setPersistedWalletId('freighter');
    clearPersistedWalletId();
    expect(getPersistedWalletId()).toBeNull();
  });

  it('clears the persisted selection when the stored wallet is no longer available', () => {
    setPersistedWalletId('uninstalled-wallet');
    const available = ['freighter', 'xbull'];
    const persisted = getPersistedWalletId();
    if (persisted && !available.includes(persisted)) {
      clearPersistedWalletId();
    }
    expect(getPersistedWalletId()).toBeNull();
  });

  it('does not throw when localStorage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(() => getPersistedWalletId()).not.toThrow();
  });
});
