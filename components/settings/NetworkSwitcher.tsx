'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSoroban } from '@/lib/soroban/SorobanProvider';

type NetworkKey = 'testnet' | 'futurenet' | 'custom';

interface NetworkOption {
  key: NetworkKey;
  label: string;
  rpcUrl: string;
  networkPassphrase: string;
}

const PREDEFINED_NETWORKS: NetworkOption[] = [
  {
    key: 'testnet',
    label: 'Testnet',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  },
  {
    key: 'futurenet',
    label: 'Futurenet',
    rpcUrl: 'https://rpc-futurenet.stellar.org',
    networkPassphrase: 'Test SDF Future Network ; October 2022',
  },
];

const CUSTOM_STORAGE_KEY = 'soroban.customRpcEndpoint';

interface CustomEndpointConfig {
  rpcUrl: string;
  networkPassphrase: string;
}

interface ValidationResult {
  ok: boolean;
  message: string;
}

function normalizeUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

function isValidHttpUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

async function validateEndpoint(
  rpcUrl: string,
  expectedPassphrase: string,
): Promise<ValidationResult> {
  if (!rpcUrl) {
    return { ok: false, message: 'Enter an RPC endpoint URL.' };
  }

  if (!isValidHttpUrl(rpcUrl)) {
    return {
      ok: false,
      message:
        'Invalid endpoint. Use a full http:// or https:// URL (wrong protocol or malformed address).',
    };
  }

  let response: Response;
  try {
    response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getHealth',
      }),
    });
  } catch {
    return {
      ok: false,
      message: 'Endpoint unreachable. Check the URL and that the node is running.',
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      message: `Endpoint responded with HTTP ${response.status}. It may not be a Soroban RPC server.`,
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return {
      ok: false,
      message: 'Endpoint did not return valid JSON-RPC. It may not be a Soroban RPC server.',
    };
  }

  const result = (payload as { result?: { status?: string } } | null)?.result;
  if (!result || typeof result.status !== 'string') {
    return {
      ok: false,
      message: 'Endpoint is not a compatible Soroban RPC server (missing getHealth response).',
    };
  }

  if (result.status !== 'healthy') {
    return {
      ok: false,
      message: `Endpoint reported status "${result.status}". It is not healthy.`,
    };
  }

  try {
    const passphraseResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'getNetwork',
      }),
    });
    const passphrasePayload = (await passphraseResponse.json()) as {
      result?: { passphrase?: string };
    };
    const actualPassphrase = passphrasePayload?.result?.passphrase;
    if (actualPassphrase && actualPassphrase !== expectedPassphrase) {
      return {
        ok: false,
        message: `Network passphrase mismatch. Endpoint reports "${actualPassphrase}".`,
      };
    }
  } catch {
    return {
      ok: false,
      message: 'Could not verify the network passphrase for this endpoint.',
    };
  }

  return { ok: true, message: 'Connection successful. Endpoint is healthy and compatible.' };
}

export default function NetworkSwitcher() {
  const { network, setNetwork } = useSoroban();
  const [selected, setSelected] = useState<NetworkKey>('testnet');
  const [customUrl, setCustomUrl] = useState('');
  const [customPassphrase, setCustomPassphrase] = useState('');
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isValidated, setIsValidated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CUSTOM_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as CustomEndpointConfig;
        setCustomUrl(parsed.rpcUrl ?? '');
        setCustomPassphrase(parsed.networkPassphrase ?? '');
      }
    } catch {
      // ignore malformed stored config
    }
  }, []);

  const activeOption = useMemo(
    () => PREDEFINED_NETWORKS.find((option) => option.key === selected),
    [selected],
  );

  const handleSelect = useCallback(
    (key: NetworkKey) => {
      setSelected(key);
      setValidation(null);
      setIsValidated(false);
      if (key !== 'custom') {
        const option = PREDEFINED_NETWORKS.find((item) => item.key === key);
        if (option) {
          setNetwork({
            rpcUrl: option.rpcUrl,
            networkPassphrase: option.networkPassphrase,
          });
        }
      }
    },
    [setNetwork],
  );

  const handleTestConnection = useCallback(async () => {
    setIsTesting(true);
    setIsValidated(false);
    setValidation(null);
    const result = await validateEndpoint(
      normalizeUrl(customUrl),
      customPassphrase.trim(),
    );
    setValidation(result);
    setIsValidated(result.ok);
    setIsTesting(false);
  }, [customUrl, customPassphrase]);

  const handleSave = useCallback(() => {
    if (!isValidated) {
      setValidation({
        ok: false,
        message: 'Test the connection successfully before saving this endpoint.',
      });
      return;
    }
    const config: CustomEndpointConfig = {
      rpcUrl: normalizeUrl(customUrl),
      networkPassphrase: customPassphrase.trim(),
    };
    try {
      window.localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(config));
    } catch {
      // storage may be unavailable; still activate in-memory
    }
    setNetwork(config);
    setValidation({ ok: true, message: 'Custom endpoint saved and activated.' });
  }, [isValidated, customUrl, customPassphrase, setNetwork]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-gray-200">Network</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {PREDEFINED_NETWORKS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => handleSelect(option.key)}
              className={`rounded-md px-3 py-1.5 text-sm ${
                selected === option.key
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {option.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => handleSelect('custom')}
            className={`rounded-md px-3 py-1.5 text-sm ${
              selected === 'custom'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            Custom
          </button>
        </div>
        {activeOption && (
          <p className="mt-2 text-xs text-gray-500">{activeOption.rpcUrl}</p>
        )}
      </div>

      {selected === 'custom' && (
        <div className="space-y-3 rounded-md border border-gray-800 p-3">
          <div>
            <label
              htmlFor="custom-rpc-url"
              className="block text-xs font-medium text-gray-400"
            >
              Custom Soroban RPC endpoint
            </label>
            <input
              id="custom-rpc-url"
              type="url"
              value={customUrl}
              onChange={(event) => {
                setCustomUrl(event.target.value);
                setIsValidated(false);
                setValidation(null);
              }}
              placeholder="https://my-soroban-node.example.com"
              className="mt-1 w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
            />
          </div>

          <div>
            <label
              htmlFor="custom-passphrase"
              className="block text-xs font-medium text-gray-400"
            >
              Expected network passphrase
            </label>
            <input
              id="custom-passphrase"
              type="text"
              value={customPassphrase}
              onChange={(event) => {
                setCustomPassphrase(event.target.value);
                setIsValidated(false);
                setValidation(null);
              }}
              placeholder="Test SDF Network ; September 2015"
              className="mt-1 w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="rounded-md bg-gray-800 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-700 disabled:opacity-50"
            >
              {isTesting ? 'Testing…' : 'Test connection'}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!isValidated}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              Save & activate
            </button>
          </div>

          {validation && (
            <p
              role="status"
              className={`text-xs ${
                validation.ok ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {validation.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
