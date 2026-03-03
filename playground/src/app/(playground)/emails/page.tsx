'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/header';
import { MethodExecutor } from '@/components/playground/method-executor';
import { useEmaiExecute } from '@/hooks/use-emai-execute';
import { EmailListResult } from '@/components/playground/results/email-list-result';
import { EmailCard } from '@/components/playground/results/email-card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const API = '/api/emai/emails';

export default function EmailsPage() {
  // List
  const [listLimit, setListLimit] = useState('10');
  const [listFolder, setListFolder] = useState('');
  const [listUnread, setListUnread] = useState('');
  const list = useEmaiExecute(API, 'list');

  // Get
  const [getId, setGetId] = useState('');
  const get = useEmaiExecute(API, 'get');

  // Send
  const [sendTo, setSendTo] = useState('');
  const [sendSubject, setSendSubject] = useState('');
  const [sendText, setSendText] = useState('');
  const send = useEmaiExecute(API, 'send');

  // Manage
  const [manageId, setManageId] = useState('');
  const [manageFolder, setManageFolder] = useState('');
  const markRead = useEmaiExecute(API, 'markAsRead');
  const markUnread = useEmaiExecute(API, 'markAsUnread');
  const star = useEmaiExecute(API, 'star');
  const archive = useEmaiExecute(API, 'archive');
  const del = useEmaiExecute(API, 'delete');
  const move = useEmaiExecute(API, 'moveToFolder');

  return (
    <>
      <Header title="Emails" />
      <div className="flex flex-1 flex-col gap-6 p-6 max-w-3xl">
        <Tabs defaultValue="list">
          <TabsList>
            <TabsTrigger value="list">List</TabsTrigger>
            <TabsTrigger value="get">Get</TabsTrigger>
            <TabsTrigger value="send">Send</TabsTrigger>
            <TabsTrigger value="manage">Manage</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="mt-4">
            <MethodExecutor
              title="emails.list()"
              description="List emails with filtering and pagination"
              loading={list.loading}
              error={list.error}
              data={list.data}
              duration={list.duration}
              resultRenderer={(data) => <EmailListResult data={data} />}
              onExecute={() =>
                list.execute({
                  options: {
                    limit: Number(listLimit),
                    ...(listFolder && { folder: listFolder }),
                    ...(listUnread && { isRead: listUnread === 'unread' ? false : true }),
                  },
                })
              }
            >
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Limit</Label>
                  <Input value={listLimit} onChange={(e) => setListLimit(e.target.value)} type="number" />
                </div>
                <div>
                  <Label>Folder</Label>
                  <Input value={listFolder} onChange={(e) => setListFolder(e.target.value)} placeholder="INBOX" />
                </div>
                <div>
                  <Label>Read Status</Label>
                  <Select value={listUnread} onValueChange={setListUnread}>
                    <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="unread">Unread only</SelectItem>
                      <SelectItem value="read">Read only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </MethodExecutor>
          </TabsContent>

          <TabsContent value="get" className="mt-4">
            <MethodExecutor
              title="emails.get()"
              description="Fetch a single email by ID"
              loading={get.loading}
              error={get.error}
              data={get.data}
              duration={get.duration}
              resultRenderer={(data) => <EmailCard data={data} />}
              onExecute={() => get.execute({ id: getId })}
            >
              <div>
                <Label>Email ID</Label>
                <Input value={getId} onChange={(e) => setGetId(e.target.value)} placeholder="Enter email ID" />
              </div>
            </MethodExecutor>
          </TabsContent>

          <TabsContent value="send" className="mt-4">
            <MethodExecutor
              title="emails.send()"
              description="Send a new email"
              loading={send.loading}
              error={send.error}
              data={send.data}
              duration={send.duration}
              executeLabel="Send"
              onExecute={() =>
                send.execute({
                  options: {
                    to: sendTo,
                    subject: sendSubject,
                    text: sendText,
                  },
                })
              }
            >
              <div className="space-y-3">
                <div>
                  <Label>To</Label>
                  <Input value={sendTo} onChange={(e) => setSendTo(e.target.value)} placeholder="recipient@example.com" />
                </div>
                <div>
                  <Label>Subject</Label>
                  <Input value={sendSubject} onChange={(e) => setSendSubject(e.target.value)} placeholder="Email subject" />
                </div>
                <div>
                  <Label>Body</Label>
                  <textarea
                    className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={sendText}
                    onChange={(e) => setSendText(e.target.value)}
                    placeholder="Email body text..."
                  />
                </div>
              </div>
            </MethodExecutor>
          </TabsContent>

          <TabsContent value="manage" className="mt-4 space-y-4">
            <MethodExecutor
              title="Email Management"
              description="Mark as read/unread, star, archive, delete, or move emails"
              loading={markRead.loading || markUnread.loading || star.loading || archive.loading || del.loading || move.loading}
              error={markRead.error || markUnread.error || star.error || archive.error || del.error || move.error}
              data={markRead.data || markUnread.data || star.data || archive.data || del.data || move.data}
              duration={markRead.duration || markUnread.duration || star.duration || archive.duration || del.duration || move.duration}
              onExecute={() => {}}
            >
              <div className="space-y-3">
                <div>
                  <Label>Email ID</Label>
                  <Input value={manageId} onChange={(e) => setManageId(e.target.value)} placeholder="Enter email ID" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => markRead.execute({ emailId: manageId })}>
                    Mark Read
                  </button>
                  <button className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => markUnread.execute({ emailId: manageId })}>
                    Mark Unread
                  </button>
                  <button className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => star.execute({ emailId: manageId })}>
                    Star
                  </button>
                  <button className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => archive.execute({ emailId: manageId })}>
                    Archive
                  </button>
                  <button className="px-3 py-1.5 text-xs rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => del.execute({ emailId: manageId })}>
                    Delete
                  </button>
                </div>
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label>Move to Folder</Label>
                    <Input value={manageFolder} onChange={(e) => setManageFolder(e.target.value)} placeholder="Folder name" />
                  </div>
                  <button className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 h-9" onClick={() => move.execute({ emailId: manageId, folder: manageFolder })}>
                    Move
                  </button>
                </div>
              </div>
            </MethodExecutor>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
