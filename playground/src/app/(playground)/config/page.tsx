'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type ProviderType = 'imap' | 'gmail' | 'outlook';
type AiAdapter = 'openai' | 'anthropic' | 'google' | 'ollama';
type SearchStore = 'memory' | 'sqlite';

export default function ConfigPage() {
  const [providerType, setProviderType] = useState<ProviderType>('imap');
  const [imapHost, setImapHost] = useState('');
  const [imapPort, setImapPort] = useState('993');
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('465');
  const [emailUser, setEmailUser] = useState('');
  const [emailPass, setEmailPass] = useState('');
  const [gmailClientId, setGmailClientId] = useState('');
  const [gmailClientSecret, setGmailClientSecret] = useState('');
  const [gmailRefreshToken, setGmailRefreshToken] = useState('');
  const [outlookClientId, setOutlookClientId] = useState('');
  const [outlookClientSecret, setOutlookClientSecret] = useState('');
  const [outlookRefreshToken, setOutlookRefreshToken] = useState('');
  const [aiAdapter, setAiAdapter] = useState<AiAdapter>('openai');
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [aiBaseUrl, setAiBaseUrl] = useState('');
  const [searchStore, setSearchStore] = useState<SearchStore>('memory');
  const [enableSafety, setEnableSafety] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((res) => {
        if (!res.data) return;
        const c = res.data;
        setProviderType(c.provider.type);
        if (c.provider.type === 'imap') {
          setImapHost(c.provider.imap?.host ?? '');
          setImapPort(String(c.provider.imap?.port ?? '993'));
          setSmtpHost(c.provider.smtp?.host ?? '');
          setSmtpPort(String(c.provider.smtp?.port ?? '465'));
          const auth = c.provider.imap?.auth;
          if (auth) {
            setEmailUser(auth.user ?? '');
            setEmailPass(auth.pass ?? '');
          }
        } else if (c.provider.type === 'gmail') {
          setGmailClientId(c.provider.credentials?.clientId ?? '');
          setGmailClientSecret(c.provider.credentials?.clientSecret ?? '');
          setGmailRefreshToken(c.provider.credentials?.refreshToken ?? '');
        } else if (c.provider.type === 'outlook') {
          setOutlookClientId(c.provider.credentials?.clientId ?? '');
          setOutlookClientSecret(c.provider.credentials?.clientSecret ?? '');
          setOutlookRefreshToken(c.provider.credentials?.refreshToken ?? '');
        }
        if (c.ai) {
          setAiAdapter(c.ai.adapter ?? 'openai');
          setAiApiKey(c.ai.apiKey ?? '');
          setAiModel(c.ai.model ?? '');
          setAiBaseUrl(c.ai.baseUrl ?? '');
        }
        if (c.search) setSearchStore(c.search.store ?? 'memory');
        if (c.safety) setEnableSafety(c.safety.piiScanning !== false);
      })
      .catch(() => {});
  }, []);

  function buildConfig() {
    const config: Record<string, unknown> = {};

    if (providerType === 'imap') {
      config.provider = {
        type: 'imap',
        imap: {
          host: imapHost,
          port: Number(imapPort),
          secure: true,
          auth: { user: emailUser, pass: emailPass },
        },
        smtp: {
          host: smtpHost,
          port: Number(smtpPort),
          secure: true,
          auth: { user: emailUser, pass: emailPass },
        },
      };
    } else if (providerType === 'gmail') {
      config.provider = {
        type: 'gmail',
        credentials: {
          clientId: gmailClientId,
          clientSecret: gmailClientSecret,
          refreshToken: gmailRefreshToken,
        },
      };
    } else {
      config.provider = {
        type: 'outlook',
        credentials: {
          clientId: outlookClientId,
          clientSecret: outlookClientSecret,
          refreshToken: outlookRefreshToken,
        },
      };
    }

    if (aiApiKey || aiAdapter === 'ollama') {
      config.ai = {
        adapter: aiAdapter,
        ...(aiApiKey && { apiKey: aiApiKey }),
        ...(aiModel && { model: aiModel }),
        ...(aiBaseUrl && { baseUrl: aiBaseUrl }),
      };
    }

    config.search = { store: searchStore };
    config.storage = { type: 'memory' };

    if (enableSafety) {
      config.safety = {
        piiScanning: true,
        credentialScanning: true,
        humanApproval: 'none',
      };
    }

    return config;
  }

  async function handleSave() {
    setSaving(true);
    try {
      const config = buildConfig();
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Configuration saved');
      } else {
        toast.error(data.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleConnect() {
    setConnecting(true);
    try {
      await handleSave();
      const res = await fetch('/api/emai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect' }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Connected to email provider');
      } else {
        toast.error(data.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    try {
      const res = await fetch('/api/emai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect' }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Disconnected');
      }
    } catch {
      toast.error('Failed to disconnect');
    }
  }

  return (
    <>
      <Header title="Configuration" />
      <div className="flex flex-1 flex-col gap-6 p-6 max-w-3xl">
        <Tabs defaultValue="provider">
          <TabsList>
            <TabsTrigger value="provider">Provider</TabsTrigger>
            <TabsTrigger value="ai">AI</TabsTrigger>
            <TabsTrigger value="search">Search</TabsTrigger>
            <TabsTrigger value="safety">Safety</TabsTrigger>
          </TabsList>

          <TabsContent value="provider" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Email Provider</CardTitle>
                <CardDescription>Configure your email connection</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Provider Type</Label>
                  <Select value={providerType} onValueChange={(v) => setProviderType(v as ProviderType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="imap">IMAP/SMTP</SelectItem>
                      <SelectItem value="gmail">Gmail API</SelectItem>
                      <SelectItem value="outlook">Microsoft Outlook</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {providerType === 'imap' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>IMAP Host</Label>
                        <Input value={imapHost} onChange={(e) => setImapHost(e.target.value)} placeholder="imap.gmail.com" />
                      </div>
                      <div>
                        <Label>IMAP Port</Label>
                        <Input value={imapPort} onChange={(e) => setImapPort(e.target.value)} placeholder="993" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>SMTP Host</Label>
                        <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.gmail.com" />
                      </div>
                      <div>
                        <Label>SMTP Port</Label>
                        <Input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="465" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Email</Label>
                        <Input value={emailUser} onChange={(e) => setEmailUser(e.target.value)} placeholder="you@gmail.com" />
                      </div>
                      <div>
                        <Label>Password / App Password</Label>
                        <Input type="password" value={emailPass} onChange={(e) => setEmailPass(e.target.value)} placeholder="app-password" />
                      </div>
                    </div>
                  </>
                )}

                {providerType === 'gmail' && (
                  <>
                    <div>
                      <Label>Client ID</Label>
                      <Input value={gmailClientId} onChange={(e) => setGmailClientId(e.target.value)} />
                    </div>
                    <div>
                      <Label>Client Secret</Label>
                      <Input type="password" value={gmailClientSecret} onChange={(e) => setGmailClientSecret(e.target.value)} />
                    </div>
                    <div>
                      <Label>Refresh Token</Label>
                      <Input type="password" value={gmailRefreshToken} onChange={(e) => setGmailRefreshToken(e.target.value)} />
                    </div>
                  </>
                )}

                {providerType === 'outlook' && (
                  <>
                    <div>
                      <Label>Client ID</Label>
                      <Input value={outlookClientId} onChange={(e) => setOutlookClientId(e.target.value)} />
                    </div>
                    <div>
                      <Label>Client Secret</Label>
                      <Input type="password" value={outlookClientSecret} onChange={(e) => setOutlookClientSecret(e.target.value)} />
                    </div>
                    <div>
                      <Label>Refresh Token</Label>
                      <Input type="password" value={outlookRefreshToken} onChange={(e) => setOutlookRefreshToken(e.target.value)} />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ai" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>AI Configuration</CardTitle>
                <CardDescription>Configure the LLM adapter for AI features</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Adapter</Label>
                  <Select value={aiAdapter} onValueChange={(v) => setAiAdapter(v as AiAdapter)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="anthropic">Anthropic</SelectItem>
                      <SelectItem value="google">Google Gemini</SelectItem>
                      <SelectItem value="ollama">Ollama (local)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {aiAdapter !== 'ollama' && (
                  <div>
                    <Label>API Key</Label>
                    <Input type="password" value={aiApiKey} onChange={(e) => setAiApiKey(e.target.value)} placeholder="sk-..." />
                  </div>
                )}
                <div>
                  <Label>Model (optional)</Label>
                  <Input value={aiModel} onChange={(e) => setAiModel(e.target.value)} placeholder={aiAdapter === 'openai' ? 'gpt-4o' : aiAdapter === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gemini-2.0-flash'} />
                </div>
                {aiAdapter === 'ollama' && (
                  <div>
                    <Label>Base URL</Label>
                    <Input value={aiBaseUrl} onChange={(e) => setAiBaseUrl(e.target.value)} placeholder="http://localhost:11434" />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="search" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Search Configuration</CardTitle>
                <CardDescription>Configure the vector store for semantic search</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Vector Store</Label>
                  <Select value={searchStore} onValueChange={(v) => setSearchStore(v as SearchStore)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="memory">In-Memory</SelectItem>
                      <SelectItem value="sqlite">SQLite</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="safety" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Safety Configuration</CardTitle>
                <CardDescription>Configure security scanning for outbound emails</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="safety"
                    checked={enableSafety}
                    onChange={(e) => setEnableSafety(e.target.checked)}
                    className="rounded"
                  />
                  <Label htmlFor="safety">Enable PII & credential scanning</Label>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={saving} variant="outline">
            {saving ? 'Saving...' : 'Save Config'}
          </Button>
          <Button onClick={handleConnect} disabled={connecting}>
            {connecting ? 'Connecting...' : 'Save & Connect'}
          </Button>
          <Button onClick={handleDisconnect} variant="destructive">
            Disconnect
          </Button>
        </div>
      </div>
    </>
  );
}
